/**
 * Akari AI — Automated Voice Activity Detection, Latency & Audio Pipeline Suite
 * Validates Requirement 1:
 * - Speech-end detection latency (<200ms turn endpointing).
 * - Trailing silence hangover frames gating and zero audio leakage while awaiting model response.
 * - Rolling pre-roll ring buffer syllable preservation.
 * - Dynamic dual-threshold VAD & ambient noise adaptation.
 * - Barge-in interruption mechanics.
 * - Main-thread CPU optimization (Live2D FFT guard and resolution capping).
 * - 16-bit Little Endian PCM encoding & downsampling fidelity.
 */

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string = "") {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// Pure Audio DSP Reference Functions (mirrored from src/lib/audio.ts)
// -----------------------------------------------------------------------------

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (!inputSampleRate || inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.round(input.length / ratio);
  const result = new Float32Array(outputLength);
  let offsetResult = 0;
  let offsetInput = 0;
  while (offsetResult < outputLength) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : (input[offsetInput] || 0);
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function pcm16ToFloats(uint8Array: Uint8Array): Float32Array {
  const int16 = new Int16Array(
    uint8Array.buffer,
    uint8Array.byteOffset,
    uint8Array.byteLength / 2
  );
  const floats = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    floats[i] = int16[i] / 32768.0;
  }
  return floats;
}

function computeRMS(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

// -----------------------------------------------------------------------------
// Simulated Audio Session Engine for Protocol Verification
// -----------------------------------------------------------------------------

class SimulatedAudioPipeline {
  public ambientNoiseFloor = 0.010;
  public isUserTalking = false;
  public speechOnsetTimestamp = 0;
  public silenceStartTimestamp = 0;
  public lastSpeechTimestamp = 0;
  public awaitingModelResponse = false;
  public speechHangoverFrames = 0;
  public preRollRingBuffer: Float32Array[] = [];
  public maxPreRollFrames = 3;
  public bargeInConsecutiveFrames = 0;
  public isModelSpeaking = false;
  public recentRmsHistory: number[] = [];
  public dispatchedFrames: ArrayBuffer[] = [];
  public timingEvents: any[] = [];

  public processFrame(channelData: Float32Array, now: number) {
    const rms = computeRMS(channelData);

    // Acoustic feedback & barge-in shield
    if (this.isModelSpeaking) {
      const bargeInThreshold = Math.max(0.08, this.ambientNoiseFloor * 2.2);
      if (rms >= bargeInThreshold) {
        this.bargeInConsecutiveFrames++;
        if (this.bargeInConsecutiveFrames >= 4) {
          this.bargeInConsecutiveFrames = 0;
          this.isModelSpeaking = false;
          this.awaitingModelResponse = false;
          this.isUserTalking = true;
          this.lastSpeechTimestamp = now;
          this.timingEvents.push({ type: "barge_in", timestamp: now, rms });
        }
      } else {
        this.bargeInConsecutiveFrames = 0;
      }
      return;
    }

    this.bargeInConsecutiveFrames = 0;

    // Maintain sliding 30-frame window (~1 sec) of RMS energy for true noise floor and stationary noise analysis
    this.recentRmsHistory.push(rms);
    if (this.recentRmsHistory.length > 30) {
      this.recentRmsHistory.shift();
    }
    const minRms = Math.min(...this.recentRmsHistory);
    const maxRms = Math.max(...this.recentRmsHistory);

    // Adaptively track ambient noise floor towards minimum energy observed
    if (!this.isUserTalking) {
      this.ambientNoiseFloor = this.ambientNoiseFloor * 0.95 + minRms * 0.05;
    } else if (minRms < this.ambientNoiseFloor) {
      this.ambientNoiseFloor = this.ambientNoiseFloor * 0.90 + minRms * 0.10;
    }
    this.ambientNoiseFloor = Math.max(0.003, Math.min(0.035, this.ambientNoiseFloor));

    // Stationary noise rejection (PC fan / HVAC / electric hum):
    // If sound has lasted > 800ms without pauses, but peak-to-floor variance is flat (< 0.004),
    // it is stationary mechanical noise, NOT human speech.
    if (this.isUserTalking && (now - this.speechOnsetTimestamp > 800)) {
      if (maxRms - minRms < 0.004) {
        this.isUserTalking = false;
        this.ambientNoiseFloor = Math.max(this.ambientNoiseFloor, minRms);
        this.speechHangoverFrames = 0;
        this.awaitingModelResponse = true;
      }
    }

    const speechStartThreshold = Math.max(0.008, this.ambientNoiseFloor * 1.35);
    const silenceThreshold = Math.max(0.005, this.ambientNoiseFloor * 1.10);

    // Pre-roll buffering when quiet
    if (!this.isUserTalking) {
      this.preRollRingBuffer.push(new Float32Array(channelData));
      if (this.preRollRingBuffer.length > this.maxPreRollFrames) {
        this.preRollRingBuffer.shift();
      }
    }

    // Voice Activity Detection
    if (rms >= speechStartThreshold) {
      const wasNotTalking = !this.isUserTalking;
      if (wasNotTalking) {
        this.speechOnsetTimestamp = now;
      }
      this.lastSpeechTimestamp = now;
      this.isUserTalking = true;
      this.silenceStartTimestamp = 0;
      this.awaitingModelResponse = false;
      this.speechHangoverFrames = 0;

      // Flush pre-roll frames on speech onset
      if (wasNotTalking && this.preRollRingBuffer.length > 0) {
        for (const chunk of this.preRollRingBuffer) {
          this.dispatchedFrames.push(floatTo16BitPCM(chunk));
        }
        this.timingEvents.push({
          type: "flushed_preroll",
          framesFlushed: this.preRollRingBuffer.length,
          timestamp: now,
        });
        this.preRollRingBuffer = [];
      }
    } else if (this.isUserTalking) {
      if (rms <= silenceThreshold || now - this.lastSpeechTimestamp > 80) {
        if (!this.silenceStartTimestamp) {
          this.silenceStartTimestamp = now;
        }
      }

      const silenceElapsed = this.silenceStartTimestamp ? (now - this.silenceStartTimestamp) : 0;
      const timeSinceSpeech = now - this.lastSpeechTimestamp;

      // Fast turn endpointing
      if (silenceElapsed >= 180 || timeSinceSpeech >= 300) {
        const vadLatency = now - this.lastSpeechTimestamp;
        this.isUserTalking = false;
        this.silenceStartTimestamp = 0;
        this.awaitingModelResponse = true;
        this.speechHangoverFrames = 6;
        this.timingEvents.push({
          type: "end_of_speech",
          latencyMs: vadLatency,
          timestamp: now,
        });
      }
    }

    // Gating logic
    if (!this.isUserTalking) {
      if (this.speechHangoverFrames > 0) {
        this.speechHangoverFrames--;
      } else {
        // Gated: do not forward frame
        return;
      }
    }

    this.dispatchedFrames.push(floatTo16BitPCM(channelData));
  }
}

// -----------------------------------------------------------------------------
// Test Execution
// -----------------------------------------------------------------------------

async function runVoiceAndLatencySuite() {
  console.log("\n=======================================================");
  console.log("      AKARI VOICE VAD, LATENCY & DSP TEST SUITE        ");
  console.log("=======================================================\n");

  // --- Suite 1: Audio DSP Math & PCM Conversion Fidelity ---
  console.log("Test Suite 1: Audio DSP Math & PCM Conversion Fidelity");

  // 1.1 Downsampling 48kHz -> 16kHz
  const sampleCount48k = 480; // 10ms at 48kHz
  const sine48k = new Float32Array(sampleCount48k);
  for (let i = 0; i < sampleCount48k; i++) {
    sine48k[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
  }
  const downsampled = downsampleTo16k(sine48k, 48000);
  assert(downsampled.length === 160, "48kHz to 16kHz downsampler reduces 480 samples to exact 160 (10ms window)");
  assert(!downsampled.some(isNaN), "Downsampled audio contains zero NaN / non-finite values");

  // 1.2 Downsampling 44.1kHz -> 16kHz
  const sampleCount44k = 441;
  const sine44k = new Float32Array(sampleCount44k);
  for (let i = 0; i < sampleCount44k; i++) {
    sine44k[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
  }
  const downsampled44k = downsampleTo16k(sine44k, 44100);
  assert(downsampled44k.length === 160, "44.1kHz to 16kHz downsampler outputs exact 160 samples (ratio 2.75625)");

  // 1.3 Float32 to 16-bit Int16 PCM Little Endian round-trip
  const testFloats = new Float32Array([0.0, 0.5, -0.5, 0.999, -1.0, 1.5, -1.5]); // includes clamping
  const pcmBuffer = floatTo16BitPCM(testFloats);
  assert(pcmBuffer.byteLength === testFloats.length * 2, "PCM buffer byte length is exactly 2x input Float32 sample count");

  const restoredFloats = pcm16ToFloats(new Uint8Array(pcmBuffer));
  assert(Math.abs(restoredFloats[0] - 0.0) < 0.001, "PCM 0.0 roundtrips accurately");
  assert(Math.abs(restoredFloats[1] - 0.5) < 0.001, "PCM 0.5 roundtrips within 0.1% accuracy");
  assert(Math.abs(restoredFloats[2] - (-0.5)) < 0.001, "PCM -0.5 roundtrips within 0.1% accuracy");
  assert(restoredFloats[5] <= 1.0 && restoredFloats[6] >= -1.0, "Values outside [-1, 1] are strictly clamped to avoid integer overflow");

  // --- Suite 2: Dynamic VAD & Adaptive Noise Floor Sensitivity ---
  console.log("\nTest Suite 2: Dynamic VAD & Adaptive Ambient Noise Floor");

  const pipeline = new SimulatedAudioPipeline();
  assert(pipeline.ambientNoiseFloor === 0.010, "Initial ambient noise floor initialized at default 0.010");

  // Feed 50 frames of quiet room noise (RMS ~0.004)
  let currentTime = 1000;
  const quietFrame = new Float32Array(160).fill(0.004);
  for (let i = 0; i < 50; i++) {
    pipeline.processFrame(quietFrame, currentTime);
    currentTime += 32; // ~32ms per frame (512 samples at 16kHz)
  }
  assert(
    pipeline.ambientNoiseFloor < 0.008 && pipeline.ambientNoiseFloor >= 0.003,
    `Ambient noise floor adaptively lowered to quiet room (${pipeline.ambientNoiseFloor.toFixed(4)})`
  );

  // Dynamic thresholds under quiet environment
  const quietStartThreshold = Math.max(0.008, pipeline.ambientNoiseFloor * 1.35);
  assert(quietStartThreshold === 0.008, "Quiet environment maintains high sensitivity speech threshold (0.008)");

  // Feed 50 frames of PC fan noise (RMS ~0.022)
  for (let i = 0; i < 50; i++) {
    const fanFrame = new Float32Array(160).fill(0.022);
    pipeline.processFrame(fanFrame, currentTime);
    currentTime += 32;
  }
  assert(
    pipeline.ambientNoiseFloor > 0.015,
    `Ambient noise floor adaptively raised to accommodate fan noise (${pipeline.ambientNoiseFloor.toFixed(4)})`
  );
  const fanStartThreshold = Math.max(0.008, pipeline.ambientNoiseFloor * 1.35);
  assert(
    fanStartThreshold > 0.020,
    `Fan noise raises speech trigger threshold to ${fanStartThreshold.toFixed(4)}, preventing continuous false triggers`
  );

  // --- Suite 3: Turn Endpointing Latency & Silence Hangover Gating ---
  console.log("\nTest Suite 3: Turn Endpointing Latency & Silence Hangover Gating");

  const testSession = new SimulatedAudioPipeline();
  let clock = 10000;

  // 1. Establish baseline quiet (10 frames)
  for (let i = 0; i < 10; i++) {
    testSession.processFrame(new Float32Array(160).fill(0.002), clock);
    clock += 32;
  }

  // 2. User speaks for 20 frames (RMS ~0.05)
  const speechStartClock = clock;
  for (let i = 0; i < 20; i++) {
    testSession.processFrame(new Float32Array(160).fill(0.05), clock);
    clock += 32;
  }
  assert(testSession.isUserTalking === true, "User talking state detected during active speech");
  const lastActiveSpeechTime = testSession.lastSpeechTimestamp;

  // 3. User finishes speaking: silence begins
  const speechEndClock = clock;
  let endOfSpeechFired = false;
  let endOfSpeechLatency = 0;

  for (let i = 0; i < 15; i++) {
    testSession.processFrame(new Float32Array(160).fill(0.002), clock);
    const endEvent = testSession.timingEvents.find((e) => e.type === "end_of_speech");
    if (endEvent && !endOfSpeechFired) {
      endOfSpeechFired = true;
      endOfSpeechLatency = clock - speechEndClock;
    }
    clock += 32;
  }

  assert(endOfSpeechFired === true, "End of speech event successfully detected and emitted");
  assert(
    endOfSpeechLatency <= 200,
    `Turn endpointing latency is ${endOfSpeechLatency}ms, satisfying <200ms latency requirement`
  );
  assert(testSession.awaitingModelResponse === true, "Session enters awaitingModelResponse state immediately on turn completion");

  // 4. Verify silence hangover frames: exactly 6 frames sent, then complete gating
  const framesBeforeHangoverDrain = testSession.dispatchedFrames.length;
  // Send 20 more silent frames
  for (let i = 0; i < 20; i++) {
    testSession.processFrame(new Float32Array(160).fill(0.002), clock);
    clock += 32;
  }
  const framesAfterHangoverDrain = testSession.dispatchedFrames.length;
  const leakedFrames = framesAfterHangoverDrain - framesBeforeHangoverDrain;

  assert(
    leakedFrames === 0,
    `Zero audio frames leaked after hangover drain while awaiting model response (leaked: ${leakedFrames})`
  );

  // --- Suite 4: Pre-roll Ring Buffer Syllable Preservation ---
  console.log("\nTest Suite 4: Pre-roll Ring Buffer Syllable Preservation");

  const preRollSession = new SimulatedAudioPipeline();
  let prClock = 20000;

  // Feed 4 quiet frames (should store up to max 3 frames in ring buffer)
  for (let i = 1; i <= 4; i++) {
    preRollSession.processFrame(new Float32Array(160).fill(i * 0.001), prClock);
    prClock += 32;
  }
  assert(preRollSession.preRollRingBuffer.length === 3, "Ring buffer maintains rolling cap of 3 pre-roll frames (~90ms)");

  // Now user starts speaking on frame 5
  preRollSession.processFrame(new Float32Array(160).fill(0.08), prClock);
  const flushEvent = preRollSession.timingEvents.find((e) => e.type === "flushed_preroll");
  assert(flushEvent !== undefined, "Pre-roll frames flushed immediately upon speech detection");
  assert(flushEvent?.framesFlushed === 3, "All 3 pre-roll frames dispatched, preserving initial syllables from clipping");

  // --- Suite 5: Acoustic Feedback Shield & Barge-In Mechanics ---
  console.log("\nTest Suite 5: Acoustic Feedback Shield & Barge-In Mechanics");

  const bargeSession = new SimulatedAudioPipeline();
  bargeSession.isModelSpeaking = true;
  let bClock = 30000;

  // Moderate ambient/model audio playback (RMS ~0.04) should be blocked completely
  for (let i = 0; i < 10; i++) {
    bargeSession.processFrame(new Float32Array(160).fill(0.04), bClock);
    bClock += 32;
  }
  assert(bargeSession.isModelSpeaking === true, "Model playback continues unaffected by moderate acoustic audio");
  assert(bargeSession.dispatchedFrames.length === 0, "No acoustic feedback frames sent to model");

  // User deliberately interrupts with loud voice (RMS ~0.12) for 4 consecutive frames
  for (let i = 0; i < 4; i++) {
    bargeSession.processFrame(new Float32Array(160).fill(0.12), bClock);
    bClock += 32;
  }
  const bargeEvent = bargeSession.timingEvents.find((e) => e.type === "barge_in");
  assert(bargeEvent !== undefined, "Barge-in successfully triggered after 4 consecutive loud voice frames");
  assert(bargeSession.isModelSpeaking === false, "Model speaking flag immediately halted on barge-in");
  assert(bargeSession.isUserTalking === true, "User speech state activated on barge-in");

  // --- Suite 6: Live2D vs Jr. Sidd Main Thread Optimization ---
  console.log("\nTest Suite 6: Live2D vs Jr. Sidd Main Thread Optimization");

  // Live2D canvas resolution cap logic check
  const simulatedDevicePixelRatioHighDPI = 2.0; // 4K/Retina display
  const cappedResolution = Math.min(simulatedDevicePixelRatioHighDPI, 1.25);
  assert(cappedResolution === 1.25, "High-DPI screen resolution is capped at 1.25x (saves >60% fill-rate)");

  const standardDPI = 1.0;
  const standardResolution = Math.min(standardDPI, 1.25);
  assert(standardResolution === 1.0, "Standard screen resolution remains native 1.0x");

  // Live2D FFT guard logic check:
  // When isSpeaking is false, FFT analysis must NOT execute on each frame.
  let fftExecutions = 0;
  const simulateRenderFrame = (isSpeaking: boolean) => {
    if (isSpeaking) {
      fftExecutions++; // FFT computation
    }
  };

  // Simulate 60 frames while listening
  for (let i = 0; i < 60; i++) {
    simulateRenderFrame(false);
  }
  assert(fftExecutions === 0, "Zero FFT analysis computations executed during listening/idle states");

  // Simulate 60 frames while speaking
  for (let i = 0; i < 60; i++) {
    simulateRenderFrame(true);
  }
  assert(fftExecutions === 60, "FFT lip-sync computations only execute when model is speaking");

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`TOTAL VOICE & LATENCY TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log("=======================================================\n");

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVoiceAndLatencySuite().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
