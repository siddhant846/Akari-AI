/**
 * AKARI / AKARI Dual-Engine Wake Word & Voice Activation Detector (V4).
 *
 * Combines:
 * 1. Native Web Speech API (webkitSpeechRecognition) continuous phonetic matcher.
 * 2. Web Audio API Voice Activity Detector (VAD) energy stream monitor.
 * 3. Automatic browser mic permission prompt & gesture auto-recovery.
 */

// --- Minimal typed shim for the Web Speech API -------------
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | SpeechRecognitionCtor
    | null;
}

export type WakeWordState = "stopped" | "listening" | "triggered" | "error" | "needs-gesture";

export interface WakeWordOptions {
  /** Phrase to match (case-insensitive substring). */
  phrase: string;
  /** 0 (strict) .. 100 (loose). Higher = shorter debounce, more matches. */
  sensitivity?: number;
  /** Fired once when the phrase is detected. */
  onTriggered?: () => void;
  /** Fired whenever the detector state changes. */
  onState?: (state: WakeWordState) => void;
  /** Optional audio volume meter callback (0.0 to 1.0) */
  onAudioLevel?: (level: number) => void;
}

/**
 * Super-forgiving fuzzy phonetic wake-word matcher that accounts for every speech engine
 * transcription variant (e.g., "Akari" misheard as "a curry", "carry", "acari", "a kari", "okari", "hikari", "atari", etc.)
 */
export function isWakeWordMatch(rawTranscript: string, customPhrase: string): boolean {
  if (!rawTranscript) return false;

  const text = rawTranscript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const custom = customPhrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 1. Direct custom phrase match
  if (custom && text.includes(custom)) return true;

  // 2. Direct phonetic wake commands
  const directPatterns = [
    "wake up akari",
    "akari wake up",
    "hey akari",
    "hi akari",
    "hello akari",
    "ok akari",
    "yo akari",
    "wake akari",
    "akari utho",
    "akari suno",
    "akari start",
    "activate akari",
    "listen akari",
    "are you there akari",
    "akari are you there",
    "akari",
    "wake up",
    "wake up now",
    // Misheard phonetic transcriptions from Web Speech API
    "wake up a curry",
    "hey a curry",
    "hi a curry",
    "hello a curry",
    "wake up a kari",
    "hey a kari",
    "hi a kari",
    "wake up acari",
    "hey acari",
    "wake up okari",
    "hey okari",
    "wake up carry",
    "hey carry",
    "hi carry",
    "wake up a car",
    "hey a car",
    "wake up atari",
    "hey atari",
    "wake up hikari",
    "hey hikari",
    "wake up akkary",
    "hey akkary",
    "hey curry",
    "wake up curry",
    // Akari / Aegis fallbacks
    "wake up akari",
    "hey akari",
    "wake up aegis",
    "hey aegis",
    // Jr. Sidd male model activation patterns
    "wake up jr sidd",
    "wake up junior sidd",
    "wake up jr sid",
    "wake up junior sid",
    "hey jr sidd",
    "hey junior sidd",
    "hey jr sid",
    "hey junior sid",
    "hi jr sidd",
    "hi junior sidd",
    "hello jr sidd",
    "hello junior sidd",
    "ok jr sidd",
    "ok junior sidd",
    "yo jr sidd",
    "yo junior sidd",
    "jr sidd wake up",
    "junior sidd wake up",
    "jr sidd utho",
    "junior sidd utho",
    "jr sidd suno",
    "junior sidd suno",
    "jr sidd",
    "junior sidd",
    "wake up sidd",
    "hey sidd",
    "hi sidd",
    "hello sidd",
    "sidd wake up",
    "sidd utho",
    "sidd suno",
    "sidd",
    "wake up sid",
    "hey sid",
    "hi sid",
    "hello sid",
    "sid wake up",
    "wake up junior",
    "hey junior",
    "hi junior",
    "hello junior",
  ];

  for (const pattern of directPatterns) {
    if (text.includes(pattern)) return true;
  }

  // 3. Combined keyword matching: any wake-action + any Akari / Jr. Sidd phonetic equivalent
  const hasWakeKeyword =
    text.includes("wake") ||
    text.includes("hey") ||
    text.includes("hi") ||
    text.includes("hello") ||
    text.includes("ok") ||
    text.includes("yo") ||
    text.includes("uth") ||
    text.includes("suno") ||
    text.includes("listen") ||
    text.includes("activate") ||
    text.includes("start") ||
    text.includes("open");

  const hasNameKeyword =
    text.includes("akari") ||
    text.includes("acari") ||
    text.includes("okari") ||
    text.includes("hikari") ||
    text.includes("atari") ||
    text.includes("a kari") ||
    text.includes("a curry") ||
    text.includes("a carry") ||
    text.includes("carry") ||
    text.includes("akari") ||
    text.includes("aegis") ||
    text.includes("sidd") ||
    text.includes("sid") ||
    text.includes("junior") ||
    text.includes("jr");

  if (hasWakeKeyword && hasNameKeyword) return true;

  return false;
}

export class AkariWakeWordDetector {
  private recognition: SpeechRecognitionLike | null = null;
  private ctor: SpeechRecognitionCtor | null;
  private phrase = "wake up akari";
  private sensitivity = 65;
  private onTriggered: (() => void) | null = null;
  private onState: ((s: WakeWordState) => void) | null = null;
  private onAudioLevel: ((level: number) => void) | null = null;

  /** True when the detector is requested to be running. */
  private intended = false;
  /** True while speech recognition is actively listening. */
  private active = false;
  /** Guards against rapid double-fires. */
  private lastTrigger = 0;
  /** Debounce window (ms). */
  private debounceMs = 2000;
  /** Restart timer reference. */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cleanup handler for one-time user gesture listeners. */
  private gestureCleanup: (() => void) | null = null;

  // VAD Audio Meter Nodes
  private vadCtx: AudioContext | null = null;
  private vadStream: MediaStream | null = null;
  private vadInterval: any = null;

  constructor() {
    this.ctor = getSpeechRecognitionCtor();
  }

  /** Whether this browser supports speech recognition wake-word detection. */
  static isSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  /** Begin continuously listening. Safe to call repeatedly. */
  start(opts: WakeWordOptions): boolean {
    this.phrase = (opts.phrase || "wake up akari").toLowerCase().trim();
    this.sensitivity = opts.sensitivity ?? this.sensitivity;
    this.onTriggered = opts.onTriggered ?? null;
    this.onState = opts.onState ?? null;
    this.onAudioLevel = opts.onAudioLevel ?? null;
    this.debounceMs = Math.max(1200, Math.round(3000 - (this.sensitivity / 100) * 1800));
    this.intended = true;

    // Launch both native speech recognition & audio level monitor
    this.launchSpeechRecognition();
    this.launchVADMonitor();

    return true;
  }

  /** Fully stop listening and clear timers. */
  stop(): void {
    this.intended = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.gestureCleanup) {
      this.gestureCleanup();
      this.gestureCleanup = null;
    }
    this.teardownSpeech();
    this.teardownVAD();
    this.setState("stopped");
  }

  /** Change the wake phrase live. */
  setPhrase(phrase: string): void {
    this.phrase = (phrase || "wake up akari").toLowerCase().trim();
  }

  /** Change sensitivity live. */
  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0, Math.min(100, value));
    this.debounceMs = Math.max(1200, Math.round(3000 - (this.sensitivity / 100) * 1800));
  }

  // --- internals --------------------------------------------------------

  private launchSpeechRecognition(): void {
    if (!this.ctor || !this.intended) return;
    this.teardownSpeech();

    try {
      const rec = new this.ctor();
      rec.continuous = true;
      rec.interimResults = true;
      // Default to en-US for high accuracy phonetic recognition
      rec.lang = "en-US";
      rec.maxAlternatives = 5;

      rec.onstart = () => {
        this.active = true;
        this.setState("listening");
        console.log("[WakeWord] 🎙️ Speech recognition active. Say 'Hey Akari' or 'Wake up Akari'...");
      };

      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          for (let j = 0; j < res.length; j++) {
            const transcript = (res[j]?.transcript || "").toString();
            console.log(`[WakeWord Heard]: "${transcript}"`);
            if (isWakeWordMatch(transcript, this.phrase)) {
              console.log(`[WakeWord] ⚡ MATCH! Triggering Akari on: "${transcript}"`);
              this.fire();
              return;
            }
          }
        }
      };

      rec.onerror = (e: any) => {
        const err = e?.error || "unknown";
        if (err === "no-speech" || err === "aborted") return;

        console.warn("[WakeWord] Speech recognition event:", err);

        if (err === "not-allowed" || err === "service-not-allowed") {
          this.setState("needs-gesture");
          this.armGestureFallback();
          return;
        }

        this.setState("error");
      };

      rec.onend = () => {
        this.active = false;
        if (!this.intended) return;
        // Seamless immediate restart
        this.restartTimer = setTimeout(() => {
          if (this.intended) this.launchSpeechRecognition();
        }, 200);
      };

      this.recognition = rec;
      rec.start();
    } catch (e: any) {
      console.warn("[WakeWord] Speech recognition start exception:", e);
      if (e?.name === "NotAllowedError") {
        this.setState("needs-gesture");
        this.armGestureFallback();
      } else {
        this.setState("error");
        this.restartTimer = setTimeout(() => {
          if (this.intended) this.launchSpeechRecognition();
        }, 1000);
      }
    }
  }

  /**
   * Real-time Web Audio VAD level monitor to give live feedback and backup detection.
   */
  private async launchVADMonitor(): Promise<void> {
    if (typeof window === "undefined" || !this.intended) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!navigator.mediaDevices?.getUserMedia) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      if (!this.intended) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.vadStream = stream;
      this.vadCtx = new AudioCtx();
      const source = this.vadCtx.createMediaStreamSource(stream);
      const analyser = this.vadCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      if (this.vadInterval) clearInterval(this.vadInterval);
      this.vadInterval = setInterval(() => {
        if (!this.intended || !analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(1.0, avg / 128);
        this.onAudioLevel?.(normalized);
      }, 80);
    } catch (err) {
      console.log("[WakeWord VAD] Background audio monitor notice:", err);
    }
  }

  private armGestureFallback(): void {
    if (this.gestureCleanup) return;

    const onGesture = () => {
      console.log("[WakeWord] User gesture detected! Priming wake-word engine...");
      if (this.gestureCleanup) {
        this.gestureCleanup();
        this.gestureCleanup = null;
      }
      if (this.intended) {
        this.launchSpeechRecognition();
        this.launchVADMonitor();
      }
    };

    window.addEventListener("pointerdown", onGesture, { once: true, capture: true });
    window.addEventListener("keydown", onGesture, { once: true, capture: true });
    window.addEventListener("touchstart", onGesture, { once: true, capture: true });

    this.gestureCleanup = () => {
      window.removeEventListener("pointerdown", onGesture, { capture: true });
      window.removeEventListener("keydown", onGesture, { capture: true });
      window.removeEventListener("touchstart", onGesture, { capture: true });
    };
  }

  private teardownSpeech(): void {
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.onstart = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    this.active = false;
  }

  private teardownVAD(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.vadStream) {
      this.vadStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.vadStream = null;
    }
    if (this.vadCtx) {
      try {
        this.vadCtx.close();
      } catch {}
      this.vadCtx = null;
    }
  }

  public fire(): void {
    const now = Date.now();
    if (now - this.lastTrigger < this.debounceMs) return;
    this.lastTrigger = now;
    this.playActivationSound();
    this.setState("triggered");
    try {
      this.onTriggered?.();
    } catch (e) {
      console.error("[WakeWord] Trigger callback error:", e);
    }
  }

  /** Soft two-tone chime synthesized via Web Audio */
  public playActivationSound(): void {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      const now = ctx.currentTime;
      const notes = [
        { f: 659.25, t: 0 }, // E5
        { f: 880.0, t: 0.08 }, // A5
        { f: 1046.5, t: 0.16 }, // C6
      ];
      notes.forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.3, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.18);
      });
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch {}
  }

  private setState(s: WakeWordState): void {
    try {
      this.onState?.(s);
    } catch {}
  }

  /** Whether the underlying recognition is currently active. */
  get isActive(): boolean {
    return this.active;
  }
}
