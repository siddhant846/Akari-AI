export type PlanTier = "free" | "pro" | "creator" | "enterprise";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan: PlanTier;
  createdAt: string;
  voiceMinutesRemaining?: number;
  isSubscribed?: boolean;
}

export interface AuthSession {
  user: UserProfile | null;
  token?: string;
  provider: "firebase" | "clerk" | "local";
}

export interface AuthConfig {
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  clerkPublishableKey?: string;
}
