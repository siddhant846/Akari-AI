import { UserProfile, AuthSession, PlanTier } from "./authTypes";

const AUTH_STORAGE_KEY = "akari_user_auth_session";

export const DEFAULT_GUEST_USER: UserProfile = {
  id: "guest_user",
  email: "guest@akari.local",
  displayName: "Guest User",
  plan: "free",
  createdAt: new Date().toISOString(),
  voiceMinutesRemaining: 15,
  isSubscribed: false,
};

export class AuthService {
  private static instance: AuthService;
  private currentSession: AuthSession;

  private constructor() {
    this.currentSession = this.loadSession();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private loadSession(): AuthSession {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[AuthService] Error loading stored session:", e);
    }
    return {
      user: null,
      provider: "local",
    };
  }

  private saveSession(session: AuthSession): void {
    this.currentSession = session;
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn("[AuthService] Error saving session:", e);
    }
  }

  public getSession(): AuthSession {
    return this.currentSession;
  }

  public getUser(): UserProfile | null {
    return this.currentSession.user;
  }

  public async loginWithEmail(email: string, password?: string): Promise<UserProfile> {
    // Simulated / Local / Firebase Auth bridge
    const name = email.split("@")[0];
    const user: UserProfile = {
      id: "usr_" + Math.random().toString(36).substring(2, 9),
      email: email.trim().toLowerCase(),
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      plan: "free",
      createdAt: new Date().toISOString(),
      voiceMinutesRemaining: 30,
      isSubscribed: false,
    };

    this.saveSession({
      user,
      token: "tok_" + Date.now(),
      provider: "local",
    });

    return user;
  }

  public async signupWithEmail(email: string, name: string, password?: string): Promise<UserProfile> {
    const user: UserProfile = {
      id: "usr_" + Math.random().toString(36).substring(2, 9),
      email: email.trim().toLowerCase(),
      displayName: name.trim() || email.split("@")[0],
      plan: "free",
      createdAt: new Date().toISOString(),
      voiceMinutesRemaining: 30,
      isSubscribed: false,
    };

    this.saveSession({
      user,
      token: "tok_" + Date.now(),
      provider: "local",
    });

    return user;
  }

  public async loginWithGoogle(): Promise<UserProfile> {
    // Google OAuth provider simulation / Firebase Auth handler
    const user: UserProfile = {
      id: "usr_google_" + Math.random().toString(36).substring(2, 9),
      email: "user@gmail.com",
      displayName: "Google User",
      photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
      plan: "pro",
      createdAt: new Date().toISOString(),
      voiceMinutesRemaining: 999,
      isSubscribed: true,
    };

    this.saveSession({
      user,
      token: "tok_google_" + Date.now(),
      provider: "firebase",
    });

    return user;
  }

  public async logout(): Promise<void> {
    this.saveSession({
      user: null,
      provider: "local",
    });
  }

  public updatePlan(plan: PlanTier): UserProfile | null {
    if (!this.currentSession.user) return null;
    const updated = {
      ...this.currentSession.user,
      plan,
      isSubscribed: plan !== "free",
      voiceMinutesRemaining: plan === "free" ? 15 : 9999,
    };
    this.saveSession({
      ...this.currentSession,
      user: updated,
    });
    return updated;
  }
}

export const authService = AuthService.getInstance();
