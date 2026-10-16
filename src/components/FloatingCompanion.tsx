import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Maximize2,
  Heart,
  Sparkles,
  Ghost,
} from "lucide-react";
import { AkariLive2DViewer } from "./AkariLive2DViewer";
import { bondingEngine } from "../lib/bondingEngine";

interface FloatingCompanionProps {
  session: any;
  characterState: "idle" | "listening" | "thinking" | "talking";
  activeEmotion: string;
  onRestore: () => void;
  onToggleMic: () => void;
  cursorTrackingEnabled?: boolean;
  standalone?: boolean;
}

export type CompanionPosture = "sitting" | "standing";

export const FloatingCompanion: React.FC<FloatingCompanionProps> = ({
  session,
  characterState,
  activeEmotion,
  onRestore,
  onToggleMic,
  cursorTrackingEnabled = false,
  standalone = false,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("I'm right here with you, Master Siddhant!");
  const [posture, setPosture] = useState<CompanionPosture>("sitting"); // Default to sitting
  const [isClickThrough, setIsClickThrough] = useState(false); // Mouse click-through mode

  // Dragging states
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 0, posY: 0 });

  const bonding = bondingEngine.getProfile();

  // Apply Electron Click-Through if in Desktop App
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.setIgnoreMouseEvents === "function") {
      electronAPI.setIgnoreMouseEvents(isClickThrough, { forward: true });
    }
  }, [isClickThrough]);

  const handlePetClick = (e: React.MouseEvent) => {
    if (isDragging || isClickThrough) return;
    bondingEngine.recordInteraction(1, true);
    setShowBubble(true);
    const quips = [
      "Master, I'm watching your screen and ready to assist!",
      "Hehe, that tickles! How is your work going, Siddhant?",
      "You're doing great today, Siddhant! Keep it up.",
      "Sitting right on your panel so I never get in your way!",
      "I'm keeping an eye on your workflow. Tell me if you need anything!",
    ];
    setBubbleText(quips[Math.floor(Math.random() * quips.length)]);
    setTimeout(() => setShowBubble(false), 5000);
  };

  // Drag handlers (for embedded / pip window dragging)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isClickThrough) return;
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest(".no-drag")) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const containerClasses = standalone
    ? "w-full h-full flex flex-col items-center justify-between p-2 select-none overflow-hidden bg-transparent"
    : "fixed bottom-4 right-8 z-50 flex flex-col items-end pointer-events-auto select-none animate-in fade-in zoom-in-90 duration-300";

  return (
    <div
      className={containerClasses}
      style={{
        transform: standalone ? undefined : `translate(${position.x}px, ${position.y}px)`,
        transition: isDragging ? "none" : "transform 0.3s ease-out",
        pointerEvents: isClickThrough ? "none" : "auto",
      }}
    >
      {/* Speech Bubble */}
      {showBubble && !isClickThrough && (
        <div className="mb-2 max-w-[240px] rounded-2xl border border-pink-400/40 bg-black/80 p-3 text-xs font-mono text-pink-200 shadow-[0_10px_30px_rgba(236,72,153,0.3)] backdrop-blur-xl animate-in slide-in-from-bottom-2 z-30">
          <div className="flex items-center gap-1.5 text-[10px] text-pink-400 font-bold mb-1">
            <Sparkles size={12} /> Akari Companion
          </div>
          {bubbleText}
        </div>
      )}

      {/* Main Companion Container - 100% Transparent Background */}
      <div
        onMouseDown={handleMouseDown}
        className={`relative ${
          standalone ? "w-full h-full" : "w-72 h-88"
        } flex flex-col items-center justify-between bg-transparent border-0 shadow-none p-2 group transition-all duration-300 ${
          isDragging ? "cursor-grabbing opacity-90 scale-95" : isClickThrough ? "cursor-default" : "cursor-grab"
        }`}
      >
        {/* Top Floating Controls Overlay */}
        <div className="w-full flex items-center justify-between z-20 px-1 py-1 no-drag pointer-events-auto opacity-80 group-hover:opacity-100 transition-opacity duration-200">
          {/* Affection / Bonding Pill */}
          <div
            onClick={handlePetClick}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-pink-500/40 text-[10px] font-mono text-pink-300 shadow-md cursor-pointer hover:scale-105 transition"
            title="Click to interact & boost affection!"
          >
            <Heart size={11} className="text-pink-400 fill-pink-400 animate-pulse" />
            <span>{bonding.affectionScore}%</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Click-Through (Ghost Mode) Toggle */}
            <button
              onClick={() => setIsClickThrough(!isClickThrough)}
              className={`p-1.5 rounded-full backdrop-blur-md border transition ${
                isClickThrough
                  ? "bg-cyan-500/40 text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  : "bg-black/60 hover:bg-black/80 text-white/80 border-white/20"
              }`}
              title={isClickThrough ? "Disable Click-Through (Interactive Mode)" : "Enable Click-Through (Ghost Mode)"}
            >
              <Ghost size={12} />
            </button>

            {/* Posture Toggle: Sit on Panel vs Stand */}
            <button
              onClick={() => setPosture(posture === "sitting" ? "standing" : "sitting")}
              className="px-2.5 py-1 rounded-full bg-black/60 hover:bg-cyan-950/80 backdrop-blur-md border border-cyan-500/40 text-[10px] font-mono text-cyan-300 shadow-md transition"
              title="Toggle Posture: Sit on Panel vs Stand"
            >
              {posture === "sitting" ? "🪑 Sit" : "🧍 Stand"}
            </button>

            {/* Restore / Expand to Full App */}
            <button
              onClick={onRestore}
              className="p-1.5 rounded-full bg-black/60 hover:bg-white/20 backdrop-blur-md text-white/80 border border-white/20 transition"
              title="Restore Full Application Window"
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>

        {/* Live2D Avatar View - Floating Transparent Character */}
        <div
          onClick={handlePetClick}
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer bg-transparent"
        >
          <AkariLive2DViewer
            session={session}
            characterState={characterState}
            activeEmotion={activeEmotion as any}
            cursorTrackingEnabled={cursorTrackingEnabled}
            posture={posture}
          />
        </div>

        {/* Bottom Floating Status Bar */}
        <div className="flex items-center justify-between z-20 px-3 py-1 rounded-full bg-black/60 border border-cyan-500/30 backdrop-blur-md shadow-lg no-drag pointer-events-auto opacity-80 group-hover:opacity-100 transition-opacity duration-200 gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                characterState === "talking"
                  ? "bg-pink-400 animate-ping"
                  : characterState === "listening"
                  ? "bg-cyan-400 animate-pulse"
                  : "bg-emerald-400"
              }`}
            />
            <span className="text-[10px] font-mono uppercase text-slate-200 font-bold">
              {characterState}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                onToggleMic();
              }}
              className={`p-1 rounded-full transition ${
                isMuted
                  ? "bg-rose-500/40 text-rose-300 border border-rose-500/50"
                  : "bg-cyan-500/40 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/60"
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMuted ? <MicOff size={11} /> : <Mic size={11} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
