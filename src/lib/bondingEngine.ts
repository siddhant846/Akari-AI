export type RelationshipTier =
  | "Acquaintance"
  | "Helpful Assistant"
  | "Trusted Companion"
  | "Close Friend"
  | "Soulmate Wingman";

export type CompanionMood = "cheerful" | "focused" | "playful" | "sleepy" | "caring" | "blushing";

export interface BondingProfile {
  affectionScore: number;       // 0 - 100
  tier: RelationshipTier;
  currentMood: CompanionMood;
  totalConversations: number;
  totalMinutesSpent: number;
  lastInteractionDate: string;
  unlockedPerks: string[];
  favoriteTopic?: string;
}

const BONDING_STORAGE_KEY = "akari_emotional_bonding_profile";

export class BondingEngine {
  private static instance: BondingEngine;
  private profile: BondingProfile;

  private constructor() {
    this.profile = this.loadProfile();
  }

  public static getInstance(): BondingEngine {
    if (!BondingEngine.instance) {
      BondingEngine.instance = new BondingEngine();
    }
    return BondingEngine.instance;
  }

  private loadProfile(): BondingProfile {
    try {
      const stored = localStorage.getItem(BONDING_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[BondingEngine] Error loading stored profile:", e);
    }

    return {
      affectionScore: 25,
      tier: "Helpful Assistant",
      currentMood: "cheerful",
      totalConversations: 1,
      totalMinutesSpent: 5,
      lastInteractionDate: new Date().toISOString(),
      unlockedPerks: ["Custom Nicknames", "Live2D Eye Tracking"],
    };
  }

  private saveProfile(): void {
    try {
      localStorage.setItem(BONDING_STORAGE_KEY, JSON.stringify(this.profile));
    } catch (e) {
      console.warn("[BondingEngine] Error saving profile:", e);
    }
  }

  public getProfile(): BondingProfile {
    return this.profile;
  }

  private calculateTier(score: number): RelationshipTier {
    if (score >= 85) return "Soulmate Wingman";
    if (score >= 60) return "Close Friend";
    if (score >= 35) return "Trusted Companion";
    if (score >= 15) return "Helpful Assistant";
    return "Acquaintance";
  }

  public recordInteraction(durationMinutes: number = 1, positiveSentiment: boolean = true): BondingProfile {
    const gain = positiveSentiment ? Math.min(3.5, 1.2 + durationMinutes * 0.4) : 0.5;
    this.profile.affectionScore = Math.min(100, Math.round((this.profile.affectionScore + gain) * 10) / 10);
    this.profile.totalConversations += 1;
    this.profile.totalMinutesSpent += durationMinutes;
    this.profile.lastInteractionDate = new Date().toISOString();
    this.profile.tier = this.calculateTier(this.profile.affectionScore);

    // Dynamic mood adjustment
    if (this.profile.affectionScore > 75) {
      this.profile.currentMood = Math.random() > 0.4 ? "caring" : "blushing";
    } else if (this.profile.affectionScore > 50) {
      this.profile.currentMood = "playful";
    } else {
      this.profile.currentMood = "cheerful";
    }

    // Unlock special milestones
    if (this.profile.affectionScore >= 50 && !this.profile.unlockedPerks.includes("Special Blush Reaction")) {
      this.profile.unlockedPerks.push("Special Blush Reaction");
    }
    if (this.profile.affectionScore >= 80 && !this.profile.unlockedPerks.includes("Proactive Life Insights")) {
      this.profile.unlockedPerks.push("Proactive Life Insights");
    }

    this.saveProfile();
    return this.profile;
  }

  public setMood(mood: CompanionMood): void {
    this.profile.currentMood = mood;
    this.saveProfile();
  }
}

export const bondingEngine = BondingEngine.getInstance();
