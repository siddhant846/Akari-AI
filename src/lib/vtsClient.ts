/**
 * VTube Studio WebSocket API Client for Akari AI.
 *
 * Connects directly to VTube Studio on ws://127.0.0.1:8001 to drive:
 * - Real-time Lip Sync (MouthOpen / MouthSmile mapped to Gemini audio amplitude)
 * - Natural Eye Blinking (EyeOpenLeft / EyeOpenRight)
 * - Subtle Idle Head Sway & Nodding (FaceAngleX / FaceAngleY / FaceAngleZ)
 * - Breathing Rhythm (ParamBreath)
 */

export interface VTSStatus {
  connected: boolean;
  authenticated: boolean;
  modelLoaded?: string;
  error?: string;
}

export class VTubeStudioClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private authenticated = false;
  private onStatusChange?: (status: VTSStatus) => void;
  private requestIdCounter = 0;
  private pendingRequests = new Map<string, (data: any) => void>();
  private animFrameId: number | null = null;
  private isDestroyed = false;

  // Real-time animation states
  private currentVolume = 0;
  private targetVolume = 0;
  private isSpeaking = false;
  private isListening = false;
  private activeEmotion = "idle";
  
  // Natural Blinking State
  private eyeOpen = 1.0;
  private lastBlinkTime = Date.now();
  private nextBlinkInterval = 3000;
  private isBlinking = false;
  private blinkProgress = 0;

  // Head Motion & Breathing State
  private headTime = 0;
  private headTargetX = 0;
  private headTargetY = 0;
  private headTargetZ = 0;
  private headCurrentX = 0;
  private headCurrentY = 0;
  private headCurrentZ = 0;

  constructor(url = "ws://127.0.0.1:8001", onStatusChange?: (status: VTSStatus) => void) {
    this.url = url;
    this.onStatusChange = onStatusChange;
    this.token = localStorage.getItem("akari_vts_token");
  }

  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  public setStatusCallback(callback: (status: VTSStatus) => void): void {
    this.onStatusChange = callback;
    this.notifyStatus({
      connected: this.ws?.readyState === WebSocket.OPEN,
      authenticated: this.authenticated,
    });
  }

  public reconnectAndAuthorize(): void {
    localStorage.removeItem("akari_vts_token");
    this.token = null;
    this.authenticated = false;
    this.connect();
  }

  public connect(): void {
    if (this.isDestroyed) return;
    this.disconnect();

    try {
      this.ws = new WebSocket(this.url);
    } catch (err: any) {
      this.notifyStatus({ connected: false, authenticated: false, error: err.message });
      return;
    }

    this.ws.onopen = () => {
      this.notifyStatus({ connected: true, authenticated: false });
      this.authenticate();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const reqId = msg.requestID;
        if (reqId && this.pendingRequests.has(reqId)) {
          const handler = this.pendingRequests.get(reqId)!;
          this.pendingRequests.delete(reqId);
          handler(msg);
          return;
        }
        this.handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      this.notifyStatus({ connected: false, authenticated: false });
      this.stopAnimationLoop();
      // Auto-retry connection after 4 seconds
      if (!this.isDestroyed) {
        setTimeout(() => {
          if (!this.authenticated && !this.isDestroyed) {
            this.connect();
          }
        }, 4000);
      }
    };

    this.ws.onerror = () => {
      this.notifyStatus({ connected: false, authenticated: false, error: "VTS connection failed" });
    };
  }

  public disconnect(): void {
    this.stopAnimationLoop();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.authenticated = false;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
  }

  /**
   * Update audio volume amplitude (0.0 to 1.0) and emotion state from Gemini Live audio stream.
   */
  public setAudioAmplitude(amplitude: number, speaking = false, listening = false, emotion = "idle"): void {
    this.targetVolume = Math.min(Math.max(amplitude, 0), 1);
    this.isSpeaking = speaking;
    this.isListening = listening;
    this.activeEmotion = emotion;
  }

  private sendRequest(messageType: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WebSocket not open"));
      }
      const reqId = `akari_${Date.now()}_${++this.requestIdCounter}`;
      const payload = {
        apiName: "VTubeStudioPublicAPI",
        apiVersion: "1.0",
        requestID: reqId,
        messageType,
        data,
      };

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error(`Timeout waiting for ${messageType}`));
        }
      }, 8000);

      this.pendingRequests.set(reqId, (resp) => {
        clearTimeout(timer);
        if (resp.messageType === "APIError") {
          reject(new Error(resp.data?.message || "VTS API Error"));
        } else {
          resolve(resp.data);
        }
      });

      this.ws.send(JSON.stringify(payload));
    });
  }

  private async authenticate(): Promise<void> {
    try {
      if (!this.token) {
        // Step 1: Request Authentication Token (triggers modal popup in VTube Studio)
        const tokenRes = await this.sendRequest("AuthenticationTokenRequest", {
          pluginName: "Akari AI",
          pluginDeveloper: "Siddhant",
        });
        if (tokenRes?.authenticationToken) {
          this.token = tokenRes.authenticationToken;
          localStorage.setItem("akari_vts_token", this.token);
        }
      }

      if (this.token) {
        // Step 2: Authenticate using saved/new token
        const authRes = await this.sendRequest("AuthenticationRequest", {
          pluginName: "Akari AI",
          pluginDeveloper: "Siddhant",
          authenticationToken: this.token,
        });

        if (authRes?.authenticated) {
          this.authenticated = true;
          this.notifyStatus({ connected: true, authenticated: true });
          
          // Query loaded model info
          try {
            const modelInfo = await this.sendRequest("CurrentModelRequest", {});
            if (modelInfo?.modelLoaded) {
              this.notifyStatus({
                connected: true,
                authenticated: true,
                modelLoaded: modelInfo.modelName || "Akari Live2D",
              });
            }
          } catch {}

          this.startAnimationLoop();
        } else {
          // Token invalid or rejected, reset and try requesting token again
          localStorage.removeItem("akari_vts_token");
          this.token = null;
          this.authenticated = false;
          this.notifyStatus({
            connected: true,
            authenticated: false,
            error: "Please click 'Allow' in the VTube Studio popup prompt",
          });
          setTimeout(() => {
            if (!this.authenticated && !this.isDestroyed) {
              this.authenticate();
            }
          }, 1500);
        }
      }
    } catch (err: any) {
      console.warn("[VTS Auth Error]", err);
      localStorage.removeItem("akari_vts_token");
      this.token = null;
      this.notifyStatus({ connected: true, authenticated: false, error: err.message });
    }
  }

  private handleMessage(msg: any): void {
    if (msg.messageType === "ModelLoadedEvent") {
      this.notifyStatus({ connected: true, authenticated: this.authenticated, modelLoaded: msg.data?.modelName });
    }
  }

  private notifyStatus(status: VTSStatus): void {
    this.onStatusChange?.(status);
  }

  /**
   * 30FPS animation loop driving real-time physics, lip sync, and micro-movements.
   */
  private startAnimationLoop(): void {
    this.stopAnimationLoop();
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      this.updateSimulation(dt);
      this.sendParameters();

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopAnimationLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private updateSimulation(dt: number): void {
    // 1. Smooth Volume / Lip Sync interpolation with fast attack & natural release
    const rate = this.targetVolume > this.currentVolume ? 40 : 20;
    this.currentVolume += (this.targetVolume - this.currentVolume) * Math.min(dt * rate, 1);

    // 2. Natural Eye Blinking Logic
    const now = Date.now();
    if (!this.isBlinking && now - this.lastBlinkTime > this.nextBlinkInterval) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.nextBlinkInterval = 2500 + Math.random() * 3000;
    }

    if (this.isBlinking) {
      this.blinkProgress += dt * 8.0;
      if (this.blinkProgress < 0.5) {
        this.eyeOpen = Math.max(0, 1 - this.blinkProgress * 2);
      } else if (this.blinkProgress < 1.0) {
        this.eyeOpen = Math.min(1, (this.blinkProgress - 0.5) * 2);
      } else {
        this.eyeOpen = 1.0;
        this.isBlinking = false;
        this.lastBlinkTime = now;
      }
    } else {
      this.eyeOpen = 1.0;
    }

    // 3. Head Motion (Idle sway + expressive nods when talking or listening)
    this.headTime += dt;
    if (this.isSpeaking) {
      // Natural cadence nods while speaking
      this.headTargetX = Math.sin(this.headTime * 1.5) * 8;
      this.headTargetY = Math.sin(this.headTime * 3.2) * 9 - (this.currentVolume * 6);
      this.headTargetZ = Math.cos(this.headTime * 1.2) * 5;
    } else if (this.isListening) {
      // Attentive slight head tilt when listening to user
      this.headTargetX = Math.sin(this.headTime * 0.8) * 5;
      this.headTargetY = -2 + Math.sin(this.headTime * 1.0) * 3;
      this.headTargetZ = 6 + Math.sin(this.headTime * 0.5) * 4;
    } else {
      // Gentle idle breathing sway
      this.headTargetX = Math.sin(this.headTime * 0.5) * 3.5;
      this.headTargetY = Math.cos(this.headTime * 0.4) * 2.5;
      this.headTargetZ = Math.sin(this.headTime * 0.3) * 2.5;
    }

    this.headCurrentX += (this.headTargetX - this.headCurrentX) * Math.min(dt * 5, 1);
    this.headCurrentY += (this.headTargetY - this.headCurrentY) * Math.min(dt * 5, 1);
    this.headCurrentZ += (this.headTargetZ - this.headCurrentZ) * Math.min(dt * 5, 1);
  }

  private sendParameters(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
      return;
    }

    // High-responsiveness speech mapping with syllable rhythm
    let mouthValue = 0;
    if (this.isSpeaking) {
      // Syllable oscillation for natural speech movement even during subtle pauses
      const cadence = 0.55 + 0.45 * Math.abs(Math.sin(this.headTime * 9.5) * Math.cos(this.headTime * 5.2));
      const energy = Math.max(this.currentVolume, 0.22) * cadence;
      const boosted = Math.pow(Math.min(energy * 3.6, 1), 0.75);
      mouthValue = Math.min(Math.max(boosted, 0.18), 1.0);
    } else {
      mouthValue = 0;
    }

    // Emotion-reactive facial expression parameters
    let smileValue = 0.5;
    let browValue = 0.0;
    let cheekValue = 0.0;
    let eyeScale = 1.0;

    switch (this.activeEmotion) {
      case "happy":
      case "playful":
      case "excited":
        smileValue = 0.95;
        browValue = 0.4;
        cheekValue = 0.5;
        eyeScale = 0.95; // Cheerful squint
        break;
      case "curious":
      case "surprised":
        smileValue = 0.6;
        browValue = 0.85; // Raised eyebrows
        eyeScale = 1.0;
        break;
      case "thinking":
        smileValue = 0.35;
        browValue = -0.3;
        break;
      case "embarrassed":
        smileValue = 0.4;
        browValue = -0.2;
        cheekValue = 0.95; // Bright blush
        break;
      case "sad":
        smileValue = -0.6;
        browValue = -0.8;
        break;
      default:
        smileValue = this.isSpeaking ? 0.7 : 0.45;
        browValue = 0.0;
        cheekValue = 0.0;
        eyeScale = 1.0;
        break;
    }

    const eyeLeftVal = Math.min(Math.max(this.eyeOpen * eyeScale, 0), 1);
    const eyeRightVal = Math.min(Math.max(this.eyeOpen * eyeScale, 0), 1);
    const breathValue = (Math.sin(this.headTime * 1.5) + 1) / 2;

    const parameterValues = [
      // Standard VTS tracking parameters (weight: 1.0 override)
      { id: "MouthOpen", value: mouthValue, weight: 1 },
      { id: "MouthSmile", value: smileValue, weight: 1 },
      { id: "VoiceVolume", value: mouthValue, weight: 1 },
      { id: "VoiceVolumePlus", value: mouthValue, weight: 1 },
      { id: "VoiceFrequency", value: mouthValue * 0.5 + 0.5, weight: 1 },
      { id: "MouthForm", value: smileValue, weight: 1 },
      { id: "Brows", value: browValue, weight: 1 },

      // Standard Live2D Cubism parameters
      { id: "ParamMouthOpen", value: mouthValue, weight: 1 },
      { id: "PARAM_MOUTH_OPEN", value: mouthValue, weight: 1 },
      { id: "ParamMouthOpenY", value: mouthValue, weight: 1 },
      { id: "PARAM_MOUTH_OPEN_Y", value: mouthValue, weight: 1 },
      { id: "ParamMouthForm", value: smileValue, weight: 1 },
      { id: "PARAM_MOUTH_FORM", value: smileValue, weight: 1 },

      // Facial Emotion Expressions (Blush, Brows, Eye Smile)
      { id: "ParamCheek", value: cheekValue, weight: 1 },
      { id: "PARAM_CHEEK", value: cheekValue, weight: 1 },
      { id: "ParamBrowLY", value: browValue, weight: 1 },
      { id: "ParamBrowRY", value: browValue, weight: 1 },
      { id: "PARAM_BROW_L_Y", value: browValue, weight: 1 },
      { id: "PARAM_BROW_R_Y", value: browValue, weight: 1 },
      { id: "ParamEyeLSmile", value: smileValue > 0.7 ? 0.85 : 0, weight: 1 },
      { id: "ParamEyeRSmile", value: smileValue > 0.7 ? 0.85 : 0, weight: 1 },

      // Eye Blinking
      { id: "EyeOpenLeft", value: eyeLeftVal, weight: 1 },
      { id: "EyeOpenRight", value: eyeRightVal, weight: 1 },
      { id: "ParamEyeLOpen", value: eyeLeftVal, weight: 1 },
      { id: "ParamEyeROpen", value: eyeRightVal, weight: 1 },
      { id: "PARAM_EYE_L_OPEN", value: eyeLeftVal, weight: 1 },
      { id: "PARAM_EYE_R_OPEN", value: eyeRightVal, weight: 1 },

      // Head Angles & Breathing
      { id: "FaceAngleX", value: this.headCurrentX, weight: 1 },
      { id: "FaceAngleY", value: this.headCurrentY, weight: 1 },
      { id: "FaceAngleZ", value: this.headCurrentZ, weight: 1 },
      { id: "ParamAngleX", value: this.headCurrentX, weight: 1 },
      { id: "ParamAngleY", value: this.headCurrentY, weight: 1 },
      { id: "ParamAngleZ", value: this.headCurrentZ, weight: 1 },
      { id: "ParamBodyAngleX", value: this.headCurrentX * 0.35, weight: 1 },
      { id: "ParamBodyAngleY", value: this.headCurrentY * 0.35, weight: 1 },
      { id: "ParamBodyAngleZ", value: this.headCurrentZ * 0.35, weight: 1 },
      { id: "ParamBreath", value: breathValue, weight: 1 },
      { id: "PARAM_BREATH", value: breathValue, weight: 1 },
    ];

    const payload = {
      apiName: "VTubeStudioPublicAPI",
      apiVersion: "1.0",
      requestID: `inject_${Date.now()}`,
      messageType: "InjectParameterDataRequest",
      data: {
        faceFound: true,
        mode: "set",
        parameterValues,
      },
    };

    try {
      this.ws.send(JSON.stringify(payload));
    } catch {}
  }
}

let globalVTSInstance: VTubeStudioClient | null = null;

export function getVTubeStudioClient(onStatusChange?: (status: VTSStatus) => void): VTubeStudioClient {
  if (!globalVTSInstance) {
    globalVTSInstance = new VTubeStudioClient("ws://127.0.0.1:8001", onStatusChange);
  } else if (onStatusChange) {
    globalVTSInstance.setStatusCallback(onStatusChange);
  }
  return globalVTSInstance;
}
