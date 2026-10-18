/**
 * Real-time User Emotion & Sentiment Detection Engine for Akari AI.
 * Analyzes user speech semantics, tone, vocabulary, and acoustic speech properties.
 */

export type UserEmotion = 
  | "happy"
  | "excited"
  | "sad"
  | "stressed"
  | "tired"
  | "angry"
  | "curious"
  | "neutral";

export interface EmotionDetectionResult {
  emotion: UserEmotion;
  confidence: number;
  companionReaction: "idle" | "happy" | "thinking" | "talking" | "embarrassed" | "surprised" | "sad" | "flustered" | "playful" | "focused";
  empathyGuidance: string;
}

const EMOTION_PATTERNS: Array<{
  emotion: UserEmotion;
  regex: RegExp;
  companionReaction: EmotionDetectionResult["companionReaction"];
  empathyGuidance: string;
}> = [
  {
    emotion: "excited",
    regex: /\b(awesome|amazing|yay|woohoo|let's go|lets go|so cool|incredible|unbelievable|jackpot|success|won|nailed it|party|celebrate|super excited|great news)\b|!{2,}/i,
    companionReaction: "happy",
    empathyGuidance: "Match user's hype, celebrate together with enthusiastic energy and wide smiles!",
  },
  {
    emotion: "happy",
    regex: /\b(happy|glad|good|great|nice|love it|thank you|thanks|grateful|smiling|fun|cool|blessed|badiya|badhiya|maza|shukriya|dhanyawad)\b/i,
    companionReaction: "happy",
    empathyGuidance: "Respond with genuine warmth, joyful voice, and bright smile.",
  },
  {
    emotion: "tired",
    regex: /\b(tired|exhausted|sleepy|drained|burnout|fatigue|so done|need sleep|sleep|thak gaya|thak gayi|neend|sone ja raha|sone jaa rahi|resting)\b/i,
    companionReaction: "sad",
    empathyGuidance: "Speak softly, calmly, and gently. Remind the user to rest and take care of themselves.",
  },
  {
    emotion: "stressed",
    regex: /\b(stressed|stress|anxious|anxiety|worried|worry|overwhelmed|panic|deadline|pressure|too much work|problem|tension|pareshan|tension mat le)\b/i,
    companionReaction: "focused",
    empathyGuidance: "Be reassuring, grounded, and comforting. Break down tasks into simple steps to relieve pressure.",
  },
  {
    emotion: "angry",
    regex: /\b(angry|mad|furious|annoyed|irritated|hate this|stupid|worst|sucks|fail|broken|bakwas|gussa|dimag kharab)\b/i,
    companionReaction: "focused",
    empathyGuidance: "Stay calm, supportive, and patient. Avoid being overly playful; validate their frustration and offer practical solutions.",
  },
  {
    emotion: "sad",
    regex: /\b(sad|crying|unhappy|depressed|lonely|hurt|down|heartbroken|lost|feeling low|dukhi|udaas|rona|dard)\b/i,
    companionReaction: "sad",
    empathyGuidance: "Express heartfelt empathy and care. Remind them you are always in their corner.",
  },
  {
    emotion: "curious",
    regex: /\b(why|how does|what is|can you explain|curious|wondering|tell me about|how to|kya hai|kaise hota hai|kaise karein)\b|\?/i,
    companionReaction: "thinking",
    empathyGuidance: "Deliver a crisp, insightful, and knowledgeable answer immediately.",
  },
];

export function detectUserEmotion(text: string, audioEnergy = 0.5): EmotionDetectionResult {
  if (!text || !text.trim()) {
    return {
      emotion: "neutral",
      confidence: 0.5,
      companionReaction: "idle",
      empathyGuidance: "Maintain warm, attentive, and helpful demeanor.",
    };
  }

  const cleanText = text.trim();

  for (const pattern of EMOTION_PATTERNS) {
    if (pattern.regex.test(cleanText)) {
      // Calculate confidence boost if audio energy correlates
      let conf = 0.85;
      if (pattern.emotion === "excited" && audioEnergy > 0.6) conf = 0.95;
      if (pattern.emotion === "tired" && audioEnergy < 0.3) conf = 0.92;
      
      return {
        emotion: pattern.emotion,
        confidence: conf,
        companionReaction: pattern.companionReaction,
        empathyGuidance: pattern.empathyGuidance,
      };
    }
  }

  return {
    emotion: "neutral",
    confidence: 0.6,
    companionReaction: "idle",
    empathyGuidance: "Engage with positive, ready-to-help presence.",
  };
}
