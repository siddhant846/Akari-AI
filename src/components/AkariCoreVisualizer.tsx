import React, { useEffect, useRef, useState } from "react";
import { AkariAudioSession, LiveState } from "../lib/audio";
import { Sparkles, Video, Camera, Radio, RefreshCw } from "lucide-react";
import { getVTubeStudioClient } from "../lib/vtsClient";
import { AkariLive2DViewer } from "./AkariLive2DViewer";

export type AkariEmotion =
  | "idle"
  | "happy"
  | "excited"
  | "curious"
  | "thinking"
  | "proud"
  | "sad"
  | "confused"
  | "surprised"
  | "embarrassed"
  | "playful"
  | "angry"
  | "annoyed"
  | "flustered"
  | "sleepy"
  | "smug"
  | "caring"
  | "focused";

interface AkariCoreVisualizerProps {
  session: AkariAudioSession | null;
  state: LiveState;
  themeColor: string; // Violet, crimson, emerald, celestial, gold, rose, charcoal
  activeEmotion?: AkariEmotion;
  characterState: "idle" | "thinking" | "talking";
  backgroundVideo?: string;
  avatarStyle: "character" | "orb" | "vts" | "jrsidd";
  cursorTrackingEnabled?: boolean;
}

export const AkariCoreVisualizer: React.FC<AkariCoreVisualizerProps> = ({
  session,
  state,
  themeColor,
  activeEmotion = "idle",
  characterState,
  backgroundVideo,
  avatarStyle,
  cursorTrackingEnabled = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Video element refs for character state machine
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const thinkingVideoRef = useRef<HTMLVideoElement | null>(null);
  const talkingVideoRef = useRef<HTMLVideoElement | null>(null);
  const vtsVideoRef = useRef<HTMLVideoElement | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [vtsStream, setVtsStream] = useState<MediaStream | null>(null);
  const [vtsError, setVtsError] = useState<string | null>(null);

  // Chroma Key State for transparent background removal
  const [chromaKeyMode, setChromaKeyMode] = useState<"green" | "blue" | "magenta" | "custom" | "off">("green");
  const [customColor, setCustomColor] = useState<[number, number, number]>([0, 255, 0]);
  const [similarity, setSimilarity] = useState<number>(0.38);
  const [smoothness, setSmoothness] = useState<number>(0.12);
  const [showChromaControls, setShowChromaControls] = useState<boolean>(false);
  const chromaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chromaAnimIdRef = useRef<number | null>(null);

  // Real-time 60FPS Chroma Key render loop
  useEffect(() => {
    if (avatarStyle !== "vts" || !vtsStream) {
      if (chromaAnimIdRef.current) cancelAnimationFrame(chromaAnimIdRef.current);
      return;
    }

    const processFrame = () => {
      const video = vtsVideoRef.current;
      const canvas = chromaCanvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);

          if (chromaKeyMode !== "off") {
            const frame = ctx.getImageData(0, 0, w, h);
            const data = frame.data;
            const len = data.length;

            let targetR = 0, targetG = 255, targetB = 0;
            if (chromaKeyMode === "blue") { targetR = 0; targetG = 0; targetB = 255; }
            else if (chromaKeyMode === "magenta") { targetR = 255; targetG = 0; targetB = 255; }
            else if (chromaKeyMode === "custom") {
              targetR = customColor[0]; targetG = customColor[1]; targetB = customColor[2];
            }

            const threshold = similarity * 255;
            const smooth = smoothness * 255;

            for (let i = 0; i < len; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];

              if (chromaKeyMode === "green") {
                // Smart green detection (keys out #009158, pure green #00FF00, etc. while preserving pink/skin)
                const isGreenDominant = g > 50 && g > r * 1.12 && g > b * 1.12;
                const diffToPreset = Math.sqrt((r - 0) ** 2 + (g - 145) ** 2 + (b - 88) ** 2);
                const diffToPure = Math.sqrt((r - 0) ** 2 + (g - 255) ** 2 + (b - 0) ** 2);

                if (isGreenDominant || diffToPreset < threshold || diffToPure < threshold) {
                  const greenExcess = Math.min(g - r, g - b);
                  if (greenExcess > 18 || diffToPreset < threshold * 0.7 || diffToPure < threshold * 0.7) {
                    data[i + 3] = 0; // 100% Transparent
                  } else {
                    data[i + 3] = Math.round(Math.max(0, Math.min(255, (1 - greenExcess / 18) * 255)));
                  }
                }
              } else {
                const diff = Math.sqrt(
                  (r - targetR) ** 2 +
                  (g - targetG) ** 2 +
                  (b - targetB) ** 2
                );

                if (diff < threshold) {
                  data[i + 3] = 0;
                } else if (diff < threshold + smooth) {
                  data[i + 3] = Math.round(((diff - threshold) / smooth) * 255);
                }
              }
            }

            ctx.putImageData(frame, 0, 0);
          }
        }
      }

      chromaAnimIdRef.current = requestAnimationFrame(processFrame);
    };

    chromaAnimIdRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (chromaAnimIdRef.current) cancelAnimationFrame(chromaAnimIdRef.current);
    };
  }, [avatarStyle, vtsStream, chromaKeyMode, customColor, similarity, smoothness]);

  const startVtsCamera = async () => {
    setVtsError(null);
    try {
      // Find VTubeStudioCam if available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vtsCam = devices.find(
        (d) =>
          d.kind === "videoinput" &&
          (d.label.toLowerCase().includes("vtube") ||
            d.label.toLowerCase().includes("vts") ||
            d.label.toLowerCase().includes("obs") ||
            d.label.toLowerCase().includes("virtual"))
      );

      const constraints: MediaStreamConstraints = {
        video: vtsCam?.deviceId
          ? {
              deviceId: { exact: vtsCam.deviceId },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              frameRate: { ideal: 60, min: 30 },
            }
          : {
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              frameRate: { ideal: 60, min: 30 },
            },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setVtsStream(stream);
      if (vtsVideoRef.current) {
        vtsVideoRef.current.srcObject = stream;
        vtsVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      // Fallback to screen/window capture if virtual camera isn't installed/allowed
      setVtsError(err.message || "Failed to start camera");
    }
  };

  const startVtsWindowCapture = async () => {
    setVtsError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "window",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        } as any,
        audio: false,
      });
      setVtsStream(stream);
      if (vtsVideoRef.current) {
        vtsVideoRef.current.srcObject = stream;
        vtsVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setVtsError(err.message || "Capture cancelled");
    }
  };

  // Auto-connect VTS camera if avatarStyle is vts
  useEffect(() => {
    if (avatarStyle === "vts" && !vtsStream) {
      startVtsCamera();
    }
    if (avatarStyle !== "vts" && vtsStream) {
      vtsStream.getTracks().forEach((t) => t.stop());
      setVtsStream(null);
    }
  }, [avatarStyle]);

  // Keep video element synced with stream
  useEffect(() => {
    if (vtsVideoRef.current && vtsStream) {
      vtsVideoRef.current.srcObject = vtsStream;
      vtsVideoRef.current.play().catch(() => {});
    }
  }, [vtsStream, avatarStyle]);

  const handleVideoError = (videoName: string) => {
    console.warn(`[Akari Web Video] Failed to load video source for: ${videoName}`);
    setHasError(true);
  };

  // Interaction and tracking references
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.4 });
  const targetMouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.4 });

  // Physics & Animation states
  const speechVolumeRef = useRef<number>(0);
  const glowRingRef = useRef<number>(0);
  const emotionFlashRef = useRef<number>(0);
  const lastEmotionRef = useRef<AkariEmotion>(activeEmotion);

  // Floating sci-fi background particle arrays
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    speed: number;
    size: number;
    opacity: number;
  }>>([]);

  // Synchronized video playback state manager (highly polished and flicker-free)
  useEffect(() => {
    const playVideo = (videoEl: HTMLVideoElement | null) => {
      if (!videoEl) return;
      try {
        videoEl.currentTime = 0;
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.warn("Autoplay block detected, retrying muted play:", error);
          });
        }
      } catch (err) { }
    };

    const pauseVideo = (videoEl: HTMLVideoElement | null) => {
      if (!videoEl) return;
      try {
        videoEl.pause();
      } catch (err) { }
    };

    if (characterState === "idle") {
      playVideo(idleVideoRef.current);
      pauseVideo(thinkingVideoRef.current);
      pauseVideo(talkingVideoRef.current);
    } else if (characterState === "thinking") {
      playVideo(thinkingVideoRef.current);
      pauseVideo(idleVideoRef.current);
      pauseVideo(talkingVideoRef.current);
    } else if (characterState === "talking") {
      playVideo(talkingVideoRef.current);
      pauseVideo(idleVideoRef.current);
      pauseVideo(thinkingVideoRef.current);
    }
  }, [characterState]);

  // Cursor position tracking hook
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      targetMouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Theme matching mapping function (extremely beautiful cinematic color tones)
  const getGlowColors = () => {
    switch (themeColor) {
      case "violet":
        return { primary: "rgba(147, 51, 234, 1)", secondary: "rgba(192, 38, 211, 0.8)", glow: "rgba(168, 85, 247, 0.7)" };
      case "crimson":
        return { primary: "rgba(225, 29, 72, 1)", secondary: "rgba(234, 88, 12, 0.8)", glow: "rgba(244, 63, 94, 0.7)" };
      case "emerald":
        return { primary: "rgba(5, 150, 105, 1)", secondary: "rgba(13, 148, 136, 0.8)", glow: "rgba(16, 185, 129, 0.7)" };
      case "celestial":
        return { primary: "rgba(2, 132, 199, 1)", secondary: "rgba(8, 145, 178, 0.8)", glow: "rgba(14, 165, 233, 0.7)" };
      case "gold":
        return { primary: "rgba(202, 138, 4, 1)", secondary: "rgba(217, 119, 6, 0.8)", glow: "rgba(234, 179, 8, 0.7)" };
      case "rose":
        return { primary: "rgba(219, 39, 119, 1)", secondary: "rgba(220, 38, 38, 0.8)", glow: "rgba(236, 72, 153, 0.7)" };
      default:
        return { primary: "rgba(34, 211, 238, 1)", secondary: "rgba(79, 70, 229, 0.8)", glow: "rgba(6, 182, 212, 0.7)" };
    }
  };

  // Main high speed Canvas graphics rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    // Generate responsive background floating stars
    const generateParticles = () => {
      const count = Math.min(60, Math.floor(width / 24));
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height + height * 0.1,
        speed: Math.random() * 0.35 + 0.12,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
      }));
    };

    generateParticles();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      generateParticles();
    };

    window.addEventListener("resize", handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const systemTime = performance.now();
      const colors = getGlowColors();

      // Dynamic Audio analysis fetching from real voice session
      let audioLevel = 0;
      let bufferLength = 64;
      const dataArray = new Uint8Array(bufferLength);
      let activeAnalyser = null;

      if (state === "speaking" && session?.outputAnalyser) {
        activeAnalyser = session.outputAnalyser;
      } else if (state === "listening" && session?.inputAnalyser) {
        activeAnalyser = session.inputAnalyser;
      }

      if (activeAnalyser) {
        try {
          activeAnalyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          audioLevel = sum / bufferLength; // 0 to 255
        } catch (e) { }
      }

      // Smooth amplitude tracking for real-time particle excitation
      speechVolumeRef.current += (audioLevel / 255 - speechVolumeRef.current) * 0.2;

      // Stream lip sync volume, state and active emotion to VTube Studio Live2D model
      getVTubeStudioClient().setAudioAmplitude(
        speechVolumeRef.current,
        state === "speaking",
        state === "listening",
        activeEmotion
      );

      // Emotion change flash (decays from 1 to 0)
      if (lastEmotionRef.current !== activeEmotion) {
        emotionFlashRef.current = 1;
        lastEmotionRef.current = activeEmotion;
      }
      emotionFlashRef.current *= 0.96;

      // Voice-reactive glow ring (smoothed)
      const targetRing = state === "speaking" ? speechVolumeRef.current * 1.2 : 0;
      glowRingRef.current += (targetRing - glowRingRef.current) * 0.15;

      // Cinematic ambient stardust sizing
      const baseScale = height / 440;
      const s = Math.max(0.95, Math.min(1.85, baseScale)); // scale multiplier

      // Smooth cursor mouse tracking lag
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.05;

      const centerX = width / 2;

      // ─── Holographic Canvas Effects ───────────────────────────────
      // Particles
      const pCount = particlesRef.current.length;
      for (let i = 0; i < pCount; i++) {
        const p = particlesRef.current[i];
        // Float upward slowly
        p.y -= p.speed;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        // Sway gently
        p.x += Math.sin(systemTime * 0.001 + i) * 0.08;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        const alpha = p.opacity * (0.6 + 0.4 * Math.sin(systemTime * 0.002 + i * 0.5));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      // Bottom glow ring (character pedestal light)
      const ringY = height - 40;
      const ringPulse = 1 + 0.02 * Math.sin(systemTime * 0.002);
      const ringAudioBoost = 1 + glowRingRef.current * 0.3;
      const ringRadius = width * 0.2 * ringPulse * ringAudioBoost;
      const gradient = ctx.createRadialGradient(centerX, ringY, 0, centerX, ringY, ringRadius);
      const c = colors;
      gradient.addColorStop(0, c.primary.replace('1)', '0.6)'));
      gradient.addColorStop(0.3, c.secondary.replace('0.8)', '0.25)'));
      gradient.addColorStop(0.7, c.glow.replace('0.7)', '0.08)'));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, ringY - ringRadius, width, ringRadius + 20);

      // Thin bright ring line
      ctx.beginPath();
      ctx.ellipse(centerX, ringY, ringRadius * 0.9, 8 * ringPulse * ringAudioBoost, 0, 0, Math.PI * 2);
      ctx.strokeStyle = c.primary.replace('1)', `${0.15 + glowRingRef.current * 0.3})`);
      ctx.lineWidth = 2;
      ctx.stroke();

      // Scanline holographic effect (subtle horizontal lines)
      ctx.fillStyle = 'rgba(0, 255, 255, 0.02)';
      const scanOffset = (systemTime * 0.03) % 6;
      for (let y = scanOffset; y < height; y += 6) {
        ctx.fillRect(0, y, width, 1);
      }

      // Vertical holographic faint grid lines
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.015)';
      ctx.lineWidth = 1;
      const vGridSpacing = width / 20;
      for (let x = 0; x < width; x += vGridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Radial light rays from bottom center
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + systemTime * 0.0001;
        const rayLen = ringRadius * (2 + 0.5 * Math.sin(systemTime * 0.001 + i));
        ctx.beginPath();
        ctx.moveTo(centerX, ringY);
        ctx.lineTo(
          centerX + Math.cos(angle) * rayLen,
          ringY + Math.sin(angle) * rayLen * 0.15
        );
        ctx.strokeStyle = `rgba(${i % 2 === 0 ? '150, 100, 255' : '100, 200, 255'}, ${0.03 + glowRingRef.current * 0.06})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [session, state, themeColor, activeEmotion, characterState]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* 1. Deep Immersive Cinematic Background (Z-index 0) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
        {/* Base dark space */}
        <div className={`absolute inset-0 transition-colors duration-1000 ${avatarStyle === 'orb' ? 'bg-[#080008]' : backgroundVideo === 'solid' ? (
            themeColor === 'violet' ? 'bg-[#0f0724]' :
              themeColor === 'crimson' ? 'bg-[#1a0508]' :
                themeColor === 'emerald' ? 'bg-[#04140d]' :
                  themeColor === 'celestial' ? 'bg-[#040f1a]' :
                    themeColor === 'gold' ? 'bg-[#1a1103]' :
                      themeColor === 'rose' ? 'bg-[#1a0611]' :
                        'bg-[#060814]'
          ) : 'bg-[#020205]'
          }`} />

        {/* Dynamic breathing nebula gradient (Hidden if video is solid) */}
        {backgroundVideo !== "solid" && avatarStyle !== "orb" && (
          <div className={`absolute w-[150vw] h-[150vh] rounded-full blur-[140px] opacity-40 bg-gradient-to-tr transition-all duration-1000 ease-in-out ${themeColor === "violet" ? "from-purple-900/50 via-violet-600/20 to-fuchsia-900/10" :
            themeColor === "crimson" ? "from-rose-900/50 via-red-600/20 to-orange-900/10" :
              themeColor === "emerald" ? "from-emerald-900/50 via-teal-600/20 to-emerald-900/10" :
                themeColor === "celestial" ? "from-sky-900/50 via-indigo-600/20 to-cyan-900/10" :
                  themeColor === "gold" ? "from-amber-900/50 via-yellow-600/20 to-orange-900/10" :
                    themeColor === "rose" ? "from-rose-900/50 via-pink-600/20 to-purple-900/10" :
                      "from-indigo-900/50 via-slate-800/20 to-cyan-900/10"
            } ${characterState === "talking" ? "scale-110 animate-pulse" :
              characterState === "thinking" ? "scale-95 opacity-20" : "scale-100"
            }`} />
        )}

        {/* Video Background Layer (Requires user to place bg-<theme>.webm in /assets) */}
        {backgroundVideo && backgroundVideo !== "solid" && avatarStyle !== "orb" && (
          <div className="absolute inset-0 w-full h-full opacity-100 transition-opacity duration-1000">
            <video
              key={`bg-video-${backgroundVideo}`}
              src={`/assets/${backgroundVideo}`}
              loop
              muted
              playsInline
              autoPlay
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide video if it doesn't exist, falling back to CSS gradient
                (e.target as HTMLVideoElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Extra atmospheric vignette overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000000_100%)] opacity-80" />
      </div>

      {/* Character glow backdrop (separates character from scanlines) */}
      <div className="absolute inset-0 z-[8] pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60vw] h-[60vh] bg-gradient-to-t from-indigo-900/10 via-transparent to-transparent blur-[60px]" />
      </div>

      {/* Canvas holographic effects behind video */}
      <canvas
        id="akari-hologram-living-canvas"
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-[6]"
      />

      {/* 2. Character Videos state crossfade manager (Z-index 10 — on top of canvas for crispness) */}
      <div
        id="akari-animated-presence"
        className="absolute inset-0 z-10 w-full h-full flex items-center justify-center pointer-events-auto [transform:translateZ(0)]"
      >
        <div className="absolute inset-0 w-full h-full select-none pointer-events-none">
          {avatarStyle === "vts" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto">
              {vtsStream ? (
                <div className="relative h-full max-h-[88vh] w-auto flex items-center justify-center">
                  {/* Hidden video source element */}
                  <video
                    ref={vtsVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="hidden"
                  />
                  {/* Real-time Chroma Key & Alpha processed canvas */}
                  <canvas
                    ref={chromaCanvasRef}
                    className={`h-full max-h-[88vh] w-auto object-contain object-bottom transition-all duration-300 [filter:drop-shadow(0_0_30px_rgba(236,72,153,0.3))] ${
                      characterState === "talking" ? "scale-105" : "scale-100"
                    }`}
                  />

                  {/* Floating sci-fi status & Chroma Key controls */}
                  <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                    <button
                      onClick={() => setShowChromaControls(!showChromaControls)}
                      className="bg-black/70 hover:bg-black/90 border border-pink-500/40 px-3 py-1 text-[10px] font-mono text-pink-300 rounded-full flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
                      BG REMOVER: {chromaKeyMode.toUpperCase()}
                    </button>
                  </div>

                  {/* Chroma Key settings dropdown */}
                  {showChromaControls && (
                    <div className="absolute top-12 right-4 bg-black/90 border border-pink-500/40 p-4 rounded-xl text-left font-mono text-xs z-30 shadow-2xl backdrop-blur-xl space-y-3 min-w-[220px]">
                      <div className="text-[10px] font-bold text-pink-300 uppercase tracking-wider">
                        Chroma Key Blend
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["green", "blue", "magenta", "off"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setChromaKeyMode(m)}
                            className={`px-2 py-1 rounded text-[10px] uppercase border transition cursor-pointer ${
                              chromaKeyMode === m
                                ? "bg-pink-500/30 text-white border-pink-400 font-bold"
                                : "bg-black/40 text-slate-400 border-white/10 hover:border-white/30"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>CUTOFF TOLERANCE</span>
                          <span>{Math.round(similarity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="0.8"
                          step="0.02"
                          value={similarity}
                          onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                          className="w-full accent-pink-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center bg-black/80 border border-pink-500/30 p-8 rounded-2xl max-w-md text-center backdrop-blur-xl shadow-[0_0_50px_rgba(236,72,153,0.15)] pointer-events-auto">
                  <Radio size={36} className="text-pink-400 mb-3 animate-pulse" />
                  <h3 className="font-mono text-base text-white uppercase tracking-wider mb-2 font-bold">
                    VTube Studio Live Stream
                  </h3>
                  <p className="font-mono text-xs text-slate-300 mb-6 leading-relaxed">
                    Display your live Akari Live2D avatar directly on stage in place of the orb.
                  </p>
                  <div className="flex flex-col gap-2.5 w-full">
                    <button
                      onClick={startVtsCamera}
                      className="px-5 py-3 bg-pink-500/20 hover:bg-pink-500/40 border border-pink-400/60 text-pink-200 font-mono text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Camera size={16} /> Connect VTS Virtual Camera
                    </button>
                    <button
                      onClick={startVtsWindowCapture}
                      className="px-5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-mono text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Video size={16} /> Select VTube Studio Window
                    </button>
                  </div>
                  {vtsError && (
                    <p className="mt-3 text-[11px] font-mono text-rose-400">
                      {vtsError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : avatarStyle === "character" ? (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
              <AkariLive2DViewer
                session={session}
                characterState={characterState}
                activeEmotion={activeEmotion}
                cursorTrackingEnabled={cursorTrackingEnabled}
              />
            </div>
          ) : avatarStyle === "jrsidd" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {/* Jr. Sidd Cyber AI Hologram / Wingman Core */}
              <div className="relative w-80 h-80 flex items-center justify-center">
                {/* Outer spinning cyber tech rings */}
                <div className={`absolute inset-0 rounded-full border-2 border-cyan-400/40 border-dashed animate-spin [animation-duration:20s] transition-transform duration-300 ${
                  characterState === "talking" ? "scale-110 border-cyan-300 shadow-[0_0_30px_rgba(6,182,212,0.6)]" : ""
                }`} />
                <div className="absolute inset-4 rounded-full border border-sky-500/30 border-t-cyan-400 animate-spin [animation-duration:12s] [animation-direction:reverse]" />
                <div className="absolute inset-8 rounded-full border border-cyan-500/20" />
                
                {/* Center Core Pulsing Hologram */}
                <div className={`relative w-48 h-48 rounded-full bg-gradient-to-tr from-cyan-950 via-slate-900 to-sky-900 border border-cyan-400/60 shadow-[0_0_50px_rgba(6,182,212,0.4)] flex flex-col items-center justify-center overflow-hidden transition-all duration-300 ${
                  characterState === "talking" ? "scale-105 shadow-[0_0_70px_rgba(6,182,212,0.7)]" : ""
                }`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.3)_0,transparent_70%)] animate-pulse" />
                  
                  {/* Cyber Face / Eye / Emblem */}
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-5">
                      <div className={`w-7 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.9)] transition-all duration-200 ${
                        characterState === "talking" ? "h-5 bg-cyan-300" : characterState === "thinking" ? "h-1.5 w-5 opacity-60" : "h-2.5"
                      }`} />
                      <div className={`w-7 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.9)] transition-all duration-200 ${
                        characterState === "talking" ? "h-5 bg-cyan-300" : characterState === "thinking" ? "h-1.5 w-5 opacity-60" : "h-2.5"
                      }`} />
                    </div>
                    
                    {/* Audio reactive mouth line */}
                    <div className={`rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.8)] transition-all duration-100 ${
                      characterState === "talking" ? "w-14 h-2.5 animate-pulse" : characterState === "thinking" ? "w-6 h-1 opacity-40" : "w-10 h-1.5 opacity-70"
                    }`} />
                  </div>

                  {/* Cyber Grid Overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.05)_1px,transparent_1px)] bg-[size:12px_12px] pointer-events-none" />
                </div>

                {/* Cyber HUD Badge */}
                <div className="absolute -bottom-10 px-4 py-1.5 bg-black/90 border border-cyan-500/50 text-cyan-300 font-mono text-xs uppercase tracking-widest rounded-full shadow-[0_0_25px_rgba(6,182,212,0.4)] backdrop-blur-md flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-bold">JR. SIDD // MALE AI WINGMAN</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img 
                src="/assets/orb2.gif"
                alt="Aegis Core" 
                className={`transition-all duration-700 ease-in-out object-contain w-full h-full ${
                  characterState === "idle" ? "scale-90 opacity-90" :
                  characterState === "thinking" ? "scale-75 opacity-70" :
                  "scale-100 opacity-100"
                }`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
