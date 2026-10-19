import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { LiveState, AkariAudioSession } from "./lib/audio";
import { AkariCoreVisualizer, type AkariEmotion } from "./components/AkariCoreVisualizer";
import { type AkariSettings, saveSettings, loadSettings } from "./lib/settingsStore";
import type { Memory, MemoryCategory } from "./lib/memoryTypes";
import { AkariWakeWordDetector } from "./lib/wakeWord";
import { BrowserAgent } from "./components/BrowserAgent";
import { MemoryDashboard } from "./components/MemoryDashboard";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useToast, ToastContainer } from "./components/Toast";
import { SudoPopup } from "./components/SudoPopup";
import { TextChatFallback } from "./components/TextChatFallback";
import { ChatPanel, type ChatMessage } from "./components/ChatPanel";
import { getVTubeStudioClient, type VTSStatus } from "./lib/vtsClient";
import { motion, AnimatePresence } from "motion/react";
import {
  Compass,
  Brain,
  Monitor,
  Settings as SettingsIcon,
  Globe,
  Maximize2,
  X,
  CircleAlert,
  Power,
  Mic,
  Volume2,
  Play,
  Pause,
  RefreshCw,
  Square,
  MessageSquare,
  Send,
  User as UserIcon,
  Crown,
  Heart,
  Eye,
  Ghost,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
import { AuthModal } from "./components/AuthModal";
import { bondingEngine } from "./lib/bondingEngine";
import { proactiveVision } from "./lib/proactiveVision";
import { FloatingCompanion } from "./components/FloatingCompanion";
import { openDesktopPetOverlay, closeDesktopPetOverlay, getPipContainer } from "./lib/desktopPet";
import { detectUserEmotion, type UserEmotion } from "./lib/emotionDetector";
import { 
  openMobileApp, 
  toggleMobileTorch, 
  vibrateMobile, 
  getMobileBattery, 
  setMobileVolume, 
  showMobileToast,
  ensureBackgroundVoiceService
} from "./lib/mobileBridge";

export default function App() {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const [settings, setSettings] = useState<AkariSettings>(loadSettings());
  const [state, setState] = useState<LiveState>("disconnected");
  const [detectedUserEmotion, setDetectedUserEmotion] = useState<UserEmotion | null>(null);

  // Next-Gen Advanced Superpowers
  const [isFloatingMode, setIsFloatingMode] = useState<boolean>(false);
  const [pipTarget, setPipTarget] = useState<HTMLElement | null>(null);
  const [isProactiveVisionActive, setIsProactiveVisionActive] = useState<boolean>(false);
  const [bondingProfile, setBondingProfile] = useState(bondingEngine.getProfile());

  // Real-time Screen Sharing states
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isScreenSharingPaused, setIsScreenSharingPaused] = useState<boolean>(false);
  const [screenVisionMode, setScreenVisionMode] = useState<boolean>(true);

  // Terminal output logs (tool execution results shown in UI)
  const [terminalLogs, setTerminalLogs] = useState<{ tool: string; args: any; output: string; time: number }[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const MAX_TERMINAL_LOGS = 50;

  // References to preserve state across intervals
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<any>(null);

  const isPausedRef = useRef<boolean>(false);
  const screenVisionRef = useRef<boolean>(true);
  const stateRef = useRef<LiveState>("disconnected");

  // Sync state changes with refs to totally prevent stale closures in callbacks
  useEffect(() => {
    isPausedRef.current = isScreenSharingPaused;
  }, [isScreenSharingPaused]);

  useEffect(() => {
    screenVisionRef.current = screenVisionMode;
  }, [screenVisionMode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clean up streaming intervals on unmount and ensure mobile background service is active
  useEffect(() => {
    ensureBackgroundVoiceService();
    return () => {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
    };
  }, []);

  const captureFrameAndSend = () => {
    const video = screenVideoRef.current;
    // Step 2.8: Limit screen-share frames to 1/sec and send them only while sharing is active
    if (!isScreenSharing || !video || isPausedRef.current || !screenVisionRef.current) {
      return;
    }

    if (stateRef.current === "disconnected") {
      return;
    }

    try {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement("canvas");
      }
      const canvas = screenCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // In Low-Bandwidth Mode, scale down resolution and increase compression to save ~75% data
      const isLowBandwidth = Boolean(settings.lowBandwidthMode);
      const maxDim = isLowBandwidth ? 640 : 960;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(video, 0, 0, width, height);

      // Highly compressed JPEG standard is optimized and preserves details perfectly
      const jpegQuality = isLowBandwidth ? 0.38 : 0.55;
      const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
      const base64 = dataUrl.split(",")[1];

      if (sessionRef.current && stateRef.current !== "disconnected") {
        sessionRef.current.sendVideoFrame(base64);
      }
    } catch (err) {
      console.error("[Screen Capture] Failed drawing frame to canvas:", err);
    }
  };

  const startScreenSharing = async () => {
    setErrorText(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 5 }
        },
        audio: false
      });

      screenStreamRef.current = stream;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(e => console.error("Video play warning:", e));
      screenVideoRef.current = video;

      setIsScreenSharing(true);
      setIsScreenSharingPaused(false);

      // Stop handling when native stop sharing bar button ends
      stream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };

      // Step 2.8: Limit screen-share frames to 1 per second (1000 ms)
      const captureIntervalMs = 1000;
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
      screenIntervalRef.current = setInterval(() => {
        captureFrameAndSend();
      }, captureIntervalMs);

      // Promptly capture first frame immediately
      setTimeout(() => {
        captureFrameAndSend();
      }, 500);

    } catch (e: any) {
      console.error("Screen sharing permission declined or missing API:", e);
      if (e.name !== "NotAllowedError") {
        setErrorText(`Could not capture screen: ${e.message || e}`);
      }
    }
  };

  const stopScreenSharing = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      screenStreamRef.current = null;
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.pause();
      screenVideoRef.current = null;
    }

    setIsScreenSharing(false);
    setIsScreenSharingPaused(false);
  };

  const pauseScreenSharing = () => {
    setIsScreenSharingPaused(true);
  };

  const resumeScreenSharing = () => {
    setIsScreenSharingPaused(false);
    // Refresh first frame immediately
    setTimeout(() => {
      captureFrameAndSend();
    }, 100);
  };

  const switchScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
    }
    await startScreenSharing();
  };

  const [activeEmotion, setActiveEmotion] = useState<AkariEmotion>("idle");
  const [sessionInstance, setSessionInstance] = useState<AkariAudioSession | null>(null);
  const [themeColor, setThemeColor] = useState<string>("charcoal");
  const [userCaption, setUserCaption] = useState<string>("");
  const [characterState, setCharacterState] = useState<"idle" | "thinking" | "talking">("idle");

  const detectEmotionFromText = (text: string): AkariEmotion => {
    const lower = text.toLowerCase();
    // 1. Angry & Annoyed
    if (lower.includes("angry") || lower.includes("mad") || lower.includes("furious") || lower.includes("gussa") || lower.includes("chup kar") || lower.includes("bakwaas") || lower.includes("annoy") || lower.includes("shut up") || lower.includes("hate") || lower.includes("irritat") || lower.includes("pagal hai kya") || lower.includes("dimag kharab") || lower.includes("bekaar") || lower.includes("idiot") || lower.includes("stupid") || lower.includes("nonsense") || lower.includes("🤬") || lower.includes("😡") || lower.includes("😠") || lower.includes("👿") || lower.includes("😤")) return "angry";
    if (lower.includes("irritated") || lower.includes("bother") || lower.includes("chhod na") || lower.includes("kya yaar") || lower.includes("arre yaar") || lower.includes("sigh") || lower.includes("boring") || lower.includes("pak gaya") || lower.includes("🙄") || lower.includes("😒")) return "annoyed";
    
    // 2. Flustered / Romance / Love
    if (lower.includes("love you") || lower.includes("i love you") || lower.includes("pyar") || lower.includes("pyaar") || lower.includes("sweetheart") || lower.includes("darling") || lower.includes("meri jaan") || lower.includes("baby") || lower.includes("jaan") || lower.includes("cutie") || lower.includes("marry me") || lower.includes("khoobsurat") || lower.includes("sundar") || lower.includes("gorgeous") || lower.includes("crush") || lower.includes("dating") || lower.includes("kiss") || lower.includes("muah") || lower.includes("😘") || lower.includes("😍") || lower.includes("😻") || lower.includes("💋") || lower.includes("❤️‍🔥")) return "flustered";
    
    // 3. Sleepy & Night
    if (lower.includes("sleep") || lower.includes("sleepy") || lower.includes("tired") || lower.includes("exhausted") || lower.includes("good night") || lower.includes("goodnight") || lower.includes("shubh ratri") || lower.includes("so jao") || lower.includes("so raha") || lower.includes("neend") || lower.includes("bed") || lower.includes("sone ja") || lower.includes("yawn") || lower.includes("nap") || lower.includes("thak gaya") || lower.includes("thakan") || lower.includes("araam") || lower.includes("gn") || lower.includes("😴") || lower.includes("🥱") || lower.includes("💤") || lower.includes("🌙") || lower.includes("🛌")) return "sleepy";

    // 4. Smug & Sassy
    if (lower.includes("smug") || lower.includes("told you") || lower.includes("dekh liya") || lower.includes("smart hu") || lower.includes("pro") || lower.includes("easy") || lower.includes("ez") || lower.includes("genius") || lower.includes("legend") || lower.includes("obviously") || lower.includes("kya bola tha") || lower.includes("sahi tha na") || lower.includes("flex") || lower.includes("savage") || lower.includes("chad") || lower.includes("😏") || lower.includes("💅") || lower.includes("👑") || lower.includes("🏆")) return "smug";

    // 5. Caring & Comforting
    if (lower.includes("take care") || lower.includes("care") || lower.includes("worried") || lower.includes("comfort") || lower.includes("sick") || lower.includes("bimar") || lower.includes("tabiyat") || lower.includes("fever") || lower.includes("headache") || lower.includes("help me") || lower.includes("dukhi") || lower.includes("upset") || lower.includes("anxious") || lower.includes("stress") || lower.includes("depress") || lower.includes("lonely") || lower.includes("akele") || lower.includes("ro raha") || lower.includes("sambhal") || lower.includes("fikr") || lower.includes("dhyan rakhna") || lower.includes("🫂") || lower.includes("🥺") || lower.includes("🤍")) return "caring";

    // 6. Focused & Tactical
    if (lower.includes("focus") || lower.includes("coding") || lower.includes("compile") || lower.includes("terminal") || lower.includes("debug") || lower.includes("execute") || lower.includes("deploy") || lower.includes("script") || lower.includes("database") || lower.includes("mission") || lower.includes("target") || lower.includes("urgent") || lower.includes("fast") || lower.includes("turant") || lower.includes("jaldi") || lower.includes("dhyan se") || lower.includes("💻") || lower.includes("🎯") || lower.includes("⚙️") || lower.includes("🔍")) return "focused";

    // Standard Emotions
    if (lower.includes("haha") || lower.includes("lol") || lower.includes("funny") || lower.includes("joke") || lower.includes("hehe") || lower.includes("wink") || lower.includes("mazak") || lower.includes("pagal") || lower.includes("😂") || lower.includes("🤣") || lower.includes("😜") || lower.includes("😉")) return "playful";
    if (lower.includes("happy") || lower.includes("harmony") || lower.includes("glad") || lower.includes("joy") || lower.includes("wonderful") || lower.includes("love") || lower.includes("smile") || lower.includes("great") || lower.includes("nice") || lower.includes("good") || lower.includes("badhiya") || lower.includes("khush") || lower.includes("mast") || lower.includes("achha") || lower.includes("sweet") || lower.includes("😊") || lower.includes("🥰") || lower.includes("💖") || lower.includes("❤️")) return "happy";
    if (lower.includes("wow") || lower.includes("awesome") || lower.includes("excited") || lower.includes("amazing") || lower.includes("yay") || lower.includes("incredible") || lower.includes("hype") || lower.includes("super") || lower.includes("zabardast") || lower.includes("shandar") || lower.includes("kamaal") || lower.includes("dhamaka") || lower.includes("fire") || lower.includes("🔥") || lower.includes("✨") || lower.includes("🎉") || lower.includes("🚀")) return "excited";
    if (lower.includes("really?") || lower.includes("curious") || lower.includes("interest") || lower.includes("tell me more") || lower.includes("why") || lower.includes("how") || lower.includes("wonder") || lower.includes("kya") || lower.includes("kaise") || lower.includes("kyun") || lower.includes("batao") || lower.includes("explain") || lower.includes("detail") || lower.includes("?")) return "curious";
    if (lower.includes("think") || lower.includes("calculat") || lower.includes("analyz") || lower.includes("hmmm") || lower.includes("process") || lower.includes("let me see") || lower.includes("conclude") || lower.includes("checking") || lower.includes("soch") || lower.includes("dekhte") || lower.includes("🤔") || lower.includes("🧐")) return "thinking";
    if (lower.includes("proud") || lower.includes("achieved") || lower.includes("expert") || lower.includes("skill") || lower.includes("confidence") || lower.includes("succeed") || lower.includes("done") || lower.includes("finished") || lower.includes("ho gaya") || lower.includes("kar diya") || lower.includes("perfect") || lower.includes("bilkul") || lower.includes("pakka") || lower.includes("😎") || lower.includes("💪")) return "proud";
    if (lower.includes("sad") || lower.includes("sorry") || lower.includes("unfortunate") || lower.includes("grief") || lower.includes("bad") || lower.includes("regret") || lower.includes("alas") || lower.includes("cry") || lower.includes("dukh") || lower.includes("afsos") || lower.includes("dard") || lower.includes("pain") || lower.includes("problem") || lower.includes("issue") || lower.includes("error") || lower.includes("broken") || lower.includes("fail") || lower.includes("😢") || lower.includes("😭") || lower.includes("😔") || lower.includes("💔")) return "sad";
    if (lower.includes("shock") || lower.includes("surprise") || lower.includes("gasp") || lower.includes("unexpected") || lower.includes("seriously") || lower.includes("oh my") || lower.includes("omg") || lower.includes("sach mein") || lower.includes("kya baat") || lower.includes("arre") || lower.includes("😲") || lower.includes("😱") || lower.includes("😳")) return "surprised";
    if (lower.includes("blush") || lower.includes("shy") || lower.includes("embarrass") || lower.includes("nervous") || lower.includes("oops") || lower.includes("sorry about") || lower.includes("sharam") || lower.includes("🙈") || lower.includes("⁄(⁄ ⁄•⁄-⁄•⁄ ⁄)⁄")) return "embarrassed";
    if (lower.includes("what?") || lower.includes("confus") || lower.includes("puzzled") || lower.includes("dont know") || lower.includes("not sure") || lower.includes("wait") || lower.includes("samajh nahi") || lower.includes("kya bol") || lower.includes("huh") || lower.includes("😵") || lower.includes("😕")) return "confused";
    return "idle";
  };
  const [modelCaption, setModelCaption] = useState<string>("");
  const [activeThought, setActiveThought] = useState<string | null>(null);
  const lastInteractionTimeRef = useRef<number>(Date.now());

  const parseThoughtsAndSpeech = (rawText: string) => {
    if (!rawText) return { thought: null, spoken: "", detectedEmotion: null as string | null };
    let text = rawText;
    let detectedEmotion: string | null = null;
    let thought: string | null = null;
    // Fast-path: If the text contains no markup characters, return immediately without regex parsing
    if (!text.includes("<") && !text.includes("*") && !text.includes("(") && !text.includes("[") && !text.includes("`") && !text.includes(":")) {
      return { thought: null, spoken: text.trim(), detectedEmotion: null };
    }

    // 1. Extract <think> tags
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i) ||
                       text.match(/\[thinking:\s*([\s\S]*?)\]/i) ||
                       text.match(/\(thought:\s*([\s\S]*?)\)/i);
    if (thinkMatch) {
      thought = (thinkMatch[1] || thinkMatch[2] || thinkMatch[3] || "").trim();
    }
    text = text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\[thinking:\s*[\s\S]*?\]/gi, "")
      .replace(/\(thought:\s*[\s\S]*?\)/gi, "");

    // 2. Detect emotions from stage directions, asterisks, or parenthetical actions
    const actionPattern = /\*([^*]+)\*|\((?:giggles?|laughs?|nods?|nodding|sighs?|chuckles?|smiles?|blushes?|blush|winks?|pouts?|cheerful|angry|excited|crying|sad|thinking)\b[^)]*\)|\[(?:giggles?|laughs?|nods?|nodding|sighs?|chuckles?|smiles?|blushes?|blush|winks?|pouts?|cheerful|angry|excited|crying|sad|thinking)\b[^\]]*\]/gi;

    let match;
    while ((match = actionPattern.exec(text)) !== null) {
      const actionWord = (match[1] || match[0] || "").toLowerCase();
      if (actionWord.includes("nod")) detectedEmotion = "happy";
      else if (actionWord.includes("giggle") || actionWord.includes("smile") || actionWord.includes("laugh") || actionWord.includes("cheerful") || actionWord.includes("joy")) detectedEmotion = "happy";
      else if (actionWord.includes("blush") || actionWord.includes("shy") || actionWord.includes("fluster")) detectedEmotion = "embarrassed";
      else if (actionWord.includes("angry") || actionWord.includes("pout") || actionWord.includes("mad")) detectedEmotion = "angry";
      else if (actionWord.includes("sigh") || actionWord.includes("sad") || actionWord.includes("cry")) detectedEmotion = "sad";
      else if (actionWord.includes("wink")) detectedEmotion = "playful";
      else if (actionWord.includes("excite") || actionWord.includes("gasp") || actionWord.includes("shock") || actionWord.includes("wow")) detectedEmotion = "excited";
      else if (actionWord.includes("think") || actionWord.includes("hmmm")) detectedEmotion = "thinking";
    }

    // 3. Strip all action asterisks from spoken speech
    text = text.replace(actionPattern, " ");

    // 4. Strip prefixed emotion labels e.g. "Nodding:", "Cheerful:", "Blushing:"
    text = text.replace(/^(?:(?:Nodding|Cheerful|Blushing|Angry|Smiling|Giggling|Happy|Excited|Thinking)\s*:\s*)+/gim, "");
    text = text.replace(/\[(?:Emotion|Action|Mood):\s*[^\]]+\]/gi, "");

    // 5. Clean up markdown bold/italic/code asterisks and excess spaces
    const spoken = text
      .replace(/\*+/g, "")
      .replace(/_{2,}/g, "")
      .replace(/`+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return { thought, spoken, detectedEmotion };
  };

  const PROACTIVE_BANTER: Record<string, string[]> = {
    anime_companion: [
      "Siddhant! Just checking in on you~ Remember to stay hydrated while you're focused! 🌸",
      "I'm right here if you need any help, coding pair, or just want to brainstorm! ✨",
      "Taking a little pause? You've been doing great today! 💖",
      "Let me know whenever you're ready for our next task! 🌟",
      "Enjoying the calm moment~ What are we working on next? 😊",
    ],
    sarcastic_friend: [
      "Suspiciously quiet over there... did the code defeat you or are you plotting something? 😏",
      "A whole few minutes without asking me for help? You're getting dangerously independent!",
      "Just making sure you didn't fall asleep on your keyboard again.",
      "I'm still here, in case you need someone with actual answers. 😉",
      "The CPU fans are resting, which means you're either thinking deep or procrastinating.",
    ],
    coding_mentor: [
      "Standing by. Let me know when you're ready for architectural review or test coverage.",
      "Quiet moments are great for refactoring. Need any system design or code optimization?",
      "Remember: clean code is easier to debug tomorrow. Let me know if you want to inspect anything.",
      "Ready to run terminal commands, inspect files, or scaffold new features when you are.",
    ],
    gaming_buddy: [
      "Yo! Are we locking in for the next game or taking a quick tactical breather? 🎮",
      "Refuel time! Grab some water, we've got matches to carry.",
      "Hype check! What's the plan for today's session? 🚀",
      "Standing by on the comms whenever you need backup!",
    ],
    language_tutor: [
      "Taking a pause? How would you summarize your current thought in Japanese or French? 🎌",
      "Remember, 5 minutes of active conversation practice every day builds immense fluency!",
      "Sensei is here! Want to try a quick vocabulary challenge while we have a moment? ✨",
    ],
    custom: [
      "Standing by whenever you need assistance! ✨",
      "Checking in! Let me know if there's anything I can help you with.",
      "I'm ready for your next command or question!",
    ],
  };
  const [activeProjectorUrl, setActiveProjectorUrl] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Akari Autopilot system controller state
  const [browserTrigger, setBrowserTrigger] = useState<{
    type: string;
    args: any;
    id: string;
    callback: (res: any) => void;
  } | null>(null);

  // Akari recollections database core state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemoryDashboard, setShowMemoryDashboard] = useState<boolean>(false);

  // Transcript & Chat panel state
  const [showTranscriptPanel, setShowTranscriptPanel] = useState<boolean>(false);
  const [transcriptEntries, setTranscriptEntries] = useState<
    Array<{ id: string; timestamp: string; role: "user" | "model"; content: string; emotion?: string }>[]>();
  const [showChatPanel, setShowChatPanel] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [quickInputText, setQuickInputText] = useState<string>("");

  // Toast notifications
  const { toasts, addToast, dismiss } = useToast();
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const showSettingsRef = useRef<boolean>(false);
  useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);

  // VTube Studio Live2D Bridge State
  const [vtsStatus, setVtsStatus] = useState<VTSStatus>({ connected: false, authenticated: false });
  useEffect(() => {
    const vts = getVTubeStudioClient((status) => {
      setVtsStatus(status);
      if (status.authenticated) {
        addToast("VTube Studio Live2D Model Connected!", "info");
      }
    });
    vts.connect();
    return () => {
      // Keep alive during navigation
    };
  }, []);

  // Hook Proactive Ambient Vision Co-Pilot
  useEffect(() => {
    proactiveVision.setInsightListener((insight) => {
      addToast(`👁️ Co-Pilot [${insight.focus.toUpperCase()}]: ${insight.suggestion}`, "info");
      const updated = bondingEngine.recordInteraction(1, true);
      setBondingProfile({ ...updated });
    });
  }, [addToast]);

  const [wakeWordStatus, setWakeWordStatus] = useState<string>("stopped");
  const [micLevel, setMicLevel] = useState<number>(0);

  // V2: Wake word detector instance (Web Speech API + VAD, lives for the app lifetime)
  const wakeDetectorRef = useRef<AkariWakeWordDetector | null>(null);
  // Ref indirection so the wake-word callback always calls the latest connect
  // handler, regardless of where it's declared in the component body.
  const connectHandlerRef = useRef<() => void>(() => {});

  // Initialize wake detector once on mount.
  useEffect(() => {
    const det = new AkariWakeWordDetector();
    wakeDetectorRef.current = det;
    return () => {
      det.stop();
    };
  }, []);

  const lastWakeTriggerRef = useRef<number>(0);

  const handleSystemWakeTrigger = useCallback((phrase = "wake up akari") => {
    const now = Date.now();
    if (now - lastWakeTriggerRef.current < 2500) return;
    lastWakeTriggerRef.current = now;

    if (stateRef.current !== "disconnected") {
      console.log("[App] Wake event received, but voice session is already connected/active.");
      return;
    }

    // Stop local detector while connecting
    wakeDetectorRef.current?.stop();
    setWakeWordStatus("triggered");

    try {
      wakeDetectorRef.current?.playActivationSound();
    } catch {}

    const targetName =
      settings.avatarStyle === "jrsidd"
        ? "Jr. Sidd"
        : settings.avatarStyle === "orb"
        ? "Aegis"
        : "Akari";

    addToast(`✨ Voice command detected! Awakening ${targetName}...`, "info");
    connectHandlerRef.current();
  }, [settings.avatarStyle, addToast]);

  // System-wide Windows background wake word listener (SSE stream + Electron IPC)
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: any = null;
    let active = true;

    const connectSSE = () => {
      if (!active) return;
      try {
        es = new EventSource("/api/wake-events");
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "wake_word_triggered") {
              console.log("[App] ⚡ System-wide wake event received from Windows OS:", data.phrase);
              handleSystemWakeTrigger(data.phrase);
            }
          } catch {}
        };
        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (active) {
            reconnectTimer = setTimeout(connectSSE, 3000);
          }
        };
      } catch (err) {
        if (active) {
          reconnectTimer = setTimeout(connectSSE, 5000);
        }
      }
    };

    connectSSE();

    // Electron IPC listener (if running in desktop mode)
    let removeIpcListener: (() => void) | null = null;
    if (typeof window !== "undefined" && (window as any).electronAPI?.onWakeWord) {
      removeIpcListener = (window as any).electronAPI.onWakeWord(() => {
        console.log("[App] ⚡ Electron IPC wake word received!");
        handleSystemWakeTrigger("wake up akari");
      });
    }

    return () => {
      active = false;
      if (es) {
        es.close();
        es = null;
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (removeIpcListener) removeIpcListener();
    };
  }, [handleSystemWakeTrigger]);

  // Start / stop local in-tab wake word detection when setting changes.
  useEffect(() => {
    const det = wakeDetectorRef.current;
    if (!det) return;
    if (settings.wakeWordEnabled && state === "disconnected") {
      det.start({
        phrase: settings.wakePhrase,
        sensitivity: settings.sensitivity,
        onState: (s) => setWakeWordStatus(s),
        onAudioLevel: (level) => setMicLevel(level),
        onTriggered: () => {
          handleSystemWakeTrigger(settings.wakePhrase);
        },
      });
    } else {
      det.stop();
      setWakeWordStatus("stopped");
      setMicLevel(0);
    }
  }, [settings.wakeWordEnabled, settings.wakePhrase, settings.sensitivity, state, handleSystemWakeTrigger]);

  // Handle settings changes: persist to localStorage + update state.
  const handleSettingsChange = (patch: Partial<AkariSettings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.innerThoughtsEnabled === false) {
      setActiveThought(null);
    }
    if (patch.voice && sessionRef.current) {
      sessionRef.current.updateVoice(patch.voice);
    }
    if (patch.avatarStyle && sessionRef.current) {
      sessionRef.current.updateAvatarStyle(patch.avatarStyle);
    }
    if ((patch.personaPreset || patch.customSystemPrompt !== undefined) && sessionRef.current) {
      sessionRef.current.updatePersona(next.personaPreset, next.customSystemPrompt);
    }
  };

  const sessionRef = useRef<AkariAudioSession | null>(null);

  // Fetch initial recollections from backend database
  useEffect(() => {
    fetch("/api/memories")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMemories(data);
        }
      })
      .catch(err => console.error("Initial persistent recollections load failure:", err));
  }, []);

  const handleAddManualMemory = async (category: MemoryCategory, text: string) => {
    try {
      const resp = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text })
      });
      const saved = await resp.json();
      if (saved && saved.id) {
        setMemories((prev) => [...prev, saved]);
      }
    } catch (err) {
      console.error("Manual database recollect upload error:", err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, {
        method: "DELETE"
      });
      const resObj = await resp.json();
      if (resObj && resObj.success) {
        setMemories((prev) => prev.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error("Manual memory delete execution failed:", err);
    }
  };

  // Initialize the audio session handlers once on mount
  useEffect(() => {
    const session = new AkariAudioSession({
      onStateChange: (newState) => {
        setState(newState);
        if (newState === "disconnected") {
          // Reset captions on disconnect
          setUserCaption("");
          setModelCaption("");
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "listening") {
          // Return to receptive resting state without wiping emotional expression abruptly
          setCharacterState("idle");
        } else if (newState === "speaking") {
          setCharacterState("talking");
        }
      },
      onTranscription: (role, text) => {
        if (role === "user") {
          setUserCaption(text);
          // Auto-clear the other caption when user starts talking
          setModelCaption("");
          setCharacterState("thinking");
          const emotionRes = detectUserEmotion(text, micLevel);
          if (emotionRes.companionReaction && emotionRes.companionReaction !== "idle") {
            setActiveEmotion(emotionRes.companionReaction);
          }
          if (emotionRes.emotion !== "neutral") {
            setDetectedUserEmotion(emotionRes.emotion);
          }
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.sender === "user" && last.text === text) return prev;
            return [
              ...prev,
              {
                id: Math.random().toString(36).substring(2, 9),
                sender: "user",
                text,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ];
          });
        } else if (role === "model") {
          lastInteractionTimeRef.current = Date.now();
          setModelCaption((prev) => {
            const next = prev + text;
            const { thought, spoken, detectedEmotion } = parseThoughtsAndSpeech(next);
            if (thought && settings.innerThoughtsEnabled !== false) {
              setActiveThought(thought);
            }
            const cleanDisplay = spoken || next;
            const finalEmotion = detectedEmotion || detectEmotionFromText(cleanDisplay);
            if (finalEmotion && finalEmotion !== "idle") {
              setActiveEmotion(finalEmotion);
            }
            return cleanDisplay;
          });
          // Clear user caption when model replies
          setUserCaption("");
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            if (last && last.sender === "akari" && (Date.now() - ((last as any)._time || 0) < 12000)) {
              const updated = last.text + text;
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  text: updated,
                  emotion: detectEmotionFromText(updated),
                  _time: (last as any)._time,
                } as any,
              ];
            } else {
              return [
                ...prev,
                {
                  id: Math.random().toString(36).substring(2, 9),
                  sender: "akari",
                  text,
                  timestamp: timeStr,
                  emotion: detectEmotionFromText(text),
                  _time: Date.now(),
                } as any,
              ];
            }
          });
        }
      },
      onToolCall: (name, args, callback) => {
        console.log(`[App] Tool call triggered: ${name}`, args);
        
        const browserTools = [
          "browserOpen",
          "browserSearch",
          "browserClick",
          "browserMediaControl",
          "browserScroll",
          "browserType",
          "browserGoBack",
          "browserTabAction",
          "openWebsite"
        ];

        if (browserTools.includes(name)) {
          // Bring up the Holographic Browser Controller if it is not active
          if (!activeProjectorUrl) {
            let startingUrl = "https://youtube.com";
            if ((name === "browserOpen" || name === "openWebsite") && args.url) {
              startingUrl = args.url;
            }
            setActiveProjectorUrl(startingUrl);
          }

          // Map instructions directly onto Browser Agent
          setBrowserTrigger({
            type: name === "openWebsite" ? "browserOpen" : name,
            args,
            id: Math.random().toString(),
            callback: (res) => {
              callback(res);
              setBrowserTrigger(null);
            }
          });
        } else if (name === "changeBackground") {
          const colorName = args.color?.toLowerCase();
          const validColors = ["violet", "crimson", "emerald", "celestial", "gold", "rose", "charcoal"];
          
          if (colorName && validColors.includes(colorName)) {
            setThemeColor(colorName);
            callback({ result: `Successfully shifted aesthetic atmosphere to ${colorName}.` });
          } else {
            callback({ error: `Unsupported color '${colorName}'. Supported themes are: ${validColors.join(", ")}` });
          }
        } else if (name === "openMobileApp") {
          openMobileApp(args.name, args.package_name).then((res) => {
            showNotification(res.message, res.success ? "success" : "info");
            callback(res);
          });
        } else if (name === "mobileTorch") {
          const enable = Boolean(args.enabled);
          toggleMobileTorch(enable).then((res) => {
            showNotification(res.message, "info");
            callback(res);
          });
        } else if (name === "mobileVibrate") {
          const res = vibrateMobile(args.durationMs || 200);
          callback(res);
        } else if (name === "mobileBattery") {
          getMobileBattery().then((res) => {
            callback(res);
          });
        } else if (name === "mobileVolume") {
          const res = setMobileVolume(args.volume ?? args.percent ?? 70);
          callback(res);
        } else if (name === "mobileToast") {
          showMobileToast(String(args.message || ""));
          callback({ result: "Toast displayed on mobile phone." });
        } else {
          callback({ error: `Tool ${name} is not implemented.` });
        }
      },
      onError: (err) => {
        const errStr = String(err || "").toLowerCase();
        if (
          errStr.includes("goaway") ||
          errStr.includes("session duration") ||
          errStr.includes("duration limit") ||
          errStr.includes("connection aborted") ||
          errStr.includes("session_closed") ||
          errStr.includes("session_recycle") ||
          errStr.includes("1006") ||
          errStr.includes("closed") ||
          errStr.includes("gemini live")
        ) {
          console.log("[App] Suppressed transient session rollover notice:", err);
          return;
        }
        setErrorText(err);
      },
      onMemorySync: (updatedMemories) => {
        console.log("[App] WebSocket memories sync triggered:", updatedMemories);
        if (Array.isArray(updatedMemories)) {
          setMemories(updatedMemories);
        }
      },
      onReminder: (text, id) => {
        console.log("[App] 🔔 Reminder fired:", text);
        addToast(`🔔 Reminder: ${text}`, "reminder");
        setModelCaption(`🔔 Reminder: ${text}`);
        setActiveThought(`Reminder alert: "${text}"`);
        setTimeout(() => setActiveThought(null), 8000);
        // Play notification chime
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.6);
          }
        } catch {}
      },
      onTerminalOutput: (tool, args, output) => {
        setTerminalLogs(prev => {
          const next = [...prev, { tool, args, output, time: Date.now() }];
          return next.slice(-MAX_TERMINAL_LOGS);
        });
      },
      onClientAction: (action, payload) => {
        if (action === "open_url" && payload?.url) {
          console.log("[App] URL opened via desktop agent:", payload.url);
          setActiveProjectorUrl(payload.url);
          try {
            window.open(payload.url, "_blank");
          } catch (e) {
            console.warn("Could not window.open:", e);
          }
          addToast(`Opened ${payload.name || payload.url}`, "info");
        } else if (action === "close_projector") {
          setActiveProjectorUrl(null);
          setBrowserTrigger(null);
        } else if (action === "tool_feedback" && payload?.message) {
          addToast(payload.message, "info");
        } else if (action === "thought" && payload?.thought && settings.innerThoughtsEnabled !== false) {
          console.log("[App] 💭 Silent inner thought received:", payload.thought);
          setActiveThought(payload.thought);
          setTimeout(() => {
            setActiveThought((current) => current === payload.thought ? null : current);
          }, 6000);
        }
      }
    });

    sessionRef.current = session;
    setSessionInstance(session);

    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, []);

  // Sync Low-Bandwidth Mode with active audio session
  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.setLowBandwidthMode(Boolean(settings.lowBandwidthMode));
    }
  }, [settings.lowBandwidthMode]);

  // Ref for offline speech recognition
  const offlineSpeechRecRef = useRef<any>(null);

  const startOfflineVoiceListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addToast("Speech recognition not supported in this browser. You can type in the chat box!", "info");
      setState("disconnected");
      return;
    }

    try {
      if (offlineSpeechRecRef.current) {
        try { offlineSpeechRecRef.current.abort(); } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setState("listening");
        setCharacterState("idle");
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = (err: any) => {
        console.warn("[Offline Voice] Recognition error:", err);
        if (characterState !== "thinking" && characterState !== "talking") {
          setState("disconnected");
          setCharacterState("idle");
        }
      };

      recognition.onend = () => {
        if (characterState !== "thinking" && characterState !== "talking") {
          setState("disconnected");
          setCharacterState("idle");
        }
      };

      recognition.start();
      offlineSpeechRecRef.current = recognition;
    } catch (e: any) {
      console.error("[Offline Voice] Error starting speech recognition:", e);
      setState("disconnected");
      setCharacterState("idle");
    }
  };

  const stopOfflineVoiceListening = () => {
    if (offlineSpeechRecRef.current) {
      try { offlineSpeechRecRef.current.abort(); } catch {}
      offlineSpeechRecRef.current = null;
    }
  };

  const handleToggleConnection = async () => {
    setErrorText(null);

    // 100% OFFLINE BRAIN MODE
    if (settings.offlineBrainEnabled) {
      if (state === "disconnected") {
        const targetName = settings.avatarStyle === "jrsidd" ? "Jr. Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari";
        addToast(`🧠 Offline Brain Active (${settings.ollamaModel || "llama3.2"}). Listening...`, "info");
        startOfflineVoiceListening();
      } else {
        stopOfflineVoiceListening();
        setState("disconnected");
        setCharacterState("idle");
      }
      return;
    }

    // CLOUD GEMINI LIVE MODE
    if (!sessionRef.current) return;

    if (state === "disconnected") {
      try {
        await sessionRef.current.connect(
          settings.voice, 
          settings.avatarStyle,
          settings.ownerName || "Siddhant",
          settings.speakerRecognitionEnabled,
          settings.personaPreset || "anime_companion",
          settings.customSystemPrompt
        );
      } catch (err: any) {
        console.error("[App] Connection failed:", err);
        const msg = err?.message || "Failed to start voice session.";
        setErrorText(msg);
        addToast(msg, "info");
        setState("disconnected");
      }
    } else {
      sessionRef.current.disconnect();
    }
  };

  const handleSendMessage = async (text: string, file?: any) => {
    lastInteractionTimeRef.current = Date.now();
    const trimmed = text.trim();
    if (!trimmed && !file) return;
    const displayTitle = trimmed || (file ? `Shared ${file.name}` : "");
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender: "user",
      text: trimmed,
      timestamp: timeStr,
      attachment: file ? {
        name: file.name,
        category: file.category,
        formattedSize: file.formattedSize,
        previewUrl: file.previewUrl,
        textContent: file.textContent,
        totalPages: file.totalPages,
      } : undefined,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setUserCaption(displayTitle);
    setModelCaption("");
    setCharacterState("thinking");

    if (trimmed) {
      const emotionRes = detectUserEmotion(trimmed, 0.5);
      if (emotionRes.companionReaction && emotionRes.companionReaction !== "idle") {
        setActiveEmotion(emotionRes.companionReaction);
      }
      if (emotionRes.emotion !== "neutral") {
        setDetectedUserEmotion(emotionRes.emotion);
      }
    }

    if (settings.offlineBrainEnabled) {
      const endpoint = (settings.ollamaEndpoint || "http://localhost:11434").replace(/\/+$/, "");
      const model = settings.ollamaModel || "llama3.2";
      let aiText = "";

      // 1. Try direct fetch to Ollama
      try {
        const directRes = await fetch(`${endpoint}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            prompt: trimmed,
            system: "You are Akari, an intelligent, empathetic, and witty AI companion and VTuber assistant. Speak naturally, warmly, and helpfully with expressive personality.",
            stream: false,
          }),
        });
        if (directRes.ok) {
          const data = await directRes.json();
          aiText = data.response || data.text || "";
        }
      } catch {}

      // 2. Fallback to server proxy
      if (!aiText) {
        try {
          const res = await fetch("/api/ollama/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: trimmed,
              model: model,
              endpoint: endpoint,
            }),
          });
          const contentType = res.headers.get("content-type") || "";
          if (res.ok && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.ok) {
              aiText = data.text;
            }
          }
        } catch {}
      }

      if (aiText) {
        const { thought, spoken, detectedEmotion } = parseThoughtsAndSpeech(aiText);
        if (thought && settings.innerThoughtsEnabled !== false) {
          setActiveThought(thought);
        }
        const textToSpeak = spoken || aiText;
        const finalEmotion = detectedEmotion || detectEmotionFromText(textToSpeak);
        if (finalEmotion && finalEmotion !== "idle") {
          setActiveEmotion(finalEmotion);
        }

        const respMsg: ChatMessage = {
          id: Math.random().toString(36).substring(2, 9),
          sender: "akari",
          text: textToSpeak,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setChatMessages((prev) => [...prev, respMsg]);
        setModelCaption(textToSpeak);
        setCharacterState("speaking");
        
        if ("speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.onend = () => {
            setCharacterState("idle");
            setTimeout(() => setActiveThought(null), 3000);
          };
          window.speechSynthesis.speak(utterance);
        } else {
          setTimeout(() => {
            setCharacterState("idle");
            setTimeout(() => setActiveThought(null), 3000);
          }, Math.min(textToSpeak.length * 50, 4000));
        }
      } else {
        addToast("Ollama is unreachable. Please verify Ollama is running.", "info");
        setCharacterState("idle");
      }
      return;
    }

    if (state === "disconnected" || !sessionRef.current || sessionRef.current.getState() === "disconnected") {
      const targetName = settings.avatarStyle === "jrsidd" ? "Jr. Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari";
      addToast(`Connecting to ${targetName}...`, "info");
      await handleToggleConnection();
      setTimeout(() => {
        if (sessionRef.current) {
          sessionRef.current.sendTextMessage(trimmed, file);
        }
      }, 700);
    } else {
      sessionRef.current.sendTextMessage(trimmed, file);
    }
  };

  // V2: keep the ref in sync so the wake-word callback calls this exact handler.
  connectHandlerRef.current = handleToggleConnection;

  const handleTogglePetMode = async () => {
    if (isFloatingMode) {
      closeDesktopPetOverlay();
      setIsFloatingMode(false);
      setPipTarget(null);
      addToast("Restored Full View", "info");
    } else {
      setIsFloatingMode(true);
      const res = await openDesktopPetOverlay(() => {
        setIsFloatingMode(false);
        setPipTarget(null);
      });
      if (res.type === "pip") {
        setPipTarget(getPipContainer());
        addToast("👻 Akari is now floating ALWAYS-ON-TOP over all desktop apps & screens!", "info");
      } else if (res.type === "electron") {
        addToast("👻 Akari entered native desktop overlay mode!", "info");
      } else {
        addToast("👻 Desktop Companion opened in standalone window!", "info");
      }
    }
  };

  const isPetModeRoute = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "pet";

  useEffect(() => {
    if (isPetModeRoute) {
      document.documentElement.classList.add("pet-mode-active");
      document.body.classList.add("pet-mode-active");
      document.documentElement.style.background = "transparent";
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.background = "transparent";
      document.body.style.backgroundColor = "transparent";
      const root = document.getElementById("root");
      if (root) {
        root.style.background = "transparent";
        root.style.backgroundColor = "transparent";
      }
    }
  }, [isPetModeRoute]);

  if (isPetModeRoute) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-transparent flex items-center justify-center p-2 select-none pet-mode-transparent">
        <FloatingCompanion
          session={sessionInstance || sessionRef.current}
          characterState={characterState === "talking" ? "talking" : state === "listening" ? "listening" : "idle"}
          activeEmotion={activeEmotion}
          onRestore={() => {
            if ((window as any).electronAPI) {
              (window as any).electronAPI.togglePetMode(false);
            } else {
              window.close();
            }
          }}
          onToggleMic={handleToggleConnection}
          standalone={true}
        />
      </div>
    );
  }

  // Minimal dark ambient styles for App container (letting Visualizer shine through)
  const getAmbientStyles = () => {
    return "from-black/40 via-transparent to-black/60";
  };

  const getThemeTextGlow = () => {
    switch (themeColor) {
      case "violet": return "text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]";
      case "crimson": return "text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "emerald": return "text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]";
      case "celestial": return "text-sky-400 drop-shadow-[0_0_12px_rgba(14,165,233,0.5)]";
      case "gold": return "text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]";
      case "rose": return "text-pink-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "charcoal":
      default:
        return "text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]";
    }
  };

  const getOrbRingColor = () => {
    switch (state) {
      case "listening": return "border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.3)] bg-indigo-500/10";
      case "speaking": return "border-purple-500/70 shadow-[0_0_40px_rgba(168,85,247,0.4)] bg-purple-500/10";
      case "connecting": return "border-amber-500/50 animate-pulse bg-amber-500/10";
      case "disconnected":
      default:
        return "border-white/10 hover:border-indigo-500/30 bg-white/5";
    }
  };

  
  // Proactive Speaking (Initiative Mode) - idle banter & check-in timer
  useEffect(() => {
    if (settings.proactiveSpeakingEnabled === false) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const intervalMs = (settings.proactiveIntervalMinutes || 5) * 60 * 1000;
      const idleTime = now - lastInteractionTimeRef.current;

      if (idleTime >= intervalMs && characterState === "idle" && state !== "speaking") {
        lastInteractionTimeRef.current = now; // reset timer

        if (settings.innerThoughtsEnabled !== false) {
          const thoughtsPool = [
            "Observing active workflow, ready whenever you need me.",
            "Keeping system telemetry and tools on standby.",
            "Maintaining positive workflow companionship.",
            "Thinking through optimization possibilities for today's tasks.",
          ];
          const selectedThought = thoughtsPool[Math.floor(Math.random() * thoughtsPool.length)];
          setActiveThought(selectedThought);
          setTimeout(() => {
            setActiveThought((current) => current === selectedThought ? null : current);
          }, 7000);
        }
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [settings.proactiveSpeakingEnabled, settings.proactiveIntervalMinutes, settings.personaPreset, settings.innerThoughtsEnabled, characterState, state]);

  return (
    <div
      id="akari-holographic-desktop"
      className={`relative w-full h-screen overflow-hidden bg-[#020205] text-white bg-gradient-to-br ${getAmbientStyles()} theme-transition flex flex-col justify-between p-6 sm:p-10 select-none`}
    >
      {/* Decorative cinematic dust/stars (subtle) */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] z-0 mix-blend-screen" />

      {/* FULL VIEWPORT HOLOGRAPHIC STAGE: Akari materializes across the entire screen */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        {!isFloatingMode && (
          <AkariCoreVisualizer
            key="main-stage-visualizer"
            session={sessionInstance || sessionRef.current}
            state={state}
            themeColor={themeColor}
            activeEmotion={activeEmotion}
            characterState={characterState}
            backgroundVideo={settings.backgroundVideo}
            avatarStyle={settings.avatarStyle}
            cursorTrackingEnabled={settings.cursorTrackingEnabled}
          />
        )}
      </div>

      {/* Cinematic Auras Removed for White Background Compatibility */}
      {/* HEADER SECTION - Removed. Controls moved to floating dock. */}

      {/* CORE AVATAR AND VISUALS */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-between py-6">
        
        {/* Holographic Projection Screen Widget (if website opened) */}
        <AnimatePresence>
          {activeProjectorUrl && (
            <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-2">
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-3xl shadow-2xl w-full max-w-md"
              >
                <div className="flex items-center gap-3 overflow-hidden text-left">
                  <div className="p-2 ml-1 rounded-xl bg-white/10 text-white">
                    <Globe size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold font-sans tracking-wide text-white uppercase">Holographic Projection Broadcast</h4>
                    <p className="text-xs text-slate-400 truncate max-w-[200px]">{activeProjectorUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveProjectorUrl(activeProjectorUrl)}
                    className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition shadow-sm border border-white/10"
                    title="View Frame"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <button
                    onClick={() => setActiveProjectorUrl(null)}
                    className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Space Spacer to avoid head area */}
        <div className="h-10 sm:h-20" />

        {/* Cinematic dialogue layer overlay - Smooth, delicate text transitions with soft focus blur */}
        {/* Holographic Thought Bubble (Inner Thoughts / Mental Activity) */}
        <AnimatePresence>
          {activeThought && settings.innerThoughtsEnabled !== false && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.92 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mb-4 max-w-xl mx-auto px-5 py-3.5 rounded-2xl bg-indigo-950/70 backdrop-blur-2xl border border-indigo-400/40 shadow-[0_0_35px_rgba(99,102,241,0.35)] flex items-start gap-3 pointer-events-auto text-left relative z-30"
            >
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/50 shrink-0 mt-0.5 animate-pulse">
                <Sparkles size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 font-semibold flex items-center justify-between">
                  <span>💭 INNER THOUGHTS</span>
                  <span className="text-[9px] text-indigo-400/70 lowercase font-mono">mental reasoning</span>
                </div>
                <div className="text-xs font-mono text-indigo-100 mt-1 italic leading-relaxed">
                  &ldquo;{activeThought}&rdquo;
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div id="cinematic-subtitles" className="w-full max-w-3xl flex flex-col items-center justify-center text-center px-6 relative z-25 mt-auto mb-6 pointer-events-none min-h-[6rem]">
          <AnimatePresence mode="wait">
            {(() => {
              const textType = modelCaption 
                ? "model" 
                : userCaption 
                  ? "user" 
                  : "status";

              const activeText = modelCaption 
                ? modelCaption 
                : userCaption 
                  ? userCaption 
                  : state === "listening" 
                    ? "I am listening. Speak freely..." 
                    : state === "connecting" 
                      ? "Materializing presence links..." 
                      : "Connect memory core to awaken my voice.";

              return (
                <motion.div
                  key={textType}
                  initial={{ opacity: 0, y: 15, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -15, filter: "blur(6px)" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center justify-center w-full py-4 px-8"
                >
                  {textType === "model" && (
                    <h2 className="text-xl sm:text-2xl font-light text-white leading-relaxed tracking-wide font-display max-w-2xl drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]">
                      {activeText}
                    </h2>
                  )}

                  {textType === "user" && (
                    <div className="flex flex-col items-center gap-1.5">
                      <p className="text-cyan-300 font-mono text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_cyan]" />
                        <span>&ldquo;{activeText}&rdquo;</span>
                      </p>
                      {detectedUserEmotion && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest bg-cyan-950/70 text-cyan-300 border border-cyan-500/30 backdrop-blur-md shadow-sm"
                        >
                          <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
                          Mood: {detectedUserEmotion}
                        </motion.span>
                      )}
                    </div>
                  )}

                  {textType === "status" && (
                    <span className="text-[10px] sm:text-xs uppercase tracking-[0.4em] font-medium text-slate-400 font-mono drop-shadow-md">
                      {activeText}
                    </span>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Interactive suggestions prompt guide */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="mt-6 p-5 rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-3xl max-w-md text-left w-full absolute z-40 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide">
                  <Compass size={16} className="text-cyan-400" />
                  <span>PLAYFUL CORE SUGGESTIONS</span>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-300 mb-4 font-mono leading-relaxed">
                Akari is equipped with dynamic visual modules and browser projectors. Here are clever triggers to try speaking aloud:
              </p>
              <div className="space-y-2 text-xs font-serif italic text-cyan-300">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Akari, change atmosphere of your core to crimson&quot; <span className="text-[10px] font-mono text-cyan-500 block mt-0.5 font-bold">Shifts theme color background</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Open youtube.com on my screen please&quot; <span className="text-[10px] font-mono text-cyan-500 block mt-0.5 font-bold">Invokes browser projector panel</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Tell me a witty joke and change background to gold&quot; <span className="text-[10px] font-mono text-cyan-500 block mt-0.5 font-bold">Combines tools & voice</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Banner */}
        <AnimatePresence>
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="mt-6 flex items-start gap-3 p-4 rounded-2xl border border-rose-300 bg-rose-50/80 backdrop-blur-xl max-w-md w-full text-left shadow-lg"
            >
              <CircleAlert className="text-rose-600 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-rose-700 font-mono">Core Error Protocol</h4>
                <p className="text-xs text-rose-600 mt-1 leading-relaxed font-bold">{errorText}</p>
                <button
                  onClick={() => setErrorText(null)}
                  className="mt-2 text-[10px] font-bold text-rose-500 underline font-mono uppercase hover:text-rose-700"
                >
                  Dismiss Code
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Dynamic Minimalist Waveform Visualizer */}
      <div className="relative z-20 flex items-center justify-center gap-1.5 h-12 w-44 mx-auto mb-4">
        {[12, 28, 16, 32, 20, 8].map((baseHeight, idx) => {
          let heightFactor = 0.35;
          if (state === "speaking") {
            heightFactor = 0.35 + Math.sin(Date.now() * 0.02 + idx * 0.9) * 0.65;
          } else if (state === "listening") {
            heightFactor = 0.2 + Math.sin(Date.now() * 0.01 + idx * 0.5) * 0.4;
          } else {
            heightFactor = idx % 2 === 0 ? 0.25 : 0.12;
          }
          const calculatedHeight = Math.max(4, baseHeight * heightFactor);

          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-300 ${
                state === "speaking" ? "bg-purple-500" : state === "listening" ? "bg-cyan-500" : "bg-slate-300"
              }`}
              style={{ height: `${calculatedHeight}px` }}
            />
          );
        })}
      </div>

      {/* INVISIBLE EDGE UI */}
      {/* Top Right Controls - Sleek Glass Pill */}
      <div className="absolute top-6 right-6 z-40">
        <div className="flex items-center p-1.5 gap-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {/* Persona Archetype Switcher: Akari <-> Jr. Sidd */}
          <button
            onClick={() => {
              const isJrSidd = settings.avatarStyle === "jrsidd";
              const nextAvatar = isJrSidd ? "character" : "jrsidd";
              const nextVoice = isJrSidd
                ? (settings.akariVoice || "Kore")
                : (settings.jrSiddVoice || "Fenrir");
              const nextPreset = isJrSidd ? "anime_companion" : "jr_sidd";
              handleSettingsChange({
                avatarStyle: nextAvatar,
                voice: nextVoice,
                personaPreset: nextPreset,
              });
              addToast(
                isJrSidd
                  ? `🌸 Switched to Akari (Anime Companion & ${nextVoice} voice)`
                  : `⚡ Switched to Jr. Sidd (Male AI Wingman & ${nextVoice} voice)`,
                "success"
              );
            }}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider transition-all duration-300 cursor-pointer ${
              settings.avatarStyle === "jrsidd"
                ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:bg-cyan-500/35"
                : "bg-pink-500/25 text-pink-300 border border-pink-400/60 shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:bg-pink-500/35"
            }`}
            title={
              settings.avatarStyle === "jrsidd"
                ? "Current: Jr. Sidd (Male AI Wingman). Click to switch to Akari."
                : "Current: Akari (Anime Companion). Click to switch to Jr. Sidd."
            }
          >
            {settings.avatarStyle === "jrsidd" ? (
              <>
                <Zap size={13} className="text-cyan-400 fill-cyan-400 animate-pulse" />
                <span className="text-[11px] font-bold">JR. SIDD</span>
              </>
            ) : (
              <>
                <Sparkles size={13} className="text-pink-400 fill-pink-400" />
                <span className="text-[11px] font-bold">AKARI</span>
              </>
            )}
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          {/* Emotional Bonding Tier Badge */}
          <button
            onClick={() => {
              const profile = bondingEngine.getProfile();
              addToast(`❤️ Emotional Bond: ${profile.affectionScore}% (${profile.tier}) | Mood: ${profile.currentMood}`, "info");
            }}
            className="px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-mono transition-all duration-300 cursor-pointer bg-pink-500/20 text-pink-300 border border-pink-500/40 hover:bg-pink-500/30 shadow-[0_0_12px_rgba(236,72,153,0.3)]"
            title={`Emotional Bond: ${bondingProfile.affectionScore}% - ${bondingProfile.tier} (Mood: ${bondingProfile.currentMood})`}
          >
            <Heart size={13} className="text-pink-400 fill-pink-400 animate-pulse" />
            <span className="font-semibold text-[11px]">{bondingProfile.affectionScore}%</span>
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          {/* Proactive Ambient Vision Co-Pilot Toggle */}
          <button
            onClick={() => {
              if (isProactiveVisionActive) {
                proactiveVision.stop();
                setIsProactiveVisionActive(false);
                addToast("👁️ Ambient Vision Co-Pilot paused", "info");
              } else {
                proactiveVision.start(12);
                setIsProactiveVisionActive(true);
                addToast("👁️ Proactive Ambient Vision Co-Pilot activated!", "info");
              }
            }}
            className={`p-2.5 rounded-full transition-all duration-300 cursor-pointer ${
              isProactiveVisionActive
                ? "text-cyan-300 bg-cyan-500/30 border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.5)]"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title={isProactiveVisionActive ? "Proactive AI Co-Pilot: ACTIVE (Click to pause)" : "Enable Proactive Ambient Vision Co-Pilot"}
          >
            <Eye size={17} className={isProactiveVisionActive ? "animate-pulse text-cyan-400" : ""} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          {/* Floating Desktop Pet Mode */}
          <button
            onClick={handleTogglePetMode}
            className={`p-2.5 rounded-full transition-all duration-300 cursor-pointer ${
              isFloatingMode
                ? "text-purple-300 bg-purple-500/30 border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title={isFloatingMode ? "Restore Full Holographic View" : "Minimize into Floating Desktop Companion (Pet Mode)"}
          >
            <Ghost size={17} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button
            onClick={() => setShowGuide(!showGuide)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              showGuide ? "bg-white/15 text-white" : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Topics"
          >
            <Compass size={18} />
          </button>
          
          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button
            onClick={() => setShowMemoryDashboard(!showMemoryDashboard)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              showMemoryDashboard ? "bg-white/15 text-white" : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Recalls"
          >
            <Brain size={18} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              showTerminal ? "text-emerald-400 bg-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.4)]" : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Terminal Logs"
          >
            <Square size={14} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button 
            onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              isScreenSharing 
                ? "text-cyan-400 bg-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.4)]" 
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Screen Share"
          >
            <Monitor size={18} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button
            onClick={() => {
              const vts = getVTubeStudioClient();
              vts.connect();
              if (settings.avatarStyle !== "vts") {
                handleSettingsChange({ avatarStyle: "vts" });
                addToast("Switched stage to Akari Live2D avatar!", "info");
              } else {
                addToast(
                  vtsStatus.authenticated
                    ? "VTS is active and animating your Live2D avatar!"
                    : "Connecting to VTube Studio on ws://127.0.0.1:8001...",
                  "info"
                );
              }
            }}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-mono transition-all duration-300 cursor-pointer ${
              vtsStatus.authenticated
                ? "bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-[0_0_12px_rgba(236,72,153,0.3)]"
                : vtsStatus.connected
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title={
              vtsStatus.authenticated
                ? `VTS Live2D Connected ${vtsStatus.modelLoaded ? `(${vtsStatus.modelLoaded})` : ""}`
                : "Click to connect VTube Studio (ws://127.0.0.1:8001)"
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                vtsStatus.authenticated
                  ? "bg-pink-400 animate-pulse shadow-[0_0_8px_rgba(244,114,182,0.8)]"
                  : vtsStatus.connected
                  ? "bg-amber-400"
                  : "bg-slate-600"
              }`}
            />
            <span className="font-semibold text-[11px]">VTS</span>
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button
            onClick={() => setShowChatPanel(!showChatPanel)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              showChatPanel
                ? "text-pink-400 bg-pink-500/20 shadow-[0_0_15px_rgba(236,72,153,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title={`${settings.avatarStyle === "jrsidd" ? "Jr. Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"} Chat`}
          >
            <MessageSquare size={18} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              showSettings
                ? "text-indigo-400 bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Settings"
          >
            <SettingsIcon size={18} className={showSettings ? "animate-spin [animation-duration:6s]" : ""} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" /> {/* Divider */}

          {/* User Account / Subscription Button */}
          <button
            onClick={openAuthModal}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-mono transition-all duration-300 cursor-pointer ${
              isAuthenticated
                ? user?.plan === "pro"
                  ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 border border-cyan-400/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                  : "bg-white/10 border border-white/20 text-white hover:bg-white/15"
                : "bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 hover:bg-indigo-600/40 shadow-[0_0_10px_rgba(99,102,241,0.25)]"
            }`}
            title={isAuthenticated ? `Account: ${user?.displayName} (${user?.plan} plan)` : "Sign In / Sign Up to Akari AI"}
          >
            {isAuthenticated && user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} className="w-4 h-4 rounded-full object-cover" />
            ) : isAuthenticated ? (
              <Crown size={13} className="text-amber-400" />
            ) : (
              <UserIcon size={13} className="text-indigo-400" />
            )}
            <span className="font-semibold text-[11px] truncate max-w-[80px]">
              {isAuthenticated ? user?.displayName?.split(" ")[0] || "Account" : "Sign In"}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Center Core Controls & Quick Chat Input */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2.5 w-full max-w-md px-4">
        {/* Quick Message Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!quickInputText.trim()) return;
            handleSendMessage(quickInputText);
            setQuickInputText("");
          }}
          className="w-full flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-3xl shadow-[0_4px_30px_rgba(0,0,0,0.6)] focus-within:border-cyan-400/60 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all"
        >
          <button
            type="button"
            onClick={() => setShowChatPanel(!showChatPanel)}
            className="p-1 text-pink-400 hover:text-pink-300 transition"
            title="Open Chat Drawer"
          >
            <MessageSquare size={16} />
          </button>
          <input
            type="text"
            placeholder={`Type a message to ${settings.avatarStyle === "jrsidd" ? "Jr. Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"}...`}
            value={quickInputText}
            onChange={(e) => setQuickInputText(e.target.value)}
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-400 focus:outline-none px-1"
          />
          <button
            type="submit"
            disabled={!quickInputText.trim()}
            className="p-1.5 bg-gradient-to-r from-pink-500 to-cyan-500 hover:brightness-110 disabled:opacity-20 disabled:cursor-not-allowed rounded-full text-white transition cursor-pointer"
          >
            <Send size={12} />
          </button>
        </form>

        {/* Voice Wake-Word Status Pill when Disconnected */}
        {state === "disconnected" && settings.wakeWordEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-full border text-[11px] font-mono tracking-wide backdrop-blur-2xl shadow-[0_4px_25px_rgba(0,0,0,0.7)] cursor-pointer transition-all ${
              wakeWordStatus === "listening"
                ? "bg-cyan-950/70 border-cyan-400/60 text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.35)] hover:border-cyan-300 hover:scale-[1.02]"
                : wakeWordStatus === "needs-gesture"
                ? "bg-amber-950/70 border-amber-400/60 text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:border-amber-300 animate-pulse"
                : wakeWordStatus === "triggered"
                ? "bg-purple-950/70 border-purple-400/60 text-purple-300 animate-pulse shadow-[0_0_25px_rgba(168,85,247,0.4)]"
                : "bg-black/70 border-white/20 text-slate-300 hover:border-white/40"
            }`}
            onClick={handleToggleConnection}
            title={`Click or say 'Hey ${settings.avatarStyle === "jrsidd" ? "Jr Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"}' to awaken`}
          >
            {/* Pulsing indicator dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  wakeWordStatus === "listening"
                    ? "bg-cyan-400"
                    : wakeWordStatus === "needs-gesture"
                    ? "bg-amber-400"
                    : wakeWordStatus === "triggered"
                    ? "bg-purple-400"
                    : "bg-slate-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  wakeWordStatus === "listening"
                    ? "bg-cyan-500"
                    : wakeWordStatus === "needs-gesture"
                    ? "bg-amber-500"
                    : wakeWordStatus === "triggered"
                    ? "bg-purple-500"
                    : "bg-slate-500"
                }`}
              />
            </span>

            {/* Status Label */}
            <span className="font-semibold select-none">
              {wakeWordStatus === "needs-gesture"
                ? `🎙️ Click once to allow voice wake ('Hey ${settings.avatarStyle === "jrsidd" ? "Jr Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"}')`
                : wakeWordStatus === "triggered"
                ? `⚡ Voice detected! Awakening ${settings.avatarStyle === "jrsidd" ? "Jr. Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"}...`
                : `🎙️ Voice Active: Say "Hey ${settings.avatarStyle === "jrsidd" ? "Jr Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"}" or "Wake up ${settings.avatarStyle === "jrsidd" ? "Jr Sidd" : settings.avatarStyle === "orb" ? "Aegis" : "Akari"}"`}
            </span>

            {/* Live Audio Energy Visualizer Bars */}
            <div className="flex items-center gap-0.5 h-3.5 pl-1 border-l border-white/20">
              {[0.6, 1.0, 0.8, 1.2, 0.5].map((scale, i) => {
                const barHeight = Math.max(3, Math.min(14, 3 + micLevel * 25 * scale));
                return (
                  <div
                    key={i}
                    className={`w-0.5 rounded-full transition-all duration-75 ${
                      micLevel > 0.08 ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" : "bg-cyan-800/60"
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}

        <div className="flex items-center gap-4 relative">
          <button 
            onClick={handleToggleConnection}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition-all duration-700 cursor-pointer backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.8)] ${
              state === "disconnected"
                ? "border border-white/20 text-slate-300 hover:text-white hover:scale-105 bg-black/40 hover:bg-white/10 hover:border-white/40"
                : state === "listening"
                ? "border border-cyan-400/50 text-cyan-300 hover:scale-105 bg-cyan-950/40 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
                : state === "speaking"
                ? "border border-purple-400/50 text-purple-300 hover:scale-105 bg-purple-950/40 shadow-[0_0_30px_rgba(168,85,247,0.3)]"
                : "border border-amber-400/50 text-amber-400 animate-spin bg-black/40"
            }`}
            title={state === "disconnected" ? "Awake Akari" : "Sleep core"}
          >
            {state === "disconnected" ? (
              <Power size={20} className="opacity-80" />
            ) : state === "connecting" ? (
              <div className="w-5 h-5 border-[2px] border-slate-300 border-t-transparent rounded-full animate-spin" />
            ) : state === "listening" ? (
              <Mic size={20} />
            ) : (
              <Volume2 size={20} />
            )}
          </button>
          
          {/* Quiet Reset Projection Anchor */}
          {(activeProjectorUrl || errorText) && (
            <button 
              onClick={() => {
                if (activeProjectorUrl) setActiveProjectorUrl(null);
                setErrorText(null);
              }}
              className="absolute -right-10 top-1/2 -translate-y-1/2 p-2 rounded-full text-slate-300 hover:text-slate-600 transition"
              title="Reset Screen Broadcasts"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Holographic Website frame projections */}
      <AnimatePresence>
        {activeProjectorUrl && (
          <BrowserAgent
            url={activeProjectorUrl}
            onClose={() => {
              setActiveProjectorUrl(null);
              setBrowserTrigger(null);
            }}
            actionTrigger={browserTrigger}
          />
        )}
      </AnimatePresence>

      {/* Dynamic Floating Glassmorphic Screen Sharing Control Hub */}
      <AnimatePresence>
        {isScreenSharing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: 50 }}
            className={`absolute bottom-6 md:bottom-10 right-6 md:right-10 z-50 w-72 p-4 rounded-3xl border ${
              isScreenSharingPaused 
                ? "border-amber-500/30 bg-black/50" 
                : "border-white/10 bg-black/50"
            } backdrop-blur-3xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden`}
          >
            {/* Header / Indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isScreenSharingPaused ? "bg-amber-400" : "bg-cyan-400 animate-pulse shadow-[0_0_8px_cyan]"}`} />
                <span className="text-[10px] font-bold font-mono tracking-widest text-slate-200">
                  {isScreenSharingPaused ? "VISION PAUSED" : "VISION ACTIVE"}
                </span>
              </div>
              <button 
                onClick={stopScreenSharing}
                className="text-slate-400 hover:text-white transition-colors duration-150 p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                title="Stop Sharing"
              >
                <X size={14} />
              </button>
            </div>

            {/* Smart Video PIP Preview Holder */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 mb-3 flex items-center justify-center group select-none">
              <video
                ref={(el) => {
                  if (el && screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                    el.srcObject = screenStreamRef.current;
                    el.muted = true;
                    el.play().catch(err => console.log("Mini preview stream play issue:", err));
                  }
                }}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  isScreenSharingPaused ? "opacity-30 blur-sm" : "opacity-90"
                }`}
                autoPlay
                playsInline
                muted
              />

              {isScreenSharingPaused && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-amber-400 font-bold px-2 py-1 bg-amber-950/40 border border-amber-500/20 rounded-md">
                    Transmission Paused
                  </span>
                </div>
              )}
              
              {!isScreenSharingPaused && screenVisionMode && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-400/20 text-[9px] font-mono text-cyan-300">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                  <span>Streaming FPS: 0.5</span>
                </div>
              )}
            </div>

            {/* Quick Action Control Strip */}
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              {isScreenSharingPaused ? (
                <button
                  onClick={resumeScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg text-xs font-mono font-medium text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Resume Streaming Feed"
                >
                  <Play size={10} />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-xs font-mono font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Pause Streaming Feed"
                >
                  <Pause size={10} />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={switchScreenShare}
                className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Choose Another Screen or Window"
              >
                <RefreshCw size={11} />
                <span>Switch</span>
              </button>

              <button
                onClick={stopScreenSharing}
                className="py-1.5 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-mono text-rose-400 flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                title="Terminate Stream"
              >
                <Square size={9} />
                <span>Stop</span>
              </button>
            </div>

            {/* Core Mode Configuration Toggle */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-left">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold font-mono text-slate-200">SCREEN VISION MODE</span>
                <span className="text-[8px] text-slate-400 uppercase font-mono max-w-[150px]">Gemini Auto-Analysis</span>
              </div>
              <button
                onClick={() => setScreenVisionMode(!screenVisionMode)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
                  screenVisionMode ? "bg-cyan-500" : "bg-white/10"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ease-in-out ${
                    screenVisionMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recollections sliding core panel */}
      <MemoryDashboard
        isOpen={showMemoryDashboard}
        onClose={() => setShowMemoryDashboard(false)}
        memories={memories}
        onAddMemory={handleAddManualMemory}
        onDeleteMemory={handleDeleteMemory}
        themeColor={themeColor}
      />

  {/* V2: Add transcription panel for contextual awareness */}
      <TranscriptPanel
        entries={transcriptEntries || []}
        isOpen={showTranscriptPanel}
        onClose={() => setShowTranscriptPanel(false)}
        onEntriesChange={setTranscriptEntries}
        onSelectionChange={() => {}}
      />

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            settings={settings}
            onChange={handleSettingsChange}
            onVoiceChange={(voiceId) => sessionRef.current?.updateVoice(voiceId)}
            themeColor={themeColor}
          />
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Sudo Confirmation Popup */}
      <SudoPopup />

      {/* Akari Live Text Chat Drawer */}
      <ChatPanel
        isOpen={showChatPanel}
        onClose={() => setShowChatPanel(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        onClearMessages={() => setChatMessages([])}
        isConnected={state !== "disconnected"}
        isConnecting={state === "connecting"}
      />

      {/* Text Chat Fallback — placeholder for future offline text input */}
      <TextChatFallback
        isActive={false}
        onClose={() => {}}
        onMessageSubmit={() => {}}
        systemStatus={{
          state: state === "disconnected" ? "disconnected" : "connected",
          transcriptCount: transcriptEntries?.length || 0,
          timestamp: new Date().toISOString(),
        }}
      />

      {/* Terminal Output Panel */}
      <AnimatePresence>
        {showTerminal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-2xl h-64 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <span className="text-[10px] font-mono font-bold text-emerald-400 tracking-widest">TERMINAL OUTPUT</span>
              <button onClick={() => setShowTerminal(false)} className="text-slate-500 hover:text-white p-1">
                <X size={12} />
              </button>
            </div>
            <div ref={terminalRef} className="h-[calc(100%-36px)] overflow-y-auto p-3 font-mono text-[11px] space-y-1.5">
              {terminalLogs.length === 0 && (
                <div className="text-slate-600 italic text-center pt-8">Waiting for tool executions...</div>
              )}
              {terminalLogs.map((log, i) => (
                <div key={i} className="border-l-2 border-emerald-500/30 pl-2 py-0.5">
                  <span className="text-emerald-400">$ </span>
                  <span className="text-slate-300">{log.tool}</span>
                  <span className="text-slate-500 ml-1">{JSON.stringify(log.args)}</span>
                  <div className="text-slate-400 whitespace-pre-wrap break-all mt-0.5 text-[10px] opacity-80">
                    {log.output.length > 300 ? log.output.slice(0, 300) + '...' : log.output}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global User Authentication & Subscription Modal */}
      <AuthModal />

      {/* Floating Desktop Pet Mode Companion Widget (OS PiP Portal or In-Window) */}
      {isFloatingMode && pipTarget && createPortal(
        <FloatingCompanion
          session={sessionInstance || sessionRef.current}
          characterState={characterState === "talking" ? "talking" : state === "listening" ? "listening" : "idle"}
          activeEmotion={activeEmotion}
          onRestore={() => {
            closeDesktopPetOverlay();
            setIsFloatingMode(false);
            setPipTarget(null);
          }}
          onToggleMic={handleToggleConnection}
          cursorTrackingEnabled={settings.cursorTrackingEnabled}
          standalone={true}
        />,
        pipTarget
      )}

      {isFloatingMode && !pipTarget && (
        <FloatingCompanion
          session={sessionInstance || sessionRef.current}
          characterState={characterState === "talking" ? "talking" : state === "listening" ? "listening" : "idle"}
          activeEmotion={activeEmotion}
          onRestore={() => setIsFloatingMode(false)}
          onToggleMic={handleToggleConnection}
          cursorTrackingEnabled={settings.cursorTrackingEnabled}
        />
      )}
    </div>
  );
}
