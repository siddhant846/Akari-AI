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
  private analysisWindow: Float32Array = new Float32Array(2048);
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
      pitchStdDev: 25,
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
        pitchStdDev: Math.max(22, Math.round(stdDev)),
        spectralCentroid: Math.round(meanCentroid),
        sampleCount: Math.max(50, this.calibrationSamples.length),
        lastUpdated: Date.now()
      };
      this.saveProfile();
    }
    return this.profile;
  }

  /**
   * Analyzes an incoming Float32 or Int16 audio buffer frame at actual hardware sampleRate.
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

    // 2. Push frame into 2048-sample analysis ring buffer for accurate F0 detection across all sample rates
    const len = floatBuffer.length;
    if (len < this.analysisWindow.length) {
      this.analysisWindow.copyWithin(0, len);
      this.analysisWindow.set(floatBuffer, this.analysisWindow.length - len);
    } else {
      this.analysisWindow.set(floatBuffer.subarray(len - this.analysisWindow.length));
    }

    // 3. Compute RMS Energy (filter out silence / ambient fan noise)
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

    // 4. Autocorrelation Pitch Extraction (F0) on the full 2048 analysis window
    const pitch = this.detectPitchAutocorrelation(this.analysisWindow, sampleRate);
    if (pitch < 55 || pitch > 480) {
      // Unvoiced consonant or noise frame — retain previous verification state
      return this.lastResult;
    }

    // 5. Spectral Centroid calculation (brightness/timbre)
    const centroid = this.calculateSpectralCentroid(this.analysisWindow, sampleRate);

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

    // 6. Compare against Owner Profile with Adaptive Learning
    let confidence = 0.95;
    let isOwner = true;

    // Active Enrollment Phase: if under 40 samples, adapt seamlessly to the user speaking at this workstation
    if (this.profile.sampleCount < 40) {
      isOwner = true;
      confidence = 0.95;
      this.adaptProfile(pitch, centroid);
    } else {
      const pitchDiff = Math.abs(pitch - this.profile.meanPitch);
      const centroidDiff = Math.abs(centroid - this.profile.spectralCentroid);

      // Pitch score: allow normal natural human inflection (wide variance up to 3.5 stdDevs or 65Hz)
      const allowedPitchRange = Math.max(65, this.profile.pitchStdDev * 3.5);
      const pitchScore = Math.max(0, 1.0 - (pitchDiff / allowedPitchRange));

      // Spectral timbre score
      const timbreScore = Math.max(0, 1.0 - (centroidDiff / 1600));

      confidence = (pitchScore * 0.55) + (timbreScore * 0.45);

      if (confidence >= 0.48) {
        isOwner = true;
        // Continuous adaptive learning: smoothly refine vocal model
        if (this.backgroundLearning) {
          this.adaptProfile(pitch, centroid);
        }
      } else {
        // Only classify as guest if there is a severe mismatch
        isOwner = false;
      }
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
    const alpha = 0.03; // Smooth adaptive learning
    this.profile.meanPitch = (1 - alpha) * this.profile.meanPitch + alpha * pitch;
    this.profile.spectralCentroid = (1 - alpha) * this.profile.spectralCentroid + alpha * centroid;
    this.profile.sampleCount += 1;
    
    // Save to disk every 50 samples
    if (this.profile.sampleCount % 50 === 0) {
      this.profile.lastUpdated = Date.now();
      this.saveProfile();
    }
  }

  private detectPitchAutocorrelation(buffer: Float32Array, sampleRate: number): number {
    const SIZE = buffer.length;
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return 0;

    const minOffset = Math.max(2, Math.floor(sampleRate / 450));
    const maxOffset = Math.min(Math.floor(sampleRate / 55), Math.floor(SIZE / 2));
    const MAX_SAMPLES = SIZE - maxOffset;
    if (MAX_SAMPLES <= 0) return 0;

    let lastCorrelation = 1;
    for (let offset = minOffset; offset < maxOffset; offset++) {
      let diff = 0;
      for (let i = 0; i < MAX_SAMPLES; i++) {
        diff += Math.abs(buffer[i] - buffer[i + offset]);
      }
      const correlation = 1 - (diff / MAX_SAMPLES);

      if (correlation > 0.80 && correlation > lastCorrelation) {
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      }
      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.70 && bestOffset > 0) {
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
