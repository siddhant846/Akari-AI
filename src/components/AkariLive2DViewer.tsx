import React, { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import { AkariAudioSession } from "../lib/audio";
import { AkariEmotion } from "./AkariCoreVisualizer";

// Register PIXI globally for pixi-live2d-display
(window as any).PIXI = PIXI;
Live2DModel.registerTicker(PIXI.Ticker as any);

interface AkariLive2DViewerProps {
  session: AkariAudioSession | null;
  characterState: "idle" | "thinking" | "talking";
  activeEmotion?: AkariEmotion;
  cursorTrackingEnabled?: boolean;
  className?: string;
  posture?: "standing" | "sitting";
}

// Guaranteed Multi-Tier Live2D parameter setter (Direct WebAssembly Heap + Cubism SDK)
function setLive2DParam(model: any, id: string, value: number) {
  if (!model || !model.internalModel || typeof value !== "number" || isNaN(value) || !isFinite(value)) return;
  const im = model.internalModel;
  const cm = im.coreModel;
  if (!cm) return;

  try {
    // 1. Direct WebAssembly parameter heap access (100% guaranteed, bypasses SDK layer bugs)
    const csm = cm._model || cm;
    if (csm && csm.parameters && Array.isArray(csm.parameters.ids) && csm.parameters.values) {
      const idx = csm.parameters.ids.indexOf(id);
      if (idx >= 0 && idx < csm.parameters.values.length) {
        csm.parameters.values[idx] = value;
      }
    }

    // 2. Standard Cubism 4 SDK method
    if (typeof cm.setParameterValueById === "function") {
      cm.setParameterValueById(id, value);
    } else if (typeof cm.setParameterValueByIndex === "function" && typeof cm.getParameterIndex === "function") {
      const idx = cm.getParameterIndex(id);
      if (idx >= 0) cm.setParameterValueByIndex(idx, value);
    }
  } catch (e) {}
}

export const AkariLive2DViewer: React.FC<AkariLive2DViewerProps> = ({
  session,
  characterState,
  activeEmotion = "idle",
  cursorTrackingEnabled = true,
  className = "",
  posture = "standing",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Live state refs to avoid stale closures
  const sessionRef = useRef<AkariAudioSession | null>(session);
  const characterStateRef = useRef<"idle" | "thinking" | "talking">(characterState);
  const activeEmotionRef = useRef<AkariEmotion>(activeEmotion);
  const cursorTrackingRef = useRef<boolean>(cursorTrackingEnabled);
  const postureRef = useRef<"standing" | "sitting">(posture);

  useEffect(() => {
    postureRef.current = posture;
  }, [posture]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    characterStateRef.current = characterState;
  }, [characterState]);

  useEffect(() => {
    activeEmotionRef.current = activeEmotion;
  }, [activeEmotion]);

  useEffect(() => {
    cursorTrackingRef.current = cursorTrackingEnabled;
    if (!cursorTrackingEnabled) {
      mousePosRef.current = { x: 0, y: 0 };
    }
  }, [cursorTrackingEnabled]);

  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const headAngleRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const audioDataRef = useRef<Uint8Array>(new Uint8Array(128));
  const currentMouthOpenRef = useRef<number>(0);

  // Blinking timer refs
  const blinkTimerRef = useRef<number>(0);
  const isBlinkingRef = useRef<boolean>(false);
  const blinkDurationRef = useRef<number>(0);

  // Expression smooth parameter interpolation refs
  const currentBrowYRef = useRef<number>(0);
  const currentBrowAngleRef = useRef<number>(0);
  const currentBrowFormRef = useRef<number>(0);
  const currentEyeSmileRef = useRef<number>(0);
  const currentCheekRef = useRef<number>(0);
  const currentShockRef = useRef<number>(0);
  const currentTearsRef = useRef<number>(0);

  // Initialize Pixi Application & Live2D Model
  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    const container = containerRef.current;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const isMobile = typeof window !== "undefined" && (window.innerWidth < 768 || Boolean((window as any).Capacitor));
    const app = new PIXI.Application({
      width,
      height,
      backgroundAlpha: 0,
      antialias: !isMobile,
      resolution: Math.min(window.devicePixelRatio || 1, 1.25),
      autoDensity: true,
      powerPreference: "high-performance",
    });

    appRef.current = app;
    container.appendChild(app.view as HTMLCanvasElement);

    const loadModel = async () => {
      try {
        const model = await Live2DModel.from("./live2d/akari/akari.model3.json", {
          autoInteract: false,
          idleMotionGroup: "Idle",
        });

        if (!isMounted) {
          model.destroy();
          return;
        }

        // Configure lip-sync target IDs on motion manager
        if (model.internalModel && model.internalModel.motionManager) {
          (model.internalModel.motionManager as any).lipSyncIds = [
            "ParamMouthOpen",
            "ParamMouthOpenY",
            "ParamMouthForm",
          ];
        }

        // Core animation & parameter update logic
        const updateParameters = () => {
          const m = modelRef.current;
          if (!m || !m.internalModel) return;

          try {
            const state = characterStateRef.current;
            const activeSession = sessionRef.current;
            const emotion = activeEmotionRef.current || "idle";

            // 1. Audio-Driven Conversational Lip-Sync & Phoneme Shaping
            let targetMouthOpen = 0.0;
            let targetMouthForm = 0.0;
            let speechEnergy = 0.0;
            let lowEnergy = 0;   // 100Hz - 600Hz
            let midEnergy = 0;   // 600Hz - 1800Hz
            let highEnergy = 0;  // 1800Hz - 4000Hz
            let totalRaw = 0;

            const isSpeaking =
              state === "talking" ||
              (activeSession && activeSession.currentState === "speaking");

            if (isSpeaking && activeSession && activeSession.outputAnalyser) {
              try {
                activeSession.outputAnalyser.getByteFrequencyData(audioDataRef.current);
                
                // Inspect speech-range frequency bins (bins 1 to 32)
                for (let i = 1; i <= 6; i++) lowEnergy += audioDataRef.current[i] || 0;
                for (let i = 7; i <= 18; i++) midEnergy += audioDataRef.current[i] || 0;
                for (let i = 19; i <= 32; i++) highEnergy += audioDataRef.current[i] || 0;

                totalRaw = (lowEnergy + midEnergy + highEnergy) / 32;
                
                // Noise floor suppression: close mouth cleanly during pauses
                if (totalRaw > 8) {
                  // Normalized speech power (0.0 to 1.0)
                  speechEnergy = Math.min(1.0, Math.max(0.0, (totalRaw - 8) / 80));
                  
                  // Conversational opening range: 0.15 to 0.85 (natural anime proportions)
                  targetMouthOpen = Math.min(0.92, Math.pow(speechEnergy, 0.9) * 0.95);

                  // Dynamic Vowel Shape modulation:
                  const highRatio = highEnergy / (lowEnergy + 1);
                  if (highRatio > 1.2) {
                    targetMouthForm = 0.45 + Math.min(0.4, (highRatio - 1.2) * 0.3);
                  } else if (lowEnergy > midEnergy * 1.1) {
                    targetMouthForm = -0.25;
                  } else {
                    targetMouthForm = 0.2;
                  }
                }
              } catch (e) {}
            }

            // Organic speech syllable modulation when in speaking state
            if (isSpeaking && speechEnergy <= 0.05) {
              const t = Date.now() * 0.015;
              const syllableOsc = Math.sin(t * 2.8) * Math.cos(t * 1.7);
              if (syllableOsc > 0.1) {
                targetMouthOpen = Math.min(0.7, syllableOsc * 0.65);
                targetMouthForm = 0.2;
              }
            }

            // Expressive emotion bias for resting mouth
            if (!isSpeaking) {
              if (emotion === "happy" || emotion === "excited" || emotion === "playful") {
                targetMouthForm = 0.65;
              } else if (emotion === "sad") {
                targetMouthForm = -0.4;
              } else if (emotion === "embarrassed") {
                targetMouthForm = 0.3;
              } else {
                targetMouthForm = 0.0;
              }
            }

            // Responsive attack / natural decay
            if (isNaN(currentMouthOpenRef.current) || !isFinite(currentMouthOpenRef.current)) {
              currentMouthOpenRef.current = 0;
            }
            const lerpSpeed = targetMouthOpen > currentMouthOpenRef.current ? 0.65 : 0.42;
            currentMouthOpenRef.current += (targetMouthOpen - currentMouthOpenRef.current) * lerpSpeed;
            const mouthVal = Math.max(0.0, Math.min(1.0, currentMouthOpenRef.current));

            // Apply natural mouth parameters
            setLive2DParam(m, "ParamMouthOpen", mouthVal);
            setLive2DParam(m, "ParamMouthOpenY", mouthVal);
            setLive2DParam(m, "ParamMouthForm", targetMouthForm);

            // 2. Real-Time Acoustic Voice Tone & Prosody Extraction
            let voicePitchFactor = 0.0;
            let voiceEnergyBoost = 0.0;
            if (isSpeaking && speechEnergy > 0.04) {
              const highRatio = highEnergy / (lowEnergy + 1);
              if (isFinite(highRatio) && highRatio > 1.15) {
                voicePitchFactor = Math.min(1.0, (highRatio - 1.15) * 0.9);
              }
              voiceEnergyBoost = Math.min(1.0, speechEnergy * 1.3);
            }

            // Continuous Facial Emotion Mapping (Smooth Expression Morphing)
            let targetBrowY = 0.0;
            let targetBrowAngle = 0.0;
            let targetBrowForm = 0.0;
            let targetEyeSmile = 0.0;
            let targetCheek = 0.0;
            let targetEyeOpenMult = 1.0;
            let targetShock = 0.0;
            let targetTears = 0.0;

            switch (emotion) {
              case "happy":
                targetEyeSmile = 0.85;
                targetCheek = 0.6;
                targetBrowY = 0.35;
                targetBrowForm = 0.5;
                break;
              case "excited":
                targetEyeSmile = 0.95;
                targetCheek = 0.75;
                targetBrowY = 0.5;
                targetBrowForm = 0.6;
                targetEyeOpenMult = 1.15;
                break;
              case "playful":
                targetEyeSmile = 0.8;
                targetCheek = 0.65;
                targetBrowY = 0.35;
                targetBrowForm = 0.5;
                break;
              case "curious":
                targetEyeOpenMult = 1.15;
                targetBrowY = 0.4;
                targetBrowAngle = 0.25;
                targetCheek = 0.2;
                break;
              case "thinking":
                targetEyeOpenMult = 0.88;
                targetBrowY = -0.35;
                targetBrowAngle = -0.3;
                break;
              case "proud":
                targetEyeSmile = 0.55;
                targetCheek = 0.45;
                targetBrowY = 0.3;
                targetBrowForm = 0.4;
                break;
              case "sad":
                targetEyeOpenMult = 0.85;
                targetBrowY = -0.5;
                targetBrowAngle = 0.6;
                targetBrowForm = -0.4;
                targetCheek = 0.2;
                targetTears = 0.5;
                break;
              case "surprised":
                targetEyeOpenMult = 1.35;
                targetBrowY = 0.8;
                targetShock = 0.45;
                break;
              case "embarrassed":
                targetEyeSmile = 0.5;
                targetEyeOpenMult = 0.85;
                targetCheek = 0.95; // Sweet blush
                targetBrowY = -0.2;
                targetBrowAngle = 0.35;
                break;
              case "confused":
                targetEyeOpenMult = 1.0;
                targetBrowY = 0.35;
                targetBrowAngle = 0.45;
                break;
              case "angry":
                targetBrowY = -0.5;
                targetBrowAngle = -0.75;
                targetBrowForm = -0.75;
                targetEyeOpenMult = 0.8;
                targetCheek = 0.35;
                break;
              case "annoyed":
                targetBrowY = -0.3;
                targetBrowAngle = -0.4;
                targetBrowForm = -0.35;
                targetEyeOpenMult = 0.85;
                targetCheek = 0.15;
                break;
              case "flustered":
                targetEyeSmile = 0.8;
                targetEyeOpenMult = 0.82;
                targetCheek = 1.0; // Deep maximum blush
                targetBrowY = -0.2;
                targetBrowAngle = 0.4;
                break;
              case "sleepy":
                targetEyeOpenMult = 0.35;
                targetEyeSmile = 0.2;
                targetBrowY = -0.15;
                targetBrowAngle = 0.1;
                targetCheek = 0.2;
                break;
              case "smug":
                targetEyeSmile = 0.7;
                targetBrowY = 0.4;
                targetBrowAngle = -0.35;
                targetBrowForm = 0.6;
                targetEyeOpenMult = 0.9;
                targetCheek = 0.35;
                break;
              case "caring":
                targetEyeSmile = 0.8;
                targetEyeOpenMult = 1.05;
                targetBrowY = 0.5;
                targetBrowAngle = 0.45;
                targetBrowForm = 0.35;
                targetCheek = 0.45;
                break;
              case "focused":
                targetEyeOpenMult = 1.15;
                targetBrowY = -0.25;
                targetBrowAngle = -0.3;
                targetBrowForm = 0.35;
                targetCheek = 0.0;
                break;
              default:
                if (isSpeaking) {
                  targetEyeSmile = 0.35 + voicePitchFactor * 0.4;
                  targetCheek = 0.25 + voiceEnergyBoost * 0.25;
                  targetBrowY = 0.15 + voicePitchFactor * 0.25;
                  targetEyeOpenMult = 1.0 + voicePitchFactor * 0.12;
                }
                break;
            }

            // Blend acoustic vocal pitch & energy dynamics across all emotions during active speech
            if (isSpeaking && speechEnergy > 0.06) {
              targetEyeSmile = Math.max(targetEyeSmile, targetEyeSmile * 0.8 + voicePitchFactor * 0.35);
              targetCheek = Math.max(targetCheek, targetCheek * 0.75 + voiceEnergyBoost * 0.25);
              targetBrowY += voicePitchFactor * 0.15;
            }

            // Fallback resets if any ref was NaN
            if (!isFinite(currentBrowYRef.current)) currentBrowYRef.current = 0;
            if (!isFinite(currentBrowAngleRef.current)) currentBrowAngleRef.current = 0;
            if (!isFinite(currentBrowFormRef.current)) currentBrowFormRef.current = 0;
            if (!isFinite(currentEyeSmileRef.current)) currentEyeSmileRef.current = 0;
            if (!isFinite(currentCheekRef.current)) currentCheekRef.current = 0;
            if (!isFinite(currentShockRef.current)) currentShockRef.current = 0;
            if (!isFinite(currentTearsRef.current)) currentTearsRef.current = 0;

            // Smooth frame-by-frame expression interpolation
            currentBrowYRef.current += (targetBrowY - currentBrowYRef.current) * 0.12;
            currentBrowAngleRef.current += (targetBrowAngle - currentBrowAngleRef.current) * 0.12;
            currentBrowFormRef.current += (targetBrowForm - currentBrowFormRef.current) * 0.12;
            currentEyeSmileRef.current += (targetEyeSmile - currentEyeSmileRef.current) * 0.12;
            currentCheekRef.current += (targetCheek - currentCheekRef.current) * 0.12;
            currentShockRef.current += (targetShock - currentShockRef.current) * 0.12;
            currentTearsRef.current += (targetTears - currentTearsRef.current) * 0.12;

            // Always maintain beautiful, crystal-clear normal eyes (no distortions)
            setLive2DParam(m, "ParamEyeNormalVisible", 1.0);
            setLive2DParam(m, "ParamEyeShine", 1.0);
            setLive2DParam(m, "ParamHeartEye", emotion === "flustered" ? 1.0 : 0.0);
            setLive2DParam(m, "ParamEyeShockVisible", emotion === "surprised" ? 1.0 : 0.0);
            setLive2DParam(m, "ParamEyeXDVisible", 0.0);
            setLive2DParam(m, "ParamEyeSwirlVisible", 0.0);

            // Apply expression parameters
            setLive2DParam(m, "ParamEyeLSmile", currentEyeSmileRef.current);
            setLive2DParam(m, "ParamEyeRSmile", currentEyeSmileRef.current);
            setLive2DParam(m, "ParamBrowLY", currentBrowYRef.current);
            setLive2DParam(m, "ParamBrowRY", currentBrowYRef.current);
            setLive2DParam(m, "ParamBrowLAngle", currentBrowAngleRef.current);
            setLive2DParam(m, "ParamBrowRAngle", currentBrowAngleRef.current);
            setLive2DParam(m, "ParamBrowLForm", currentBrowFormRef.current);
            setLive2DParam(m, "ParamBrowRForm", currentBrowFormRef.current);
            setLive2DParam(m, "ParamCheek", currentCheekRef.current);
            setLive2DParam(m, "ParamShock", currentShockRef.current);
            setLive2DParam(m, "ParamTears", currentTearsRef.current);

            // 3. Cursor Head & Eye Tracking (Smooth interpolation)
            const targetX = cursorTrackingRef.current ? (isFinite(mousePosRef.current.x) ? mousePosRef.current.x : 0) : 0;
            const targetY = cursorTrackingRef.current ? (isFinite(mousePosRef.current.y) ? mousePosRef.current.y : 0) : 0;

            if (!isFinite(headAngleRef.current.x)) headAngleRef.current.x = 0;
            if (!isFinite(headAngleRef.current.y)) headAngleRef.current.y = 0;

            headAngleRef.current.x += (targetX - headAngleRef.current.x) * 0.12;
            headAngleRef.current.y += (targetY - headAngleRef.current.y) * 0.12;

            const hx = cursorTrackingRef.current ? headAngleRef.current.x : 0;
            const hy = cursorTrackingRef.current ? headAngleRef.current.y : 0;

            // Conversational speech micro-nodding and organic cadence
            const speechTime = Date.now() * 0.005;
            const speechNodY = isSpeaking ? Math.sin(speechTime * 2.5) * 3.2 * Math.max(0.2, speechEnergy) : 0;
            const speechTiltZ = isSpeaking ? Math.sin(speechTime * 1.2) * 2.0 * Math.max(0.2, speechEnergy) : 0;
            const speechBodyX = isSpeaking ? Math.cos(speechTime * 0.9) * 1.5 * Math.max(0.2, speechEnergy) : 0;

            // Posture specific kinematic adjustments
            const currentPosture = postureRef.current || "standing";
            let postureAngleY = 0;
            let postureAngleZ = 0;
            let postureBodyZ = 0;

            if (currentPosture === "sitting") {
              // Cute relaxed sitting pose looking up slightly
              postureAngleY = 4.0 + Math.sin(Date.now() * 0.0015) * 1.5;
              postureAngleZ = Math.sin(Date.now() * 0.001) * 2.0;
              postureBodyZ = Math.sin(Date.now() * 0.001) * 1.5;
            }

            // Head Angle rotation (range -30 to 30)
            setLive2DParam(m, "ParamAngleX", hx * 30 + speechBodyX * 1.5);
            setLive2DParam(m, "ParamAngleY", hy * 25 + speechNodY + postureAngleY);
            setLive2DParam(m, "ParamAngleZ", -hx * 15 + speechTiltZ + postureAngleZ);

            // Eye gaze direction (range -1.0 to 1.0)
            setLive2DParam(m, "ParamEyeBallX", Math.max(-1, Math.min(1, hx * 1.3)));
            setLive2DParam(m, "ParamEyeBallY", Math.max(-1, Math.min(1, hy * 1.3)));

            // Body Angle rotation (range -10 to 10)
            setLive2DParam(m, "ParamBodyAngleX", hx * 10 + speechBodyX);
            setLive2DParam(m, "ParamBodyAngleZ", -hx * 6 + speechTiltZ * 0.5 + postureBodyZ);

            // 4. Natural Breathing
            const breathTime = Date.now() * 0.002;
            const breath = (Math.sin(breathTime) + 1) * 0.5;
            setLive2DParam(m, "ParamBreath", breath);

            // 5. Natural Eye Blinking
            let baseEyeOpen = 1.0;
            if (isBlinkingRef.current) {
              if (blinkDurationRef.current < 6) {
                baseEyeOpen = 1.0 - blinkDurationRef.current / 6;
              } else if (blinkDurationRef.current < 12) {
                baseEyeOpen = (blinkDurationRef.current - 6) / 6;
              } else {
                baseEyeOpen = 1.0;
                isBlinkingRef.current = false;
              }
            }
            const finalEyeOpen = baseEyeOpen * targetEyeOpenMult;
            setLive2DParam(m, "ParamEyeLOpen", finalEyeOpen);
            setLive2DParam(m, "ParamEyeROpen", finalEyeOpen);
          } catch (err) {
            console.error("[Live2D] updateParameters error:", err);
          }
        };

        // Attach to beforeModelUpdate hook
        if (model.internalModel) {
          model.internalModel.on("beforeModelUpdate", updateParameters);
        }

        modelRef.current = model;
        app.stage.addChild(model as any);

        // Store intrinsic unscaled dimensions once to prevent compounding scale distortion
        const origW = model.internalModel?.width || 1200;
        const origH = model.internalModel?.height || 1400;

        // Adjust scale and center alignment perfectly framing head & upper body
        const resizeModel = () => {
          if (!containerRef.current || !modelRef.current) return;
          const w = containerRef.current.clientWidth || window.innerWidth;
          const h = containerRef.current.clientHeight || window.innerHeight;

          app.renderer.resize(w, h);

          const currentPosture = postureRef.current || "standing";

          // Calculate scale that fits both height and width gracefully on all screens
          let scaleByHeight = (h * 0.85) / origH;
          let scaleByWidth = (w * 0.65) / origW;

          if (currentPosture === "sitting") {
            scaleByHeight = (h * 0.88) / origH;
            scaleByWidth = (w * 0.72) / origW;
          }

          const scale = Math.min(scaleByHeight, scaleByWidth);
          model.scale.set(scale);

          if (currentPosture === "sitting") {
            model.anchor.set(0.5, 0.22);
            model.position.set(w / 2, Math.max(10, h * 0.22));
          } else {
            model.anchor.set(0.5, 0.08);
            model.position.set(w / 2, Math.max(20, h * 0.06));
          }
        };

        resizeModel();
        setIsLoaded(true);

        const onResize = () => resizeModel();
        window.addEventListener("resize", onResize);
        
        let resizeObserver: ResizeObserver | null = null;
        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => resizeModel());
          resizeObserver.observe(containerRef.current);
        }

        cleanupListeners = () => {
          window.removeEventListener("resize", onResize);
          if (resizeObserver) resizeObserver.disconnect();
        };
      } catch (err: any) {
        console.error("Live2D Akari model load error:", err);
        if (isMounted) setLoadError(err?.message || "Failed to load Akari Live2D model");
      }
    };

    let cleanupListeners: (() => void) | null = null;
    loadModel();

    // Mouse movement tracking (global window listener so it works everywhere on screen)
    const handleMouseMove = (e: MouseEvent) => {
      if (!cursorTrackingRef.current) {
        mousePosRef.current = { x: 0, y: 0 };
        return;
      }

      const w = window.innerWidth || 1920;
      const h = window.innerHeight || 1080;
      // Coordinate mapped to [-1, 1] relative to center
      const x = (e.clientX / w) * 2 - 1;
      const y = -((e.clientY / h) * 2 - 1); // upwards is positive in Live2D
      mousePosRef.current = { x, y };

      if (modelRef.current) {
        try {
          modelRef.current.focus(e.clientX, e.clientY);
        } catch (e) {}
        try {
          if (modelRef.current.internalModel?.focusController) {
            modelRef.current.internalModel.focusController.focus(x, y);
          }
        } catch (e) {}
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Pixi Ticker for eye blinking timer
    const tickerCallback = (delta: number) => {
      blinkTimerRef.current += delta;
      if (blinkTimerRef.current > 180 + Math.random() * 120) {
        isBlinkingRef.current = true;
        blinkTimerRef.current = 0;
        blinkDurationRef.current = 0;
      }

      if (isBlinkingRef.current) {
        blinkDurationRef.current += delta;
      }
    };

    app.ticker.add(tickerCallback);

    return () => {
      isMounted = false;
      window.removeEventListener("mousemove", handleMouseMove);
      if (cleanupListeners) cleanupListeners();
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  // Trigger natural body motions on state changes
  useEffect(() => {
    const model = modelRef.current;
    if (!model || !isLoaded) return;

    try {
      if (characterState === "talking") {
        model.motion("Love");
      } else if (characterState === "thinking") {
        model.motion("Shock");
      } else {
        model.motion("Idle");
      }
    } catch {}
  }, [characterState, isLoaded]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden pointer-events-auto select-none ${className}`}
    >
      {loadError && (
        <div className="absolute top-1/2 -translate-y-1/2 p-4 rounded-xl bg-black/80 border border-rose-500/40 text-rose-300 font-mono text-xs max-w-sm text-center">
          Live2D initialization: {loadError}
        </div>
      )}
    </div>
  );
};


