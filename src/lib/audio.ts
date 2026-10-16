/**
 * Audio handling utility for Akari Live API Voice stream.
 * Handles:
 * - 16kHz layout sampling for microphone stream.
 * - Raw Little Endian Int16 PCM translation.
 * - 24kHz layout output sampling for model voice playback.
 * - Gapless double-buffer queue scheduler with 40ms adaptive jitter cushion.
 * - Persistent microphone stream with automatic reconnect to prevent mic drops.
 * - Interrupt signal immediate stop.
 * - Input & Output AnalyserNodes for real-time waveform visuals.
 */

import { getVTubeStudioClient } from "./vtsClient";
import { globalVoiceBiometrics, SpeakerIdentificationResult } from "./voiceBiometrics";
import { getWsBaseUrl } from "./network";

export type LiveState = "disconnected" | "connecting" | "listening" | "speaking";

// PCM Conversion Helper: converts Float32Array [-1.0, 1.0] to signed Int16 Raw PCM Little Endian
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

// Float conversion helper: converts signed Int16 array buffer to Float32Array [-1.0, 1.0]
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

// Convert ArrayBuffer to Base64 String
function base64ArrayBuffer(arrayBuffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert Base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class AkariAudioSession {
  private ws: WebSocket | null = null;

  // Audio contexts (separate to match exact required sample rates)
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;

  // Audio sources & processors
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micProcessorNode: ScriptProcessorNode | null = null;

  // Visualisers
  public inputAnalyser: AnalyserNode | null = null;
  public outputAnalyser: AnalyserNode | null = null;
  private outputGainNode: GainNode | null = null;

  // Buffering / Playback details
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  // State Callbacks
  private onStateChange: (state: LiveState) => void;
  private onTranscription: (role: "user" | "model", text: string) => void;
  private onToolCall: (name: string, args: any, callback: (result: any) => void) => void;
  private onError: (error: string) => void;
  private onMemorySync?: (memories: any[]) => void;
  private onReminder?: (text: string, id: string) => void;
  private onTerminalOutput?: (tool: string, args: any, output: string) => void;
  private onClientAction?: (action: string, payload: any) => void;
  private onSpeakerChange?: (result: SpeakerIdentificationResult) => void;

  private currentState: LiveState = "disconnected";
  private isActivated = false;
  private isReconnecting = false;
  private reconnectTimeout: any = null;
  private speechEndTimer: any = null;
  private lastSpeakerBroadcastTime = 0;

  private lowBandwidthMode = false;
  private speechHangoverFrames = 0;
  private isModelTurnComplete = true;
  private bargeInConsecutiveFrames = 0;

  // Saved connection parameters for seamless auto-reconnect
  private lastVoice?: string;
  private lastAvatarStyle?: "character" | "orb" | "vts" | "jrsidd" | string;
  private lastOwnerName?: string;
  private lastSpeakerRecognition?: boolean;

  private vtsSyncInterval: any = null;

  constructor(handlers: {
    onStateChange: (state: LiveState) => void;
    onTranscription: (role: "user" | "model", text: string) => void;
    onToolCall: (name: string, args: any, callback: (result: any) => void) => void;
    onError: (error: string) => void;
    onMemorySync?: (memories: any[]) => void;
    onReminder?: (text: string, id: string) => void;
    onTerminalOutput?: (tool: string, args: any, output: string) => void;
    onClientAction?: (action: string, payload: any) => void;
    onSpeakerChange?: (result: SpeakerIdentificationResult) => void;
  }) {
    this.onStateChange = handlers.onStateChange;
    this.onTranscription = handlers.onTranscription;
    this.onToolCall = handlers.onToolCall;
    this.onError = handlers.onError;
    this.onMemorySync = handlers.onMemorySync;
    this.onReminder = handlers.onReminder;
    this.onTerminalOutput = handlers.onTerminalOutput;
    this.onClientAction = handlers.onClientAction;
    this.onSpeakerChange = handlers.onSpeakerChange;
  }

  private setState(state: LiveState) {
    this.currentState = state;
    this.onStateChange(state);
  }

  public getState(): LiveState {
    return this.currentState;
  }

  /**
   * Pushes a compressed JPEG base64 screenshot frame directly to the live WebSocket server.
   */
  public sendVideoFrame(base64Data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentState !== "disconnected") {
      this.ws.send(JSON.stringify({ type: "video", video: base64Data }));
    }
  }

  // Requests microphone and creates connections
  public async connect(
    voice?: string,
    avatarStyle?: "character" | "orb" | "vts" | "jrsidd" | string,
    ownerName?: string,
    speakerRecognition?: boolean
  ) {
    if (this.isActivated) return;
    this.isActivated = true;
    this.isReconnecting = false;

    this.lastVoice = voice;
    this.lastAvatarStyle = avatarStyle;
    this.lastOwnerName = ownerName;
    this.lastSpeakerRecognition = speakerRecognition;

    this.setState("connecting");
    await this.initAudioAndWebSocket();
  }

  /**
   * Updates neural voice selection dynamically without dropping microphone capture.
   */
  public updateVoice(newVoice: string) {
    if (!newVoice || this.lastVoice === newVoice) return;
    this.lastVoice = newVoice;
    if (this.isActivated && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[Akari Audio] Updating active neural voice to: ${newVoice}`);
      this.connectWebSocket();
    }
  }

  /**
   * Updates avatar style and persona dynamically on active session
   */
  public updateAvatarStyle(newAvatar: "character" | "orb" | "vts" | "jrsidd" | string) {
    if (!newAvatar || this.lastAvatarStyle === newAvatar) return;
    this.lastAvatarStyle = newAvatar;
    if (this.isActivated && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[Akari Audio] Updating active avatar style to: ${newAvatar}`);
      this.connectWebSocket();
    }
  }

  /**
   * Toggles Low-Bandwidth Mode (Data Saver & VAD Silence Suppression)
   */
  public setLowBandwidthMode(enabled: boolean) {
    this.lowBandwidthMode = enabled;
    console.log(`[Akari Audio] Low-Bandwidth Mode: ${enabled ? "ACTIVE (Data Saver & Silence Suppression)" : "STANDARD"}`);
  }

  private async initAudioAndWebSocket() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API missing in browser.");
      }

      // Initialize or resume AudioContexts
      if (!this.inputAudioCtx || this.inputAudioCtx.state === "closed") {
        this.inputAudioCtx = new AudioContextClass({ sampleRate: 16000 });
      }
      if (!this.outputAudioCtx || this.outputAudioCtx.state === "closed") {
        this.outputAudioCtx = new AudioContextClass({ sampleRate: 24000 });
      }

      if (this.inputAudioCtx.state === "suspended") {
        await this.inputAudioCtx.resume().catch(() => {});
      }
      if (this.outputAudioCtx.state === "suspended") {
        await this.outputAudioCtx.resume().catch(() => {});
      }

      // Setup output analyser & gain
      if (!this.outputGainNode) {
        this.outputGainNode = this.outputAudioCtx.createGain();
        this.outputAnalyser = this.outputAudioCtx.createAnalyser();
        this.outputAnalyser.fftSize = 256;
        this.outputAnalyser.smoothingTimeConstant = 0.3;
        this.outputGainNode.connect(this.outputAnalyser);
        this.outputAnalyser.connect(this.outputAudioCtx.destination);
      }

      // Obtain or reuse user microphone stream
      if (!this.micStream || this.micStream.getAudioTracks().every((t) => t.readyState === "ended")) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      // Ensure all tracks are enabled
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      if (!this.isActivated) {
        this.micStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
        return;
      }

      // Setup input analyser
      if (!this.inputAnalyser) {
        this.inputAnalyser = this.inputAudioCtx.createAnalyser();
        this.inputAnalyser.fftSize = 256;
        this.inputAnalyser.smoothingTimeConstant = 0.3;
      }

      if (!this.micSourceNode) {
        this.micSourceNode = this.inputAudioCtx.createMediaStreamSource(this.micStream);
        this.micSourceNode.connect(this.inputAnalyser);
      }

      // Setup mic processor node (512 buffer = ~32ms latency)
      if (!this.micProcessorNode) {
        this.micProcessorNode = this.inputAudioCtx.createScriptProcessor(512, 1, 1);
        this.micSourceNode.connect(this.micProcessorNode);
        this.micProcessorNode.connect(this.inputAudioCtx.destination);
      }

      this.micProcessorNode.onaudioprocess = (e) => {
        if (this.currentState === "disconnected" || this.currentState === "connecting") return;

        const channelData = e.inputBuffer.getChannelData(0);

        // Compute frame RMS for noise gating and speaker bleed protection
        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);

        // Acoustic Feedback Shield & Barge-In Detection
        // When Akari is speaking, room speakers bleed sound into the mic (typically 0.02 - 0.05 RMS).
        // Sending this echo to Gemini causes Gemini to think the user interrupted and abort its own voice!
        // We require intentional loud speech (RMS >= 0.075) sustained for at least 4 consecutive frames (~130ms)
        // to permit genuine barge-in, preventing speaker loopback from cutting off Akari's sentences!
        if (this.currentState === "speaking") {
          if (rms >= 0.075) {
            this.bargeInConsecutiveFrames++;
          } else {
            this.bargeInConsecutiveFrames = 0;
            return;
          }

          if (this.bargeInConsecutiveFrames < 4) {
            return;
          }
        } else {
          this.bargeInConsecutiveFrames = 0;
        }

        // Response Speed & VAD Continuity:
        // Gemini Live relies on receiving trailing silence in the PCM audio stream to trigger its neural VAD endpointing (~300-400ms).
        // In standard mode: stream continuously while listening so responses are instantaneous (<1s).
        // In low-bandwidth mode: preserve 40 frames (~1.3s) of trailing silence so Gemini triggers immediately before pausing stream.
        if (this.lowBandwidthMode) {
          const isSpeaking = rms >= 0.009;
          if (isSpeaking) {
            this.speechHangoverFrames = 40;
          } else if (this.speechHangoverFrames > 0) {
            this.speechHangoverFrames--;
          }

          if (!isSpeaking && this.speechHangoverFrames <= 0) {
            return;
          }
        }

        // Bufferbloat Protection: If socket is congested with unsent packets (>24KB), drop live frame to prevent latency delay
        if (this.ws && this.ws.bufferedAmount > 24576) {
          return;
        }

        const pcmBuffer = floatTo16BitPCM(channelData);
        const base64 = base64ArrayBuffer(pcmBuffer);

        // Run live acoustic voice biometrics throttled to ~4 times/sec (saving 87.5% CPU load)
        const now = Date.now();
        let bioResult: ReturnType<typeof globalVoiceBiometrics.processAudioFrame> | null = null;
        if (this.lastSpeakerRecognition !== false && now - this.lastSpeakerBroadcastTime > 250) {
          bioResult = globalVoiceBiometrics.processAudioFrame(channelData, 16000);
          if (this.onSpeakerChange && bioResult.speakerType !== "ambient") {
            this.onSpeakerChange(bioResult);
          }
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ audio: base64 }));

          // Broadcast speaker verification state periodically during active speech
          if (bioResult && now - this.lastSpeakerBroadcastTime > 1500 && bioResult.speakerType !== "ambient") {
            this.lastSpeakerBroadcastTime = now;
            this.ws.send(JSON.stringify({
              type: "speaker_verification",
              isOwner: bioResult.isOwner,
              confidence: bioResult.confidence,
              speakerType: bioResult.speakerType,
              detectedPitch: bioResult.detectedPitch,
              ownerName: this.lastOwnerName || "Siddhant"
            }));
          }
        }
      };

      // Connect WebSocket
      this.connectWebSocket();
      this.startVtsSync();
    } catch (audioError: any) {
      console.error("[Akari Audio] Audio Context or Microphone Initialization Failed:", audioError);
      this.onError(`Permission error: ${audioError.message || "Microphone required for live link."}`);
      this.disconnect();
    }
  }

  private connectWebSocket() {
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    if (this.lastVoice) params.set("voice", this.lastVoice);
    if (this.lastAvatarStyle) params.set("avatarStyle", this.lastAvatarStyle);
    if (this.lastOwnerName) params.set("ownerName", this.lastOwnerName);
    if (this.lastSpeakerRecognition !== undefined) params.set("speakerRecognition", String(this.lastSpeakerRecognition));
    const queryStr = params.toString() ? `?${params.toString()}` : "";

    const wsBase = getWsBaseUrl();
    this.ws = new WebSocket(`${wsBase}/live${queryStr}`);
    this.ws.binaryType = "blob";

    this.ws.onopen = () => {
      console.log("[Akari Audio] Connected to WebSocket bridge on /live");
      this.isReconnecting = false;
      this.setState("listening");
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "error") {
          console.warn("[Akari WS Server Error]:", data.error);
          const errStr = String(data.error || "").toLowerCase();
          if (
            errStr.includes("goaway") ||
            errStr.includes("session duration") ||
            errStr.includes("duration limit") ||
            errStr.includes("connection aborted")
          ) {
            console.log("[Akari Audio] Session duration rollover detected. Silently auto-reconnecting...");
            this.triggerAutoReconnect();
            return;
          }
          this.onError(data.error);
          return;
        }

        if (data.type === "shutdown") {
          window.close();
          this.disconnect();
          return;
        }

        if (data.type === "status") {
          console.log("[Akari WS Status]:", data.status);
          if (data.status === "connected") {
            this.setState("listening");
          } else if (data.status === "session_closed") {
            // Auto-reconnect smoothly instead of killing mic
            this.triggerAutoReconnect();
          }
          return;
        }

        // Handle audio payload (24kHz PCM model response)
        if (data.type === "audio" && data.audio) {
          this.isModelTurnComplete = false;
          this.playAudioPCMChunk(data.audio);
        }

        // Interruption signal
        if (data.type === "interrupted") {
          this.isModelTurnComplete = true;
          this.handleInterruption();
        }

        // Turn complete
        if (data.type === "turnComplete") {
          this.isModelTurnComplete = true;
          if (this.activeSources.length === 0 && this.currentState === "speaking") {
            setTimeout(() => {
              if (this.activeSources.length === 0 && this.currentState === "speaking" && this.isModelTurnComplete) {
                this.setState("listening");
              }
            }, 120);
          }
        }

        // Transcriptions
        if (data.type === "transcription") {
          this.onTranscription(data.role, data.text);
        }

        // Memory sync
        if (data.type === "memory_sync" && data.memories) {
          if (this.onMemorySync) {
            this.onMemorySync(data.memories);
          }
        }

        // Reminder notifications
        if (data.type === "reminder" && data.text) {
          if (this.onReminder) {
            this.onReminder(data.text, data.id || "");
          }
        }

        // Terminal output logs
        if (data.type === "terminal_output" && data.output) {
          if (this.onTerminalOutput) {
            this.onTerminalOutput(data.tool, data.args, data.output);
          }
        }

        // Client actions
        if (data.type === "client_action" && data.action) {
          if (this.onClientAction) {
            this.onClientAction(data.action, data);
          }
        }

        // Holographic Silent Inner Thoughts
        if (data.type === "thought" && data.thought) {
          if (this.onClientAction) {
            this.onClientAction("thought", { thought: data.thought });
          }
        }

        // Tool calls
        if (data.type === "toolCall") {
          const { callId, name, args } = data;
          this.onToolCall(name, args, (result) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({
                type: "toolResponse",
                id: callId,
                name: name,
                output: result,
              }));
            }
          });
        }
      } catch (parseError) {
        console.error("Failed to parse incoming WS message:", parseError);
      }
    };

    this.ws.onclose = () => {
      console.log("[Akari Audio] WS connection closed.");
      if (this.isActivated) {
        this.triggerAutoReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.warn("[Akari Audio] WS socket error:", err);
      if (this.isActivated) {
        this.triggerAutoReconnect();
      }
    };
  }

  private triggerAutoReconnect() {
    if (!this.isActivated || this.isReconnecting) return;
    this.isReconnecting = true;
    this.setState("connecting");

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(async () => {
      if (!this.isActivated) return;
      console.log("[Akari Audio] 🔄 Auto-reconnecting to maintain persistent microphone stream...");
      try {
        if (this.inputAudioCtx && this.inputAudioCtx.state === "suspended") {
          await this.inputAudioCtx.resume().catch(() => {});
        }
        if (this.outputAudioCtx && this.outputAudioCtx.state === "suspended") {
          await this.outputAudioCtx.resume().catch(() => {});
        }
        this.connectWebSocket();
      } catch (err) {
        console.warn("[Akari Audio] Reconnect failed, retrying in 2s:", err);
        this.isReconnecting = false;
        if (this.isActivated) {
          this.reconnectTimeout = setTimeout(() => this.triggerAutoReconnect(), 2000);
        }
      }
    }, 1000);
  }

  // Interruption handling (stops audio queue instantly)
  private handleInterruption() {
    this.isModelTurnComplete = true;
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (err) {}
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    this.setState("listening");
  }

  // Jitter-buffered raw PCM chunk scheduled playback at 24kHz
  private playAudioPCMChunk(base64Audio: string) {
    if (!this.outputAudioCtx || !this.outputGainNode) return;

    try {
      if (this.outputAudioCtx.state === "suspended") {
        this.outputAudioCtx.resume().catch(() => {});
      }

      if (this.speechEndTimer) {
        clearTimeout(this.speechEndTimer);
        this.speechEndTimer = null;
      }

      const currentTime = this.outputAudioCtx.currentTime;

      if (this.currentState !== "speaking") {
        this.setState("speaking");
        // Pre-roll buffer cushion ONLY on initial playback start to absorb network jitter
        const initialPreRoll = this.lowBandwidthMode ? 0.050 : 0.025;
        this.nextStartTime = currentTime + initialPreRoll;
      } else {
        // In the middle of speech, if an underrun happened due to network jitter,
        // start playback immediately at currentTime! NEVER insert an artificial silence gap!
        if (this.nextStartTime < currentTime) {
          this.nextStartTime = currentTime;
        }
      }

      const uint8Array = base64ToUint8Array(base64Audio);
      const floats = pcm16ToFloats(uint8Array);

      const buffer = this.outputAudioCtx.createBuffer(1, floats.length, 24000);
      buffer.getChannelData(0).set(floats);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputGainNode);

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;

      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }

        if (this.activeSources.length === 0) {
          if (this.speechEndTimer) clearTimeout(this.speechEndTimer);

          if (this.isModelTurnComplete) {
            // Echo settling buffer before unmuting mic
            this.speechEndTimer = setTimeout(() => {
              if (this.activeSources.length === 0 && this.currentState === "speaking" && this.isModelTurnComplete) {
                this.setState("listening");
              }
            }, 150);
          } else {
            // Model turn has NOT completed yet; more chunks may be on the way over the network.
            // Generous fallback safety timeout (1500ms) prevents cutting off delayed words.
            this.speechEndTimer = setTimeout(() => {
              if (this.activeSources.length === 0 && this.currentState === "speaking") {
                this.isModelTurnComplete = true;
                this.setState("listening");
              }
            }, 1500);
          }
        }
      };

      this.activeSources.push(source);
    } catch (playbackError) {
      console.error("[Akari Audio] PCM Chunk playback failed:", playbackError);
    }
  }

  // Send text message or multimodal attachment over WebSocket to Gemini
  public sendTextMessage(text: string, file?: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (file) {
        this.ws.send(JSON.stringify({ type: "multimodal", text, file }));
      } else {
        this.ws.send(JSON.stringify({ type: "text", text }));
      }
      return true;
    }
    return false;
  }

  public disconnect() {
    this.isActivated = false;
    this.isReconnecting = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }

    this.setState("disconnected");
    this.stopVtsSync();

    // Close WS socket
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    // Stop and release user microphone streams
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.micStream = null;
    }

    // Disconnect routing nodes
    if (this.micProcessorNode) {
      try {
        this.micProcessorNode.disconnect();
      } catch (e) {}
      this.micProcessorNode = null;
    }

    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {}
      this.micSourceNode = null;
    }

    // Close Audio contexts
    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close();
      } catch (e) {}
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      try {
        this.outputAudioCtx.close();
      } catch (e) {}
      this.outputAudioCtx = null;
    }

    this.activeSources = [];
    this.nextStartTime = 0;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.outputGainNode = null;
  }

  private startVtsSync() {
    this.stopVtsSync();
    const dataArray = new Uint8Array(64);

    this.vtsSyncInterval = setInterval(() => {
      if (this.currentState === "disconnected") return;
      if (!getVTubeStudioClient().isAuthenticated()) return;

      let amplitude = 0;
      if (this.currentState === "speaking" && this.outputAnalyser) {
        try {
          this.outputAnalyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          amplitude = (sum / dataArray.length) / 255;
        } catch {}
      } else if (this.currentState === "listening" && this.inputAnalyser) {
        try {
          this.inputAnalyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          amplitude = (sum / dataArray.length) / 255;
        } catch {}
      }

      getVTubeStudioClient().setAudioAmplitude(
        amplitude,
        this.currentState === "speaking",
        this.currentState === "listening"
      );
    }, 16);
  }

  private stopVtsSync() {
    if (this.vtsSyncInterval) {
      clearInterval(this.vtsSyncInterval);
      this.vtsSyncInterval = null;
    }
  }
}
