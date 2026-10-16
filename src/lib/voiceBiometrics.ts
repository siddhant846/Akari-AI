/**
 * Voice Biometrics & Adaptive Speaker Identification Engine.
 * 
 * Performs real-time acoustic signal analysis (Fundamental Pitch F0,
 * Spectral Centroid, Energy Distribution) on raw 16kHz PCM microphone streams.
 * Continuously learns and refines the Owner's voiceprint across conversations,
 * and distinguishes the Owner from guests or unauthorized speakers.
 */

export interface VoiceProfile {
  meanPitch: number;        // in Hz (e.g. 110-145 Hz for male, 170-225 Hz for female)
  pitchStdDev: number;      // pitch fluctuation variance
  spectralCentroid: number; // timbre brightness / vocal tract shape
  sampleCount: number;      // total speech frames learned
  lastUpdated: number;
}

export interface SpeakerIdentificationResult {
  isOwner: boolean;
  confidence: number;      // 0.0 to 1.0 (e.g. 0.94 = 94% match)
  speakerType: "owner" | "guest" | "learning" | "ambient";
  detectedPitch: number;   // instantaneous pitch in Hz
  statusText: string;
  isTrainingActive?: boolean;
  sampleCount?: number;
  meanPitch?: number;
}

const STORAGE_KEY = "akari_voice_biometrics_v1";

export class VoiceBiometricEngine {
  private profile: VoiceProfile;
  private isCalibrating: boolean = false;
  private backgroundLearning: boolean = true;
  private calibrationSamples: { pitch: number; centroid: number }[] = [];
  private onStatusChange?: (result: SpeakerIdentificationResult) => void;
  private lastResult: SpeakerIdentificationResult = {
    isOwner: true,
    confidence: 0.95,
    speakerType: "owner",
    detectedPitch: 0,
    statusText: "Voice Biometrics Active",
    isTrainingActive: true,
    sampleCount: 0,
    meanPitch: 125,
  };

  constructor() {
    this.profile = this.loadProfile();
  }

  public setBackgroundLearning(enabled: boolean) {
    this.backgroundLearning = enabled;
  }

  public isBackgroundLearningEnabled(): boolean {
    return this.backgroundLearning;
  }

  public resetTrainingProfile(): VoiceProfile {
    this.profile = {
      meanPitch: 125,
      pitchStdDev: 20,
      spectralCentroid: 1400,
      sampleCount: 0,
      lastUpdated: Date.now()
    };
    this.saveProfile();
    return this.profile;
  }

  public setStatusCallback(cb: (result: SpeakerIdentificationResult) => void) {
    this.onStatusChange = cb;
  }

  public getLastResult(): SpeakerIdentificationResult {
    return this.lastResult;
  }

  public getProfile(): VoiceProfile {
    return this.profile;
  }

  public startCalibration() {
    this.isCalibrating = true;
    this.calibrationSamples = [];
  }

  public finishCalibration(): VoiceProfile {
    this.isCalibrating = false;
    if (this.calibrationSamples.length > 5) {
      const pitches = this.calibrationSamples.map(s => s.pitch);
      const centroids = this.calibrationSamples.map(s => s.centroid);

      const meanPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const meanCentroid = centroids.reduce((a, b) => a + b, 0) / centroids.length;
      const variance = pitches.reduce((sum, p) => sum + Math.pow(p - meanPitch, 2), 0) / pitches.length;
      const stdDev = Math.sqrt(variance);

      this.profile = {
        meanPitch: Math.round(meanPitch),
        pitchStdDev: Math.round(stdDev) || 18,
        spectralCentroid: Math.round(meanCentroid),
        sampleCount: this.calibrationSamples.length,
        lastUpdated: Date.now()
      };
      this.saveProfile();
    }
    return this.profile;
  }

  /**
   * Analyzes an incoming 16kHz Float32 or Int16 audio buffer frame.
   */
  public processAudioFrame(samples: Float32Array | Int16Array, sampleRate: number = 16000): SpeakerIdentificationResult {
    // 1. Convert to normalized float array [-1.0, 1.0] if Int16
    let floatBuffer: Float32Array;
    if (samples instanceof Int16Array) {
      floatBuffer = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        floatBuffer[i] = samples[i] / 32768.0;
      }
    } else {
      floatBuffer = samples;
    }

    // 2. Compute RMS Energy (filter out silence / ambient fan noise)
    let sumSquares = 0;
    for (let i = 0; i < floatBuffer.length; i++) {
      sumSquares += floatBuffer[i] * floatBuffer[i];
    }
    const rms = Math.sqrt(sumSquares / floatBuffer.length);

    // Below speech threshold
    if (rms < 0.015) {
      return {
        isOwner: true,
        confidence: this.lastResult.confidence,
        speakerType: "ambient",
        detectedPitch: 0,
        statusText: "Ambient / Silent"
      };
    }

    // 3. Autocorrelation Pitch Extraction (F0)
    const pitch = this.detectPitchAutocorrelation(floatBuffer, sampleRate);
    if (pitch < 60 || pitch > 450) {
      // Unvoiced consonant or noise frame
      return this.lastResult;
    }

    // 4. Spectral Centroid calculation (brightness/timbre)
    const centroid = this.calculateSpectralCentroid(floatBuffer, sampleRate);

    // If currently in calibration mode, collect sample
    if (this.isCalibrating) {
      this.calibrationSamples.push({ pitch, centroid });
      const res: SpeakerIdentificationResult = {
        isOwner: true,
        confidence: 0.99,
        speakerType: "learning",
        detectedPitch: pitch,
        statusText: `Calibrating voiceprint (${this.calibrationSamples.length} samples)...`
      };
      this.lastResult = res;
      if (this.onStatusChange) this.onStatusChange(res);
      return res;
    }

    // 5. Compare against Owner Profile
    let confidence = 0.90;
    let isOwner = true;

    if (this.profile.sampleCount > 0) {
      const pitchDiff = Math.abs(pitch - this.profile.meanPitch);
      const centroidDiff = Math.abs(centroid - this.profile.spectralCentroid);

      // Pitch score (normal voice fluctuates within ~2-3 stdDevs)
      const allowedPitchRange = Math.max(35, this.profile.pitchStdDev * 2.5);
      let pitchScore = Math.max(0, 1.0 - (pitchDiff / allowedPitchRange));

      // Spectral timbre score
      let timbreScore = Math.max(0, 1.0 - (centroidDiff / 1200));

      confidence = (pitchScore * 0.65) + (timbreScore * 0.35);

      if (confidence >= 0.68) {
        isOwner = true;
        // Adaptive continuous learning: gently nudge profile weights if training mode is active
        if (this.backgroundLearning) {
          this.adaptProfile(pitch, centroid);
        }
      } else {
        isOwner = false;
      }
    } else {
      // Auto-enroll on first session if not calibrated yet
      this.profile = {
        meanPitch: Math.round(pitch),
        pitchStdDev: 22,
        spectralCentroid: Math.round(centroid),
        sampleCount: 1,
        lastUpdated: Date.now()
      };
      this.saveProfile();
    }

    const speakerType = isOwner ? "owner" : "guest";
    const statusText = isOwner
      ? `Owner Verified (${Math.round(confidence * 100)}% match, ${Math.round(pitch)} Hz)${this.backgroundLearning ? " [Training]" : " [Locked]"}`
      : `Unrecognized Voice (${Math.round(confidence * 100)}% match, ${Math.round(pitch)} Hz)`;

    const result: SpeakerIdentificationResult = {
      isOwner,
      confidence: Math.round(confidence * 100) / 100,
      speakerType,
      detectedPitch: Math.round(pitch),
      statusText,
      isTrainingActive: this.backgroundLearning,
      sampleCount: this.profile.sampleCount,
      meanPitch: Math.round(this.profile.meanPitch),
    };

    this.lastResult = result;
    if (this.onStatusChange) {
      this.onStatusChange(result);
    }

    return result;
  }

  private adaptProfile(pitch: number, centroid: number) {
    const alpha = 0.02; // Slow exponential moving average for smooth adaptation
    this.profile.meanPitch = (1 - alpha) * this.profile.meanPitch + alpha * pitch;
    this.profile.spectralCentroid = (1 - alpha) * this.profile.spectralCentroid + alpha * centroid;
    this.profile.sampleCount += 1;
    
    // Save to disk every 100 samples
    if (this.profile.sampleCount % 100 === 0) {
      this.profile.lastUpdated = Date.now();
      this.saveProfile();
    }
  }

  private detectPitchAutocorrelation(buffer: Float32Array, sampleRate: number): number {
    const SIZE = buffer.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return 0;

    let lastCorrelation = 1;
    for (let offset = Math.floor(sampleRate / 450); offset < Math.floor(sampleRate / 65); offset++) {
      let correlation = 0;
      for (let i = 0; i < MAX_SAMPLES; i++) {
        correlation += Math.abs(buffer[i] - buffer[i + offset]);
      }
      correlation = 1 - (correlation / MAX_SAMPLES);

      if (correlation > 0.85 && correlation > lastCorrelation) {
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      }
      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.75 && bestOffset > 0) {
      return sampleRate / bestOffset;
    }
    return 0;
  }

  private calculateSpectralCentroid(buffer: Float32Array, sampleRate: number): number {
    // Simplified time-domain zero-crossing & frequency centroid estimate
    let zeroCrossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = (zeroCrossings * sampleRate) / (2 * buffer.length);
    return Math.min(4000, Math.max(300, zcr * 1.5));
  }

  private loadProfile(): VoiceProfile {
    if (typeof window === "undefined") {
      return { meanPitch: 125, pitchStdDev: 20, spectralCentroid: 1400, sampleCount: 0, lastUpdated: 0 };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { meanPitch: 125, pitchStdDev: 20, spectralCentroid: 1400, sampleCount: 0, lastUpdated: 0 };
  }

  public saveProfile() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {}
  }
}

export const globalVoiceBiometrics = new VoiceBiometricEngine();
