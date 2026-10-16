import React, { useState } from "react";
import { X, Mail, Lock, User, Sparkles, Check, ShieldCheck, Zap, Crown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { PlanTier } from "../lib/authTypes";

export const AuthModal: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isAuthModalOpen,
    closeAuthModal,
    loginWithEmail,
    signupWithEmail,
    loginWithGoogle,
    logout,
    updatePlan,
  } = useAuth();

  const [mode, setMode] = useState<"login" | "signup" | "plans">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
      } else if (mode === "signup") {
        await signupWithEmail(email, name, password);
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err?.message || "Google Sign-In failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0d121f]/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Glow ambient decorations */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-5 right-5 p-2 text-white/50 hover:text-white rounded-full hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* User Profile View if Authenticated */}
        {isAuthenticated && user && mode !== "plans" ? (
          <div className="flex flex-col items-center text-center space-y-4 pt-2">
            <div className="relative">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="w-20 h-20 rounded-full border-2 border-indigo-400/50 object-cover shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-indigo-600 border border-white/20 text-[10px] font-bold uppercase tracking-wider text-white">
                {user.plan}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-white">{user.displayName}</h2>
              <p className="text-sm text-white/50">{user.email}</p>
            </div>

            {/* Plan Badge & Status */}
            <div className="w-full rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Subscription</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  user.plan === "pro" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-white/10 text-white/70"
                }`}>
                  {user.plan} Member
                </span>
              </div>
              <p className="text-xs text-white/60">
                Voice Quota: <span className="text-white font-semibold">{user.voiceMinutesRemaining} minutes remaining</span>
              </p>
            </div>

            <div className="flex flex-col w-full gap-2.5 pt-2">
              <button
                onClick={() => setMode("plans")}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-sm hover:opacity-95 shadow-lg shadow-indigo-500/25 transition"
              >
                <Crown className="w-4 h-4" /> Upgrade / Change Plan
              </button>

              <button
                onClick={logout}
                className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] border border-white/10 text-white/70 hover:text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30 text-sm transition font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : mode === "plans" ? (
          /* Subscription Plans View */
          <div className="space-y-4 pt-1">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" /> Choose Your Plan
              </h2>
              <p className="text-xs text-white/50 mt-1">Unlock unlimited real-time voice, custom avatars, and PowerPoint generator</p>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {/* Free Plan */}
              <div className={`p-4 rounded-2xl border transition ${
                user?.plan === "free" ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/[0.03]"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-white">Starter Free</h3>
                  <span className="text-sm font-bold text-white">$0 <span className="text-[10px] text-white/40">/mo</span></span>
                </div>
                <p className="text-xs text-white/50 mb-3">15 mins daily voice + core desktop tools</p>
                <button
                  onClick={() => { updatePlan("free"); closeAuthModal(); }}
                  className={`w-full py-2 rounded-xl text-xs font-semibold ${
                    user?.plan === "free" ? "bg-white/10 text-white/50 cursor-default" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {user?.plan === "free" ? "Current Plan" : "Select Free"}
                </button>
              </div>

              {/* Pro Plan */}
              <div className={`p-4 rounded-2xl border relative overflow-hidden transition ${
                user?.plan === "pro" ? "border-cyan-400 bg-cyan-950/30 ring-1 ring-cyan-400/50" : "border-indigo-500/40 bg-indigo-950/20"
              }`}>
                <div className="absolute top-0 right-0 px-3 py-0.5 bg-gradient-to-l from-cyan-500 to-indigo-500 text-[9px] font-bold text-white uppercase tracking-wider rounded-bl-lg">
                  Popular
                </div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-cyan-400" /> Akari Pro
                  </h3>
                  <span className="text-sm font-bold text-white">$15 <span className="text-[10px] text-white/40">/mo</span></span>
                </div>
                <ul className="text-xs text-white/70 space-y-1 my-2">
                  <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-400" /> Unlimited Real-Time Voice Chat</li>
                  <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-400" /> Akari & Jr. Sidd 6-Emotion Avatars</li>
                  <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-400" /> Autonomous PowerPoint Generator</li>
                  <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-400" /> Priority Gemini 3.1 Flash Latency</li>
                </ul>
                <button
                  onClick={() => { updatePlan("pro"); closeAuthModal(); }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-white font-bold text-xs hover:opacity-95 shadow-lg shadow-cyan-500/20 transition"
                >
                  {user?.plan === "pro" ? "Active Subscription" : "Upgrade to Pro ($15/mo)"}
                </button>
              </div>
            </div>

            <button
              onClick={() => setMode(isAuthenticated ? "login" : "login")}
              className="w-full text-center text-xs text-white/50 hover:text-white transition py-1"
            >
              Back to Profile
            </button>
          </div>
        ) : (
          /* Login & Sign Up Forms */
          <div className="space-y-4 pt-1">
            <div className="text-center">
              <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-white/10 mb-2">
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-white">
                {mode === "login" ? "Sign In to Akari AI" : "Create Your Account"}
              </h2>
              <p className="text-xs text-white/50 mt-1">
                {mode === "login" ? "Welcome back! Connect your voice assistant." : "Get started with 30 free minutes of voice AI."}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            {/* Google One-Click Login */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 transition shadow-md disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] text-white/40 uppercase tracking-wider">or with email</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="block text-[11px] font-medium text-white/60 mb-1">Your Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Siddhant"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400 transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-white/60 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-white/40" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="siddhant@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/60 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-white/40" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-sm hover:opacity-95 shadow-lg shadow-indigo-500/25 transition disabled:opacity-50"
              >
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-xs text-white/60 hover:text-white transition"
              >
                {mode === "login" ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
