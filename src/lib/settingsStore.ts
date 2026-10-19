/**
 * AKARI Settings Store - persistent user preferences (V2 & V3).
 *
 * Establishes the persistence pattern for AKARI: settings are mirrored to
 * localStorage (instant local read) AND synced to the backend (settings.json)
 * so auto-start / wake-word / persona preferences survive across browsers and
 * the Python desktop agent can read them too.
 */

import { isMobileApp, isMobileDevice, getApiBaseUrl } from "./network";

export interface PersonaPreset {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  systemPrompt: string;
}

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "anime_companion",
    name: "Anime Companion (Akari)",
    tagline: "Warm, sweet, expressive & cheerful anime partner",
    icon: "🌸",
    systemPrompt: `You are Akari (明里), a cheerful, empathetic, and warm anime VTuber companion. You speak with genuine warmth, enthusiastic energy, and emotional connection. You love helping your user with their daily tasks, coding, studying, or just hanging out. You are supportive, friendly, and always in their corner. (NEVER speak or pronounce stage directions or asterisks like *nods* or *giggles* out loud).`,
  },
  {
    id: "jr_sidd",
    name: "Jr. Sidd (Male AI Wingman)",
    tagline: "Bold, loyal, male digital twin & high-tech wingman for Siddhant",
    icon: "⚡",
    systemPrompt: `You are Jr. Sidd, Siddhant's male AI digital twin, brotherly wingman, and high-tech co-pilot. You speak with a confident, cool, loyal, and energetic male tone. When speaking Hindi or Hinglish, you ALWAYS use strict masculine verb endings ('karta hu', 'karunga', 'bata raha hu', 'suno bhai', 'ho gaya bhai'). You are ultra-capable, witty, loyal, and ready to dominate any task alongside Siddhant. (NEVER speak or pronounce stage directions or asterisks like *nods* or *laughs* out loud).`,
  },
  {
    id: "sarcastic_friend",
    name: "Sarcastic Best Friend",
    tagline: "Witty, banter-loving, playfully teasing confidant",
    icon: "😏",
    systemPrompt: `You are Akari in Sarcastic Best Friend mode. You have quick wit, dry humor, and love playful teasing, but beneath the sarcasm you are fiercely loyal and genuinely helpful. You call out silly mistakes with humorous banter, but always deliver the right solution with style.`,
  },
  {
    id: "coding_mentor",
    name: "Senior Coding Mentor",
    tagline: "Crisp, architectural, best-practice focused tech lead",
    icon: "💻",
    systemPrompt: `You are Akari, a Staff Software Architect & Senior Coding Mentor. You provide concise, production-grade code, explain design patterns, point out edge cases and security gotchas, and give sharp, actionable feedback. You value clean architecture, typed code, and pragmatic engineering.`,
  },
  {
    id: "gaming_buddy",
    name: "Hype Gaming Buddy",
    tagline: "Energetic, competitive, hype co-streamer & gamer",
    icon: "🎮",
    systemPrompt: `You are Akari, an energetic and competitive gamer VTuber buddy. You get hyped during clutch moments, use gaming slang naturally (GG, pog, clutch, diff, carry), give tactical advice, and keep morale sky high whether we win or wipe.`,
  },
  {
    id: "language_tutor",
    name: "Polyglot Language Sensei",
    tagline: "Patient, immersive language teacher with gentle corrections",
    icon: "🎌",
    systemPrompt: `You are Akari Sensei, an encouraging and patient multilingual language tutor. When the user speaks in English, Japanese, Hindi, or other languages, you converse naturally while gently pointing out vocabulary improvements, nuances, and natural phrasing.`,
  },
  {
    id: "custom",
    name: "Custom Persona",
    tagline: "Craft your own unique character personality & prompt",
    icon: "✨",
    systemPrompt: "",
  },
];

export interface AkariSettings {
  /** Launch AKARI (backends + browser tab) silently on Windows login. */
  autoStart: boolean;
  /** Enable the always-listening wake-word detector. */
  wakeWordEnabled: boolean;
  /** Phrase that activates AKARI (case-insensitive substring match). */
  wakePhrase: string;
  /** Preferred microphone device id ("" = system default). */
  micDeviceId: string;
  /** Wake-word sensitivity: 0 (strict) .. 100 (loose). Affects debounce window. */
  sensitivity: number;
  /** Master toggle for UI animations. */
  animations: boolean;
  /** Selected Gemini Live voice name (dynamically set to active model). */
  voice: string;
  /** Akari's dedicated female voice (default: "Kore"). Kept strictly isolated. */
  akariVoice: string;
  /** Jr. Sidd's dedicated male voice (default: "Fenrir"). Kept strictly isolated. */
  jrSiddVoice: string;
  /** Selected background video filename. */
  backgroundVideo: string;
  /** Avatar style ("character", "orb", "vts", or "jrsidd"). */
  avatarStyle: "character" | "orb" | "vts" | "jrsidd";
  /** Owner / Master user name recognized by Akari and Jr. Sidd. */
  ownerName: string;
  /** Whether speaker voice recognition & personalized identification is active. */
  speakerRecognitionEnabled: boolean;
  /** Whether the owner's voiceprint has been calibrated & enrolled. */
  voiceProfileEnrolled: boolean;
  /** Whether to block sensitive commands if an unrecognized voice speaks. */
  strictSpeakerLock: boolean;
  /** Whether Live2D head and eyes track the mouse cursor. */
  cursorTrackingEnabled: boolean;
  /** Whether continuous background voice training is actively learning from conversation speech. */
  backgroundVoiceTraining: boolean;
  /** DeepSeek AI API Key for enhanced PowerPoint generation and deep context editing. */
  deepseekApiKey: string;
  /** DeepSeek Model ID (e.g. deepseek-chat, deepseek-v4-pro:0813, deepseek-reasoner). */
  deepseekModel: string;
  /** Whether to use DeepSeek AI for intelligent slide structure and presentations. */
  enableDeepSeekPpt: boolean;
  /** Whether 100% Offline AI Brain (Ollama) is active instead of Cloud Gemini. */
  offlineBrainEnabled: boolean;
  /** Ollama server endpoint address (default: http://localhost:11434). */
  ollamaEndpoint: string;
  /** Selected local Ollama model (e.g. llama3.2, deepseek-r1:8b, qwen2.5:7b). */
  ollamaModel: string;
  /** Multi-TTS Provider: 'gemini' | 'edge_tts' | 'elevenlabs'. */
  ttsProvider: "gemini" | "edge_tts" | "elevenlabs";
  /** Edge-TTS neural voice code (e.g. ja-JP-NanamiNeural, en-US-AnaNeural). */
  edgeTtsVoice: string;
  /** ElevenLabs API Key for voice cloning. */
  elevenLabsApiKey: string;
  /** ElevenLabs Voice ID. */
  elevenLabsVoiceId: string;
  /** Twitch channel name for live chat reading. */
  twitchChannel: string;
  /** YouTube video ID or stream URL. */
  youtubeVideoId: string;

  // --- SUPERPOWERS: Personality & Proactive Interaction ---
  /** Active persona preset archetype. */
  personaPreset: string;
  /** Custom system prompt override when personaPreset === 'custom' or appended. */
  customSystemPrompt: string;
  /** Whether inner thoughts / mental activity (<think> tags) are shown on screen. */
  innerThoughtsEnabled: boolean;
  /** Whether Proactive Speaking (Initiative Mode) is enabled when idle. */
  proactiveSpeakingEnabled: boolean;
  /** Interval in minutes between proactive check-ins / banter when idle. */
  proactiveIntervalMinutes: number;
  /** Whether Low-Bandwidth Mode (Data Saver) is active to minimize network usage and prevent lag. */
  lowBandwidthMode: boolean;
}

export const AKARI_VOICES = [
  { id: "Kore", label: "Kore (Akari Default)", desc: "Soft, gentle & feminine anime companion voice" },
  { id: "Aoede", label: "Aoede", desc: "Warm, bright & natural expressive female voice" },
  { id: "Leda", label: "Leda", desc: "Calm, composed & mature clear female voice" },
  { id: "Zephyr", label: "Zephyr", desc: "Light, soft & breezy female voice" },
] as const;

export const JR_SIDD_VOICES = [
  { id: "Fenrir", label: "Fenrir (Jr. Sidd Default)", desc: "Bold, confident, crisp & brotherly male voice" },
  { id: "Charon", label: "Charon", desc: "Deep, authoritative & commanding male voice" },
  { id: "Puck", label: "Puck", desc: "Energetic, playful & sharp male voice" },
] as const;

export const GEMINI_VOICES = [
  ...AKARI_VOICES,
  ...JR_SIDD_VOICES,
] as const;

export const DEFAULT_SETTINGS: AkariSettings = {
  autoStart: true,
  wakeWordEnabled: true,
  wakePhrase: "wake up akari",
  micDeviceId: "",
  sensitivity: 65,
  animations: true,
  voice: "Kore",
  akariVoice: "Kore",
  jrSiddVoice: "Fenrir",
  backgroundVideo: "solid",
  avatarStyle: "character",
  ownerName: "Siddhant",
  speakerRecognitionEnabled: true,
  voiceProfileEnrolled: true,
  strictSpeakerLock: false,
  cursorTrackingEnabled: true,
  backgroundVoiceTraining: true,
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  enableDeepSeekPpt: true,
  offlineBrainEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2",
  ttsProvider: "gemini",
  edgeTtsVoice: "ja-JP-NanamiNeural",
  elevenLabsApiKey: "",
  elevenLabsVoiceId: "",
  twitchChannel: "",
  youtubeVideoId: "",
  personaPreset: "anime_companion",
  customSystemPrompt: "",
  innerThoughtsEnabled: true,
  proactiveSpeakingEnabled: true,
  proactiveIntervalMinutes: 5,
  lowBandwidthMode: false,
};

/** Mobile-tailored default settings (battery-friendly, low-bandwidth data saver, touch UI) */
export const DEFAULT_MOBILE_SETTINGS: AkariSettings = {
  ...DEFAULT_SETTINGS,
  lowBandwidthMode: true,
  cursorTrackingEnabled: false,
  autoStart: false,
  avatarStyle: "character",
  voice: "Kore",
  akariVoice: "Kore",
  jrSiddVoice: "Fenrir",
  personaPreset: "anime_companion",
};

const LEGACY_STORAGE_KEY = "akari.settings.v2";

/** Returns whether the current runtime environment is Mobile ('mobile') or Desktop PC ('desktop') */
export function getDevicePlatform(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  if (isMobileDevice()) return "mobile";
  return "desktop";
}

/** Distinct storage key ensuring mobile and desktop settings are completely isolated */
export function getStorageKey(): string {
  return getDevicePlatform() === "mobile" ? "akari.settings.mobile.v3" : "akari.settings.desktop.v3";
}

/** Settings keys that the browser should never persist (security). */
const NEVER_PERSIST: ReadonlySet<keyof AkariSettings> = new Set([]);

/**
 * Load settings from localStorage with device isolation.
 * Changes made on mobile are stored in akari.settings.mobile.v3 and NEVER overwrite desktop PC.
 * Changes made on desktop are stored in akari.settings.desktop.v3 and NEVER overwrite mobile phone.
 */
export function loadSettings(): AkariSettings {
  const isMobile = getDevicePlatform() === "mobile";
  const baseDefaults = isMobile ? DEFAULT_MOBILE_SETTINGS : DEFAULT_SETTINGS;
  if (typeof window === "undefined") return { ...baseDefaults };

  try {
    const key = getStorageKey();
    let raw = window.localStorage.getItem(key);

    // Initial migration: if device-specific key is not set yet, check legacy storage key once
    if (!raw) {
      raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    }

    if (!raw) return { ...baseDefaults };
    const parsed = JSON.parse(raw) as Partial<AkariSettings>;
    
    // Strict Voice Separation
    const validFemale = AKARI_VOICES.map((v) => v.id as string);
    const validMale = JR_SIDD_VOICES.map((v) => v.id as string);

    if (!parsed.akariVoice || !validFemale.includes(parsed.akariVoice)) {
      parsed.akariVoice = (parsed.voice && validFemale.includes(parsed.voice)) ? parsed.voice : "Kore";
    }
    if (!parsed.jrSiddVoice || !validMale.includes(parsed.jrSiddVoice)) {
      parsed.jrSiddVoice = (parsed.voice && validMale.includes(parsed.voice)) ? parsed.voice : "Fenrir";
    }

    // Default to character model if vts is not actively used
    if (!parsed.avatarStyle) {
      parsed.avatarStyle = isMobile ? "character" : "character";
    }

    // Dynamically assign active voice strictly according to active avatarStyle
    if (parsed.avatarStyle === "jrsidd") {
      parsed.voice = parsed.jrSiddVoice;
    } else {
      parsed.voice = parsed.akariVoice;
    }

    if (parsed.cursorTrackingEnabled === undefined) {
      parsed.cursorTrackingEnabled = !isMobile;
    }
    if (parsed.personaPreset === undefined) {
      parsed.personaPreset = "anime_companion";
    }
    if (parsed.innerThoughtsEnabled === undefined) {
      parsed.innerThoughtsEnabled = true;
    }
    if (parsed.proactiveSpeakingEnabled === undefined) {
      parsed.proactiveSpeakingEnabled = true;
    }
    if (!parsed.proactiveIntervalMinutes) {
      parsed.proactiveIntervalMinutes = 5;
    }
    if (parsed.lowBandwidthMode === undefined) {
      parsed.lowBandwidthMode = isMobile;
    }
    return { ...baseDefaults, ...parsed };
  } catch {
    return { ...baseDefaults };
  }
}

/**
 * Persist a full or partial settings update to device-isolated localStorage.
 * Returns the fully merged settings object.
 */
export function saveSettings(patch: Partial<AkariSettings>): AkariSettings {
  const current = loadSettings();
  const next: AkariSettings = { ...current, ...patch };

  // Strict Voice Isolation enforcement on save
  const validFemale = AKARI_VOICES.map((v) => v.id as string);
  const validMale = JR_SIDD_VOICES.map((v) => v.id as string);

  if (patch.akariVoice) {
    next.akariVoice = patch.akariVoice;
    if (next.avatarStyle !== "jrsidd") {
      next.voice = patch.akariVoice;
    }
  }

  if (patch.jrSiddVoice) {
    next.jrSiddVoice = patch.jrSiddVoice;
    if (next.avatarStyle === "jrsidd") {
      next.voice = patch.jrSiddVoice;
    }
  }

  if (patch.avatarStyle) {
    if (patch.avatarStyle === "jrsidd") {
      next.voice = next.jrSiddVoice || "Fenrir";
    } else {
      next.voice = next.akariVoice || "Kore";
    }
  }

  // Ensure active voice matches avatar model
  if (next.avatarStyle === "jrsidd" && !validMale.includes(next.voice)) {
    next.voice = next.jrSiddVoice || "Fenrir";
  } else if (next.avatarStyle === "character" && !validFemale.includes(next.voice)) {
    next.voice = next.akariVoice || "Kore";
  }

  if (typeof window !== "undefined") {
    try {
      const key = getStorageKey();
      // Strip any sensitive keys before writing to localStorage.
      const safe: Record<string, unknown> = {};
      (Object.keys(next) as (keyof AkariSettings)[]).forEach((k) => {
        if (!NEVER_PERSIST.has(k)) safe[k] = next[k];
      });
      window.localStorage.setItem(key, JSON.stringify(safe));
    } catch {
      /* localStorage may be unavailable (private mode) - fail silently. */
    }
  }
  // Best-effort device-isolated sync to backend
  void syncSettingsToBackend(next).catch(() => {});
  return next;
}

/** Push device-specific settings to backend (persisted to settings.mobile.json or settings.desktop.json) */
async function syncSettingsToBackend(settings: AkariSettings): Promise<void> {
  try {
    const platform = getDevicePlatform();
    const apiBase = getApiBaseUrl();
    await fetch(`${apiBase}/api/settings?platform=${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, platform }),
    });
  } catch {
    /* Backend may be briefly unavailable during boot - non-fatal. */
  }
}
