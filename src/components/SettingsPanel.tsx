import React, { useEffect, useState } from "react";
import {
  Settings,
  X,
  Power,
  Mic,
  Cpu,
  Info,
  Check,
  AlertTriangle,
  Sparkles,
  Key,
  CheckCircle2,
  Radio,
  UserCheck,
  Fingerprint,
  AudioLines,
  RefreshCw,
  Zap,
  Layers,
  Send,
  Globe,
  Database,
  Terminal,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getVTubeStudioClient, type VTSStatus } from "../lib/vtsClient";
import {
  AkariSettings,
  GEMINI_VOICES,
  AKARI_VOICES,
  JR_SIDD_VOICES,
  PERSONA_PRESETS,
  getDevicePlatform,
} from "../lib/settingsStore";
import { globalVoiceBiometrics } from "../lib/voiceBiometrics";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AkariSettings;
  onChange: (patch: Partial<AkariSettings>) => void;
  themeColor?: string;
  onVoiceChange?: (voice: string) => void;
}

type SettingsTab = "general" | "persona" | "voice" | "offline" | "livestream" | "system" | "about";

export const AVATAR_EMBODIMENTS = [
  {
    id: "character" as const,
    name: "Akari",
    subtitle: "Anime Companion (Live2D)",
    icon: "🌸",
    tagline: "Live2D Anime Girl with 17 emotional states, real-time lip-sync, and interactive mouse gaze tracking",
    voice: "Kore (Female)",
  },
  {
    id: "jrsidd" as const,
    name: "Jr. Sidd",
    subtitle: "Male AI Wingman (Cyber Core)",
    icon: "⚡",
    tagline: "Siddhant's male AI digital twin & wingman. Futuristic cyber hologram core with neon rings, cyber eyes & brotherly male voice",
    voice: "Fenrir (Male)",
  },
  {
    id: "orb" as const,
    name: "Aegis Core",
    subtitle: "Holographic Plasma Orb",
    icon: "🔮",
    tagline: "Futuristic pulsating plasma holographic audio orb visualizer with reactive frequency spectrum",
    voice: "Charon / Puck (Male)",
  },
  {
    id: "vts" as const,
    name: "VTube Studio",
    subtitle: "External Live2D Stage",
    icon: "🎭",
    tagline: "Bridge to external VTube Studio models via local WebSocket port 8001 with motion and expression triggers",
    voice: "Kore / Any",
  },
];

function ToggleRow({ 
  label, 
  description, 
  checked, 
  onChange 
}: { 
  label: string; 
  description?: string; 
  checked: boolean; 
  onChange: (v: boolean) => void 
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-black/40 border-l-2 border-cyan-500/20 hover:border-cyan-400 transition-all duration-300 group relative">
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10">
        <div className="text-sm font-mono text-cyan-50 tracking-wider uppercase">{label}</div>
        {description && (
          <div className="text-[10px] font-mono text-cyan-600/70 mt-1 uppercase tracking-widest">
            {description}
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer border transition-colors duration-300 ease-in-out focus:outline-none z-10 ${
          checked ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-black/80 border-cyan-900/50'
        }`}
        style={{ clipPath: "polygon(20% 0, 100% 0, 80% 100%, 0% 100%)" }}
      >
        <span
          className={`pointer-events-none inline-block h-3 w-4 mt-0.5 transform bg-cyan-300 transition duration-300 ease-in-out ${
            checked ? 'translate-x-4 opacity-100' : 'translate-x-1 opacity-20'
          }`}
          style={{ clipPath: "polygon(20% 0, 100% 0, 80% 100%, 0% 100%)" }}
        />
      </button>
    </div>
  );
}

export function SettingsPanel({ isOpen, onClose, settings, onChange, onVoiceChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [apiKeyStatus, setApiKeyStatus] = useState<string>("");
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
  const [vtsStatus, setVtsStatus] = useState<VTSStatus>({ connected: false, authenticated: false });
  const [agentHealth, setAgentHealth] = useState<{
    online: boolean;
    toolCount?: number;
  }>({ online: false });

  // Voice Calibration & Background Training state
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationStep, setCalibrationStep] = useState<number>(0);
  const [calibrationSuccess, setCalibrationSuccess] = useState<boolean>(false);
  const [bioProfile, setBioProfile] = useState(() => globalVoiceBiometrics.getProfile());

  // Ollama Offline Brain state
  const [ollamaStatus, setOllamaStatus] = useState<{
    online: boolean;
    models: Array<{ name: string; size?: number }>;
    checking: boolean;
    error?: string;
  }>({ online: false, models: [], checking: false });

  const [testPrompt, setTestPrompt] = useState<string>("Hello Akari, introduce yourself!");
  const [testOutput, setTestOutput] = useState<string>("");
  const [isTestingOllama, setIsTestingOllama] = useState<boolean>(false);
  const [testLatency, setTestLatency] = useState<number | null>(null);

  const checkOllama = async () => {
    setOllamaStatus((prev) => ({ ...prev, checking: true, error: undefined }));
    const endpoint = (settings.ollamaEndpoint || "http://localhost:11434").replace(/\/+$/, "");
    
    // 1. Try direct browser connection to Ollama
    try {
      const directRes = await fetch(`${endpoint}/api/tags`, { method: "GET" });
      if (directRes.ok) {
        const data = await directRes.json();
        setOllamaStatus({
          online: true,
          models: data.models || [],
          checking: false,
        });
        return;
      }
    } catch {
      // Direct connection blocked by CORS or mixed content - fallback to backend proxy
    }

    // 2. Try backend proxy
    try {
      const proxyRes = await fetch(`/api/ollama/status?endpoint=${encodeURIComponent(endpoint)}`);
      const contentType = proxyRes.headers.get("content-type") || "";
      if (proxyRes.ok && contentType.includes("application/json")) {
        const data = await proxyRes.json();
        if (data.online) {
          setOllamaStatus({
            online: true,
            models: data.models || [],
            checking: false,
          });
          return;
        }
      }
    } catch {}

    setOllamaStatus({
      online: false,
      models: [],
      checking: false,
      error: "Ollama server unreachable. Restart server or run 'ollama serve'.",
    });
  };

  const handleTestOllamaInference = async () => {
    if (!testPrompt.trim() || isTestingOllama) return;
    setIsTestingOllama(true);
    setTestOutput("");
    const startTime = performance.now();
    const endpoint = (settings.ollamaEndpoint || "http://localhost:11434").replace(/\/+$/, "");
    const model = settings.ollamaModel || "llama3.2";

    // 1. Try direct fetch to Ollama
    try {
      const directRes = await fetch(`${endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          prompt: testPrompt,
          system: "You are Akari, a smart, cute, and helpful AI companion. Keep answers lively, concise, and friendly.",
          stream: false,
        }),
      });
      if (directRes.ok) {
        const data = await directRes.json();
        const elapsed = Math.round(performance.now() - startTime);
        setTestLatency(elapsed);
        setTestOutput(data.response || data.text || "No response received.");
        setIsTestingOllama(false);
        return;
      }
    } catch {}

    // 2. Try proxy endpoint
    try {
      const res = await fetch("/api/ollama/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: testPrompt,
          model: model,
          endpoint: endpoint,
        }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        const elapsed = Math.round(performance.now() - startTime);
        setTestLatency(elapsed);
        if (data.ok) {
          setTestOutput(data.text);
        } else {
          setTestOutput(`Error: ${data.error || "Failed to generate response"}`);
        }
      } else {
        setTestOutput("Please restart your Akari server with .\\start_akari.bat to load backend routes.");
      }
    } catch (err: any) {
      setTestOutput(`Network Error: ${err.message}`);
    } finally {
      setIsTestingOllama(false);
    }
  };

  const startVoiceCalibration = async () => {
    setIsCalibrating(true);
    setCalibrationStep(1);
    setCalibrationSuccess(false);
    globalVoiceBiometrics.startCalibration();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setTimeout(() => setCalibrationStep(2), 1200);
      setTimeout(() => setCalibrationStep(3), 2400);
      setTimeout(() => {
        const updated = globalVoiceBiometrics.finishCalibration();
        setBioProfile({ ...updated });
        setCalibrationSuccess(true);
        setIsCalibrating(false);
        onChange({ voiceProfileEnrolled: true });
        stream.getTracks().forEach(t => t.stop());
      }, 3600);
    } catch (e) {
      console.error("Calibration mic access error:", e);
      setIsCalibrating(false);
      setCalibrationStep(0);
    }
  };

  const handleResetVoiceTraining = () => {
    const fresh = globalVoiceBiometrics.resetTrainingProfile();
    setBioProfile({ ...fresh });
    onChange({ voiceProfileEnrolled: false });
  };

  useEffect(() => {
    if (!isOpen) return;
    setBioProfile(globalVoiceBiometrics.getProfile());
    globalVoiceBiometrics.setBackgroundLearning(settings.backgroundVoiceTraining !== false);
    const vts = getVTubeStudioClient((s) => setVtsStatus(s));
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setHasApiKey(Boolean(d.hasApiKey)))
      .catch(() => {});
    checkOllama();
  }, [isOpen, settings.backgroundVoiceTraining]);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    setApiKeyStatus("Validating & saving key...");
    try {
      const res = await fetch("/api/config/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setHasApiKey(true);
        setApiKeyInput("");
        setApiKeyStatus("API Key saved successfully! Reloading session...");
        setTimeout(() => setApiKeyStatus(""), 4000);
      } else {
        setApiKeyStatus(`Error: ${data.error || "Failed to save key"}`);
      }
    } catch (err: any) {
      setApiKeyStatus(`Error: ${err.message || "Failed to save key"}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const enumerate = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMics(devices.filter((d) => d.kind === "audioinput"));
      } catch {}
    };
    enumerate();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const probe = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8765/health", { cache: "no-store" });
        if (!res.ok) {
          setAgentHealth({ online: false });
          return;
        }
        const data = await res.json();
        setAgentHealth({ online: true, toolCount: data.tool_count });
      } catch {
        try {
          const res2 = await fetch("/api/agent-health", { cache: "no-store" });
          if (res2.ok) {
            const d = await res2.json();
            setAgentHealth({ online: !!d.online, toolCount: d.tool_count });
            return;
          }
        } catch { }
        setAgentHealth({ online: false });
      }
    };
    probe();
    const id = setInterval(probe, 5000);
    return () => clearInterval(id);
  }, [isOpen]);

  const handleSelectEmbodiment = (embId: "character" | "jrsidd" | "orb" | "vts") => {
    const patch: Partial<AkariSettings> = { avatarStyle: embId };
    if (embId === "jrsidd") {
      patch.voice = settings.jrSiddVoice || "Fenrir";
      patch.personaPreset = "jr_sidd";
      const jrPreset = PERSONA_PRESETS.find((p) => p.id === "jr_sidd");
      if (jrPreset) patch.customSystemPrompt = jrPreset.systemPrompt;
    } else if (embId === "character") {
      patch.voice = settings.akariVoice || "Kore";
      patch.personaPreset = "anime_companion";
      const akariPreset = PERSONA_PRESETS.find((p) => p.id === "anime_companion");
      if (akariPreset) patch.customSystemPrompt = akariPreset.systemPrompt;
    }
    onChange(patch);
    if (onVoiceChange && patch.voice) {
      onVoiceChange(patch.voice);
    }
  };

  const renderEmbodimentMatrix = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
          <Sparkles size={14} /> AI Model & Visual Embodiment Matrix
        </label>
        <span className="text-[10px] font-mono text-cyan-600 uppercase">
          ACTIVE: {settings.avatarStyle === "jrsidd" ? "⚡ JR. SIDD (MALE)" : settings.avatarStyle === "orb" ? "🔮 AEGIS CORE" : settings.avatarStyle === "vts" ? "🎭 VTUBE STUDIO" : "🌸 AKARI (LIVE2D)"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AVATAR_EMBODIMENTS.map((emb) => {
          const isSelected = (settings.avatarStyle || "character") === emb.id;
          return (
            <button
              key={emb.id}
              onClick={() => handleSelectEmbodiment(emb.id)}
              className={`p-4 text-left border transition-all duration-300 relative group flex items-start gap-3.5 cursor-pointer ${
                isSelected
                  ? emb.id === "jrsidd"
                    ? "bg-cyan-950/40 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.35)]"
                    : emb.id === "character"
                    ? "bg-pink-950/40 border-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.35)]"
                    : "bg-purple-950/40 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.35)]"
                  : "bg-black/40 border-cyan-900/40 hover:border-cyan-500/50 hover:bg-cyan-950/20"
              }`}
            >
              <div className={`text-2xl p-2 bg-black/60 border rounded-none shrink-0 group-hover:scale-110 transition-transform ${
                emb.id === "jrsidd" ? "border-cyan-500/40 text-cyan-400" : emb.id === "character" ? "border-pink-500/40 text-pink-400" : "border-purple-500/40 text-purple-400"
              }`}>
                {emb.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={`text-xs font-mono uppercase tracking-wider font-bold ${
                    isSelected 
                      ? emb.id === "jrsidd" ? "text-cyan-300" : emb.id === "character" ? "text-pink-300" : "text-purple-300"
                      : "text-white"
                  }`}>
                    {emb.name}
                  </h4>
                  {isSelected ? (
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 border uppercase font-bold ${
                      emb.id === "jrsidd" 
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50" 
                        : emb.id === "character" 
                        ? "bg-pink-500/20 text-pink-300 border-pink-400/50" 
                        : "bg-purple-500/20 text-purple-300 border-purple-400/50"
                    }`}>
                      ACTIVE MODEL
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-cyan-700 uppercase group-hover:text-cyan-400 transition-colors">
                      CLICK TO ACTIVATE
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-cyan-500 uppercase mt-0.5 font-semibold">
                  {emb.subtitle}
                </div>
                <p className="text-[11px] font-mono text-cyan-600/80 mt-1 line-clamp-2 leading-relaxed">
                  {emb.tagline}
                </p>
                <div className="mt-2 text-[9px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span className="text-cyan-400">NEURAL VOICE:</span>{" "}
                  {emb.id === "jrsidd"
                    ? `${settings.jrSiddVoice || "Fenrir"} (Male Only)`
                    : emb.id === "character"
                    ? `${settings.akariVoice || "Kore"} (Female Only)`
                    : emb.voice}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: "general", label: "Sys_Config", icon: Power },
    { id: "persona", label: "Persona & Mind", icon: Sparkles },
    { id: "voice", label: "Audio & TTS", icon: Mic },
    { id: "offline", label: "Offline Brain", icon: Cpu },
    { id: "livestream", label: "Live Stream", icon: Radio },
    { id: "system", label: "Daemon_Link", icon: Layers },
    { id: "about", label: "Core_Stats", icon: Info },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 z-40 backdrop-blur-md bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-auto"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-5xl h-[80vh] max-h-[800px] bg-black/90 backdrop-blur-3xl z-50 flex shadow-[0_0_100px_rgba(6,182,212,0.15)] overflow-hidden"
            style={{ clipPath: "polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 30px 100%, 0 calc(100% - 30px))" }}
          >
            <div className="absolute inset-0 border-2 border-cyan-500/20 pointer-events-none" style={{ clipPath: "polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 30px 100%, 0 calc(100% - 30px))" }} />
            
            {/* Sidebar */}
            <div className="w-64 border-r border-cyan-500/20 bg-cyan-950/10 flex flex-col relative">
              <div className="absolute top-0 left-0 w-8 h-1 bg-cyan-500/50" />
              <div className="absolute top-0 left-0 w-1 h-8 bg-cyan-500/50" />
              
              <div className="p-6 pb-8 border-b border-cyan-500/20 bg-black/40">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 relative overflow-hidden group">
                    <Settings size={22} className="relative z-10" />
                  </div>
                  <div>
                    <h3 className="font-display font-medium text-lg tracking-widest text-white uppercase flex items-center gap-2">
                      SETTINGS
                    </h3>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 mt-0.5 flex items-center gap-1">
                      <Sparkles size={10} /> {settings.avatarStyle === "jrsidd" ? "Jr_Sidd_Core" : settings.avatarStyle === "orb" ? "Aegis_Core" : "Akari_Core"}
                    </p>
                  </div>
                </div>

                {/* Device-Isolated Profile Indicator */}
                <div className={`mt-3.5 p-2.5 rounded-none border text-left ${
                  getDevicePlatform() === "mobile"
                    ? "bg-emerald-950/30 border-emerald-500/40"
                    : "bg-cyan-950/30 border-cyan-500/40"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      getDevicePlatform() === "mobile" ? "text-emerald-300" : "text-cyan-300"
                    }`}>
                      {getDevicePlatform() === "mobile" ? "📱 Mobile Profile" : "🖥️ Desktop Profile"}
                    </span>
                    <span className="text-[8px] font-mono px-1 py-0.2 bg-white/10 text-white uppercase font-bold">
                      ISOLATED
                    </span>
                  </div>
                  <p className="text-[9px] font-mono text-slate-400 mt-1 leading-tight">
                    {getDevicePlatform() === "mobile"
                      ? "Preferences saved exclusively to this phone. Never overrides Desktop PC."
                      : "Preferences saved exclusively to this PC. Never overrides Mobile phone."}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-mono uppercase tracking-wider transition-all duration-300 relative overflow-hidden group cursor-pointer ${
                        isActive
                          ? "text-cyan-300 bg-cyan-500/10 border-l-2 border-cyan-400 shadow-[inset_10px_0_20px_rgba(6,182,212,0.1)]"
                          : "text-cyan-600 hover:text-cyan-400 hover:bg-cyan-950/30 border-l-2 border-transparent"
                      }`}
                    >
                      <Icon size={16} className={isActive ? "text-cyan-400" : "text-cyan-800 group-hover:text-cyan-500"} />
                      <span className="relative z-10">{tab.label}</span>
                      {tab.id === "offline" && settings.offlineBrainEnabled && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="p-4 border-t border-cyan-500/20 bg-black/40 text-[10px] font-mono text-cyan-700 uppercase tracking-widest flex items-center justify-between">
                <span>SYSTEM V2.5</span>
                <span className="text-cyan-400">READY</span>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col bg-black/40 overflow-hidden relative">
              <div className="flex justify-between items-center px-8 py-6 border-b border-cyan-500/20 bg-cyan-950/5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-400 animate-ping" />
                  <span className="text-xs font-mono tracking-widest text-cyan-400 uppercase">
                    // CONTROL_PANEL :: {tabs.find((t) => t.id === activeTab)?.label}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="text-cyan-600 hover:text-cyan-300 p-1 border border-transparent hover:border-cyan-500/30 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-2xl mx-auto space-y-8">
                  
                  {/* GENERAL TAB */}
                  {activeTab === "general" && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      
                      {/* API Key Management Box */}
                      <div className="p-5 bg-black/60 border border-cyan-500/30 rounded-none relative">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                            <Key size={14} className="text-cyan-400" />
                            Gemini Live API Key
                          </label>
                          <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                            hasApiKey
                              ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40"
                              : "bg-rose-950/40 text-rose-400 border-rose-500/40"
                          }`}>
                            {hasApiKey ? "STATUS: ACTIVE" : "STATUS: KEY REQUIRED"}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-cyan-600/80 mb-3 leading-relaxed">
                          Enter your Google AI Studio Gemini API Key. You can get one for free at{" "}
                          <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 underline hover:text-cyan-300"
                          >
                            aistudio.google.com/apikey
                          </a>.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder={hasApiKey ? "•••••••••••••••••••••••• (Key Configured)" : "Paste AIzaSy... API key here"}
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                            className="flex-1 bg-black/80 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={handleSaveApiKey}
                            disabled={isSavingKey || !apiKeyInput.trim()}
                            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-300 font-mono text-xs uppercase tracking-wider transition disabled:opacity-40 cursor-pointer"
                          >
                            {isSavingKey ? "Saving..." : "Update Key"}
                          </button>
                        </div>
                        {apiKeyStatus && (
                          <div className="mt-2 text-[11px] font-mono text-cyan-300">
                            {apiKeyStatus}
                          </div>
                        )}
                      </div>

                      {/* AI Model & Visual Embodiment Matrix */}
                      {renderEmbodimentMatrix()}

                      {/* DeepSeek AI PowerPoint Integration */}
                      <div className="p-5 bg-black/60 border border-indigo-500/30 rounded-none relative">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-mono tracking-widest text-indigo-400 uppercase flex items-center gap-2">
                            <Sparkles size={14} className="text-indigo-400" />
                            DeepSeek AI PowerPoint & Slide Architect
                          </label>
                          <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                            settings.deepseekApiKey
                              ? "bg-indigo-950/40 text-indigo-400 border-indigo-500/40"
                              : "bg-slate-900/60 text-slate-500 border-slate-700"
                          }`}>
                            {settings.deepseekApiKey ? "DEEPSEEK: CONNECTED" : "DEEPSEEK: OPTIONAL"}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-indigo-300/80 mb-3 leading-relaxed">
                          Empower Akari with DeepSeek's advanced reasoning model to generate presentation decks, design layouts, and execute deep slide edits.
                        </p>

                        <div className="space-y-3">
                          <ToggleRow
                            label="Enable DeepSeek AI PowerPoint Engine"
                            description="Use DeepSeek models for presentation structure"
                            checked={settings.enableDeepSeekPpt !== false}
                            onChange={(v) => onChange({ enableDeepSeekPpt: v })}
                          />

                          <div>
                            <label className="block text-[10px] font-mono tracking-widest text-indigo-400 uppercase mb-1">
                              DeepSeek API Key
                            </label>
                            <input
                              type="password"
                              placeholder="sk-..."
                              value={settings.deepseekApiKey || ""}
                              onChange={(e) => onChange({ deepseekApiKey: e.target.value.trim() })}
                              className="w-full bg-black/80 border border-indigo-500/30 text-indigo-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-indigo-400"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono tracking-widest text-indigo-400 uppercase mb-1">
                              DeepSeek Model
                            </label>
                            <input
                              type="text"
                              placeholder="deepseek-chat"
                              value={settings.deepseekModel || "deepseek-chat"}
                              onChange={(e) => onChange({ deepseekModel: e.target.value.trim() })}
                              className="w-full bg-black/80 border border-indigo-500/30 text-indigo-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-indigo-400"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-cyan-400 rounded-full" /> Akari Inner Thoughts Display
                        </label>
                        <ToggleRow
                          label="Akari Inner Thoughts (Holographic Thought Bubble)"
                          description="Shows Akari's silent reasoning & thoughts in an on-screen thought bubble. Turn OFF to completely hide all thoughts."
                          checked={settings.innerThoughtsEnabled !== false}
                          onChange={(v) => {
                            onChange({ innerThoughtsEnabled: v });
                            void fetch("/api/settings", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ innerThoughtsEnabled: v }),
                            }).catch(() => {});
                          }}
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-cyan-400 rounded-full" /> Network & Bandwidth Optimization
                        </label>
                        <ToggleRow
                          label={getDevicePlatform() === "mobile" ? "Low-Bandwidth Mode (Recommended on Mobile Phone)" : "Low-Bandwidth Mode (Data Saver & Weak Wi-Fi)"}
                          description="Reduces audio and visual data consumption by up to 80%, enables VAD silence suppression, and eliminates buffer lag on mobile networks or slow connections"
                          checked={settings.lowBandwidthMode || false}
                          onChange={(v) => onChange({ lowBandwidthMode: v })}
                        />
                      </div>

                      {getDevicePlatform() !== "mobile" && (
                        <div className="space-y-3">
                          <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase flex items-center gap-2">
                            <span className="w-1 h-1 bg-cyan-400 rounded-full" /> Windows Auto-Start (Desktop PC Only)
                          </label>
                          <ToggleRow
                            label="Silent Auto-Start on Login"
                            description="Launch Akari silently in the background when Windows boots"
                            checked={settings.autoStart}
                            onChange={(v) => onChange({ autoStart: v })}
                          />
                        </div>
                      )}

                      <div className="space-y-3">
                        <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-cyan-400 rounded-full" /> UI & Avatar Gaze
                        </label>
                        {getDevicePlatform() !== "mobile" && (
                          <ToggleRow
                            label="Interactive Mouse Gaze"
                            description="Akari's eyes & head follow your mouse cursor"
                            checked={settings.cursorTrackingEnabled !== false}
                            onChange={(v) => onChange({ cursorTrackingEnabled: v })}
                          />
                        )}
                        <ToggleRow
                          label="Kinetic Animations"
                          description="Enable fluid UI and particle effects"
                          checked={settings.animations}
                          onChange={(v) => onChange({ animations: v })}
                        />
                      </div>
                    </div>
                  )}

                  
                  {/* PERSONA & INNER MIND STUDIO TAB */}
                  {activeTab === "persona" && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      
                      {/* AI Model & Visual Embodiment Matrix */}
                      {renderEmbodimentMatrix()}

                      {/* Archetype Selector */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                            <Sparkles size={14} /> Personality Archetype Matrix
                          </label>
                          <span className="text-[10px] font-mono text-cyan-600 uppercase">
                            CURRENT: {settings.personaPreset || "anime_companion"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {PERSONA_PRESETS.map((preset) => {
                            const isSelected = (settings.personaPreset || "anime_companion") === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => {
                                  onChange({
                                    personaPreset: preset.id,
                                    customSystemPrompt: preset.systemPrompt || settings.customSystemPrompt,
                                  });
                                }}
                                className={`p-4 text-left border transition-all duration-300 relative group flex items-start gap-3.5 cursor-pointer ${
                                  isSelected
                                    ? "bg-cyan-950/40 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                                    : "bg-black/40 border-cyan-900/40 hover:border-cyan-500/50 hover:bg-cyan-950/20"
                                }`}
                              >
                                <div className="text-2xl p-2 bg-black/60 border border-cyan-500/20 rounded-none shrink-0 group-hover:scale-110 transition-transform">
                                  {preset.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className={`text-xs font-mono uppercase tracking-wider font-semibold ${isSelected ? "text-cyan-300" : "text-white"}`}>
                                      {preset.name}
                                    </h4>
                                    {isSelected && (
                                      <span className="text-[9px] font-mono bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 border border-cyan-400/40 uppercase">
                                        ACTIVE
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-mono text-cyan-600/80 mt-1 line-clamp-2 leading-relaxed">
                                    {preset.tagline}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Persona & System Prompt Editor */}
                      <div className="space-y-3 p-5 bg-black/60 border border-cyan-500/30 rounded-none relative">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                            <Terminal size={14} /> Persona Directives & System Prompt
                          </label>
                          <button
                            onClick={() => {
                              const currentPreset = PERSONA_PRESETS.find((p) => p.id === (settings.personaPreset || "anime_companion"));
                              if (currentPreset?.systemPrompt) {
                                onChange({ customSystemPrompt: currentPreset.systemPrompt });
                              }
                            }}
                            className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 uppercase underline tracking-wider cursor-pointer"
                          >
                            Reset To Archetype Prompt
                          </button>
                        </div>
                        <p className="text-[10px] font-mono text-cyan-600 uppercase tracking-wider">
                          Injects custom behavioral rules, backstories, speech patterns, and world context directly into Akari's AI brain.
                        </p>
                        <textarea
                          value={
                            settings.customSystemPrompt !== undefined
                              ? settings.customSystemPrompt
                              : PERSONA_PRESETS.find((p) => p.id === (settings.personaPreset || "anime_companion"))?.systemPrompt || ""
                          }
                          onChange={(e) => onChange({ customSystemPrompt: e.target.value })}
                          rows={6}
                          placeholder="Define custom personality traits, voice nuance, emotional quirks, or domain specialization..."
                          className="w-full bg-black/90 border border-cyan-900/60 p-3.5 text-xs font-mono text-cyan-100 placeholder-cyan-800 focus:border-cyan-400 focus:outline-none resize-y leading-relaxed"
                        />
                      </div>

                      {/* Superpowers: Inner Thoughts & Proactive Interaction */}
                      <div className="space-y-4">
                        <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                          <Zap size={14} /> Interaction Superpowers
                        </label>
                        <div className="space-y-2">
                          <ToggleRow
                            label="Inner Thoughts / Mental Activity (<think> Tags)"
                            description="Visualizes AI reasoning & internal monologue in an on-screen holographic thought bubble while stripping it from spoken voice"
                            checked={settings.innerThoughtsEnabled !== false}
                            onChange={(v) => onChange({ innerThoughtsEnabled: v })}
                          />
                          <ToggleRow
                            label="Proactive Speaking (Initiative Mode)"
                            description="Allows Akari to initiate conversation, check in, or offer timely banter when you are idle without waiting for a prompt"
                            checked={settings.proactiveSpeakingEnabled !== false}
                            onChange={(v) => onChange({ proactiveSpeakingEnabled: v })}
                          />
                        </div>

                        {settings.proactiveSpeakingEnabled !== false && (
                          <div className="p-4 bg-black/40 border-l-2 border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-mono text-cyan-200 uppercase tracking-wider">
                                Proactive Banter Cadence
                              </div>
                              <div className="text-[10px] font-mono text-cyan-600 uppercase tracking-widest mt-0.5">
                                Idle silence before Akari takes initiative
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {[2, 5, 10, 15].map((mins) => {
                                const isCurrent = (settings.proactiveIntervalMinutes || 5) === mins;
                                return (
                                  <button
                                    key={mins}
                                    onClick={() => onChange({ proactiveIntervalMinutes: mins })}
                                    className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border cursor-pointer transition-all ${
                                      isCurrent
                                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                        : "bg-black/60 border-cyan-900/60 text-cyan-700 hover:text-cyan-400"
                                    }`}
                                  >
                                    {mins}m
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* VOICE & TTS TAB */}
                  {activeTab === "voice" && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      
                      {/* Speaker Voice Identification & Profile Section */}
                      <div className="space-y-4 p-5 bg-black/60 border border-cyan-500/30 rounded-none relative">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                            <Fingerprint size={15} className="text-cyan-400" />
                            Speaker Voice Identification
                          </label>
                          <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                            settings.voiceProfileEnrolled
                              ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40"
                              : "bg-amber-950/40 text-amber-400 border-amber-500/40"
                          }`}>
                            {settings.voiceProfileEnrolled ? `VOICEPRINT: ENROLLED (${settings.ownerName || "SIDDHANT"})` : "STATUS: UNCALIBRATED"}
                          </span>
                        </div>

                        <p className="text-[11px] font-mono text-cyan-600/90 leading-relaxed">
                          Akari automatically identifies your vocal signature, addresses you by name, and verifies you as the sole authorized master operator.
                        </p>

                        <div className="space-y-3 pt-1">
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest text-cyan-600 uppercase mb-1.5">
                              Authorized Master / Speaker Name
                            </label>
                            <input
                              type="text"
                              value={settings.ownerName || "Siddhant"}
                              onChange={(e) => onChange({ ownerName: e.target.value })}
                              placeholder="e.g. Siddhant"
                              className="w-full bg-black/80 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                            />
                          </div>

                          <ToggleRow
                            label="Strict Voice Recognition"
                            description={`Enforce instant personal identification for ${settings.ownerName || "Siddhant"}`}
                            checked={settings.speakerRecognitionEnabled}
                            onChange={(v) => onChange({ speakerRecognitionEnabled: v })}
                          />

                          <ToggleRow
                            label="Continuous Background Voice Training"
                            description="Calibrates & refines your voiceprint during everyday conversations."
                            checked={settings.backgroundVoiceTraining !== false}
                            onChange={(v) => {
                              onChange({ backgroundVoiceTraining: v });
                              globalVoiceBiometrics.setBackgroundLearning(v);
                            }}
                          />

                          <ToggleRow
                            label="Strict Speaker Guard"
                            description="Detect and restrict guest speakers speaking on your behalf"
                            checked={settings.strictSpeakerLock}
                            onChange={(v) => onChange({ strictSpeakerLock: v })}
                          />
                        </div>
                      </div>

                      {/* Strictly Isolated Neural Voice Suites */}
                      <div className="space-y-6">
                        {/* Akari's Dedicated Voice Palette */}
                        <div className="p-4 bg-black/60 border border-pink-500/30 rounded-none space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-mono tracking-widest text-pink-400 uppercase flex items-center gap-2 font-bold">
                              <span>🌸</span> Akari Dedicated Neural Voice (Female Only)
                            </label>
                            <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                              settings.avatarStyle !== "jrsidd"
                                ? "bg-pink-500/20 text-pink-300 border-pink-400/50"
                                : "bg-black/40 text-slate-500 border-slate-700"
                            }`}>
                              {settings.avatarStyle !== "jrsidd" ? `ACTIVE ON STAGE: ${settings.akariVoice || "Kore"}` : `STANDBY: ${settings.akariVoice || "Kore"}`}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-pink-300/70">
                            Strictly assigned to Akari. Modifying this will NEVER alter or mix with Jr. Sidd's male voice.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {AKARI_VOICES.map((v) => {
                              const isSelected = (settings.akariVoice || "Kore") === v.id;
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => {
                                    onChange({ akariVoice: v.id });
                                    if (settings.avatarStyle !== "jrsidd") {
                                      onChange({ voice: v.id });
                                      onVoiceChange?.(v.id);
                                    }
                                  }}
                                  className={`p-3 text-left border transition-all duration-300 cursor-pointer ${
                                    isSelected
                                      ? "border-pink-400 bg-pink-950/40 text-pink-200 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                                      : "border-pink-950/50 bg-black/40 text-slate-400 hover:border-pink-500/40 hover:text-pink-300"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-mono font-bold uppercase tracking-wider">{v.label}</div>
                                    {isSelected && (
                                      <span className="text-[8px] font-mono bg-pink-500/30 text-pink-200 px-1.5 py-0.5 border border-pink-400/50 uppercase">
                                        ASSIGNED
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[9px] font-mono text-pink-300/60 mt-1 uppercase leading-snug">{v.desc}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Jr. Sidd's Dedicated Voice Palette */}
                        <div className="p-4 bg-black/60 border border-cyan-500/30 rounded-none space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2 font-bold">
                              <span>⚡</span> Jr. Sidd Dedicated Neural Voice (Male Only)
                            </label>
                            <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                              settings.avatarStyle === "jrsidd"
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50"
                                : "bg-black/40 text-slate-500 border-slate-700"
                            }`}>
                              {settings.avatarStyle === "jrsidd" ? `ACTIVE ON STAGE: ${settings.jrSiddVoice || "Fenrir"}` : `STANDBY: ${settings.jrSiddVoice || "Fenrir"}`}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-cyan-400/70">
                            Strictly assigned to Jr. Sidd. Modifying this will NEVER alter or mix with Akari's female voice.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                            {JR_SIDD_VOICES.map((v) => {
                              const isSelected = (settings.jrSiddVoice || "Fenrir") === v.id;
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => {
                                    onChange({ jrSiddVoice: v.id });
                                    if (settings.avatarStyle === "jrsidd") {
                                      onChange({ voice: v.id });
                                      onVoiceChange?.(v.id);
                                    }
                                  }}
                                  className={`p-3 text-left border transition-all duration-300 cursor-pointer ${
                                    isSelected
                                      ? "border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                                      : "border-cyan-950/50 bg-black/40 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-mono font-bold uppercase tracking-wider">{v.label}</div>
                                    {isSelected && (
                                      <span className="text-[8px] font-mono bg-cyan-500/30 text-cyan-200 px-1.5 py-0.5 border border-cyan-400/50 uppercase">
                                        ASSIGNED
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[9px] font-mono text-cyan-300/60 mt-1 uppercase leading-snug">{v.desc}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Wake Word Telemetry */}
                      <div className="space-y-3 border-t border-cyan-900/30 pt-6">
                        <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase">Audio Telemetry</label>
                        <ToggleRow
                          label="Wake Word Listener"
                          description="Active environmental audio scanning"
                          checked={settings.wakeWordEnabled}
                          onChange={(v) => onChange({ wakeWordEnabled: v })}
                        />
                        {settings.wakeWordEnabled && (
                          <div className="pl-4 border-l border-cyan-900 mt-2 space-y-4">
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest text-cyan-600 uppercase mb-2">Activation Phrase</label>
                              <input
                                type="text"
                                value={settings.wakePhrase}
                                onChange={(e) => onChange({ wakePhrase: e.target.value })}
                                className="w-full bg-black/60 border-b border-cyan-500/30 text-cyan-300 font-mono text-sm py-2 px-3 focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest text-cyan-600 uppercase mb-2">Input Hardware</label>
                              <select
                                value={settings.micDeviceId}
                                onChange={(e) => onChange({ micDeviceId: e.target.value })}
                                className="w-full bg-black/60 border-b border-cyan-500/30 text-cyan-300 font-mono text-sm py-2 px-3 focus:outline-none focus:border-cyan-400 appearance-none"
                              >
                                <option value="">System Default Audio Stream</option>
                                {mics.map((m, i) => (
                                  <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Sensor ${i + 1}`}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* OFFLINE BRAIN (OLLAMA) TAB */}
                  {activeTab === "offline" && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                      
                      {/* Status Banner */}
                      <div className={`p-5 border relative overflow-hidden ${
                        ollamaStatus.online 
                          ? "border-emerald-500/40 bg-emerald-950/20" 
                          : "border-amber-500/40 bg-amber-950/20"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className={`w-3.5 h-3.5 rounded-full ${ollamaStatus.online ? "bg-emerald-400" : "bg-amber-400"}`} />
                              {ollamaStatus.online && <div className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping" />}
                            </div>
                            <div>
                              <div className={`text-sm font-mono uppercase tracking-widest font-bold ${
                                ollamaStatus.online ? "text-emerald-400" : "text-amber-400"
                              }`}>
                                {ollamaStatus.online ? "OLLAMA ENGINE :: CONNECTED & READY" : "OLLAMA ENGINE :: OFFLINE OR UNREACHABLE"}
                              </div>
                              <div className="text-[10px] font-mono text-cyan-600 mt-0.5">
                                {ollamaStatus.online 
                                  ? `${ollamaStatus.models.length} MODEL(S) INSTALLED LOCALLY` 
                                  : (ollamaStatus.error || "Ensure Ollama is running on your machine.")}
                              </div>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={checkOllama}
                            disabled={ollamaStatus.checking}
                            className="px-3 py-1.5 bg-black/60 hover:bg-black/90 border border-cyan-500/40 text-cyan-300 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw size={12} className={ollamaStatus.checking ? "animate-spin" : ""} />
                            {ollamaStatus.checking ? "Scanning..." : "Check Status"}
                          </button>
                        </div>
                      </div>

                      {/* Master Toggle */}
                      <div className="space-y-2">
                        <ToggleRow
                          label="Enable 100% Offline AI Brain"
                          description="Routes all companion responses through your local Ollama instance with zero internet required."
                          checked={settings.offlineBrainEnabled || false}
                          onChange={(v) => onChange({ offlineBrainEnabled: v })}
                        />
                      </div>

                      {/* Endpoint & Model Config */}
                      <div className="p-5 bg-black/60 border border-cyan-500/30 space-y-4">
                        <div>
                          <label className="block text-[10px] font-mono tracking-widest text-cyan-400 uppercase mb-1.5 flex items-center justify-between">
                            <span>Ollama Server Endpoint URL</span>
                            <span className="text-cyan-700">DEFAULT: http://localhost:11434</span>
                          </label>
                          <input
                            type="text"
                            value={settings.ollamaEndpoint || "http://localhost:11434"}
                            onChange={(e) => onChange({ ollamaEndpoint: e.target.value.trim() })}
                            placeholder="http://localhost:11434"
                            className="w-full bg-black/80 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono tracking-widest text-cyan-400 uppercase mb-1.5 flex items-center justify-between">
                            <span>Local Model Name</span>
                            <span className="text-cyan-600 font-bold">{settings.ollamaModel || "llama3.2"}</span>
                          </label>
                          <input
                            type="text"
                            value={settings.ollamaModel || "llama3.2"}
                            onChange={(e) => onChange({ ollamaModel: e.target.value.trim() })}
                            placeholder="e.g. llama3.2, deepseek-r1:8b, qwen2.5:7b"
                            className="w-full bg-black/80 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                          />
                        </div>

                        {/* Quick Model Selector Pills */}
                        {ollamaStatus.models.length > 0 && (
                          <div>
                            <label className="block text-[9px] font-mono text-cyan-600 uppercase mb-1.5">
                              Installed Models on Your Machine (Click to select):
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {ollamaStatus.models.map((m) => (
                                <button
                                  key={m.name}
                                  type="button"
                                  onClick={() => onChange({ ollamaModel: m.name })}
                                  className={`text-[10px] font-mono px-2.5 py-1 border transition cursor-pointer ${
                                    settings.ollamaModel === m.name
                                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                      : "bg-black/60 text-cyan-700 border-cyan-900/50 hover:text-cyan-400 hover:border-cyan-600"
                                  }`}
                                >
                                  {m.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Interactive Test Inference Benchmark */}
                      <div className="p-5 bg-black/80 border border-cyan-500/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                            <Zap size={14} className="text-cyan-400" />
                            Live Inference Benchmark
                          </label>
                          {testLatency !== null && (
                            <span className="text-[10px] font-mono text-emerald-400">
                              LATENCY: {testLatency}ms
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={testPrompt}
                            onChange={(e) => setTestPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleTestOllamaInference()}
                            placeholder="Send a test message to Ollama..."
                            className="flex-1 bg-black/90 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={handleTestOllamaInference}
                            disabled={isTestingOllama || !testPrompt.trim()}
                            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-300 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                          >
                            <Send size={12} />
                            {isTestingOllama ? "Thinking..." : "Test Prompt"}
                          </button>
                        </div>

                        {testOutput && (
                          <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 text-cyan-300 font-mono text-xs leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                            <div className="text-[9px] text-cyan-600 uppercase mb-1">
                              Response from {settings.ollamaModel || "llama3.2"}:
                            </div>
                            {testOutput}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* LIVE STREAM CO-HOST TAB */}
                  {activeTab === "livestream" && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                      <div className="p-5 bg-black/60 border border-cyan-500/30 space-y-4">
                        <label className="text-xs font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-2">
                          <Radio size={14} className="text-cyan-400" />
                          Twitch & YouTube Live Stream Co-Host
                        </label>
                        <p className="text-[11px] font-mono text-cyan-600/90 leading-relaxed">
                          Connect Akari to your live stream chat to interact with your viewers, answer audience questions, and react live with Live2D emotions.
                        </p>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest text-cyan-400 uppercase mb-1">
                              Twitch Channel Username
                            </label>
                            <input
                              type="text"
                              value={settings.twitchChannel || ""}
                              onChange={(e) => onChange({ twitchChannel: e.target.value.trim() })}
                              placeholder="e.g. shroud, your_channel"
                              className="w-full bg-black/80 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono tracking-widest text-cyan-400 uppercase mb-1">
                              YouTube Live Stream Video ID or URL
                            </label>
                            <input
                              type="text"
                              value={settings.youtubeVideoId || ""}
                              onChange={(e) => onChange({ youtubeVideoId: e.target.value.trim() })}
                              placeholder="e.g. jfKfPfyJRdk"
                              className="w-full bg-black/80 border border-cyan-500/30 text-cyan-200 font-mono text-xs py-2 px-3 focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DAEMON LINK TAB */}
                  {activeTab === "system" && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      
                      <div className="space-y-3">
                        <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase">Daemon Status</label>
                        <div
                          className={`p-6 border relative overflow-hidden ${
                            agentHealth.online ? "border-emerald-500/30 bg-emerald-950/20" : "border-rose-500/30 bg-rose-950/20"
                          }`}
                          style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)" }}
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-20">
                            <Cpu size={100} />
                          </div>
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="relative">
                                <div className={`w-3 h-3 rounded-full ${agentHealth.online ? "bg-emerald-400" : "bg-rose-400"}`} />
                                {agentHealth.online && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />}
                              </div>
                              <div className={`text-lg font-mono uppercase tracking-widest ${agentHealth.online ? "text-emerald-400" : "text-rose-400"}`}>
                                {agentHealth.online ? "LINK ESTABLISHED" : "LINK SEVERED"}
                              </div>
                            </div>
                            <div className="text-sm font-mono text-cyan-600/80 uppercase">
                              {agentHealth.online
                                ? `PORT: 8765 | MODULES: ${agentHealth.toolCount ?? 0} ACTIVE`
                                : "INITIATE PYTHON DAEMON ON PORT 8765"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-mono tracking-widest text-cyan-500 uppercase">VTube Studio Bridge</label>
                        <div className="p-4 bg-black/40 border border-cyan-500/20 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-cyan-300 uppercase">WebSocket ws://127.0.0.1:8001</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                              vtsStatus.connected
                                ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40"
                                : "bg-slate-900/60 text-slate-500 border-slate-700"
                            }`}>
                              {vtsStatus.connected ? "VTS: ONLINE" : "VTS: STANDBY"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ABOUT TAB */}
                  {activeTab === "about" && (
                    <div className="space-y-8 animate-in fade-in duration-500 font-mono">
                      <div className="p-6 bg-cyan-950/10 border border-cyan-500/20 space-y-4">
                        <div className="text-lg font-display text-white tracking-widest uppercase">AKARI AI SYSTEM V2.5</div>
                        <p className="text-xs text-cyan-500/80 leading-relaxed uppercase">
                          Akari AI is an advanced multimodal VTuber companion, voice assistant, and desktop agent engineered for deep context understanding, emotive Live2D embodiment, and full local AI autonomy.
                        </p>
                        <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-cyan-500/20">
                          <div>
                            <span className="text-cyan-700 block">FRONTEND ENGINE</span>
                            <span className="text-cyan-300 font-bold">REACT + VITE + LIVE2D CUBISM 4</span>
                          </div>
                          <div>
                            <span className="text-cyan-700 block">DESKTOP AGENT</span>
                            <span className="text-cyan-300 font-bold">PYTHON CORE + FASTAPI DAEMON</span>
                          </div>
                          <div>
                            <span className="text-cyan-700 block">LOCAL AI</span>
                            <span className="text-cyan-300 font-bold">OLLAMA (LLAMA-3.2, DEEPSEEK-R1)</span>
                          </div>
                          <div>
                            <span className="text-cyan-700 block">CLOUD INTELLIGENCE</span>
                            <span className="text-cyan-300 font-bold">GEMINI 2.0 MULTIMODAL LIVE</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-cyan-500/20">
                          <div>
                            <span className="text-cyan-700 block">CREATOR & ARCHITECT</span>
                            <span className="text-cyan-300 font-bold">SIDDHANT RAMTEKE</span>
                          </div>
                          <div>
                            <span className="text-cyan-700 block">SOFTWARE</span>
                            <span className="text-cyan-300 font-bold">AKARI AI</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
