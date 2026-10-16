import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { UserProfile, PlanTier } from "../lib/authTypes";
import { authService, DEFAULT_GUEST_USER } from "../lib/authService";

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithEmail: (email: string, password?: string) => Promise<UserProfile>;
  signupWithEmail: (email: string, name: string, password?: string) => Promise<UserProfile>;
  loginWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  updatePlan: (plan: PlanTier) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const session = authService.getSession();
    if (session.user) {
      setUser(session.user);
    } else {
      // Default to guest session so user can use basic features immediately
      setUser(DEFAULT_GUEST_USER);
    }
    setIsLoading(false);
  }, []);

  const loginWithEmail = async (email: string, password?: string) => {
    const loggedInUser = await authService.loginWithEmail(email, password);
    setUser(loggedInUser);
    setIsAuthModalOpen(false);
    return loggedInUser;
  };

  const signupWithEmail = async (email: string, name: string, password?: string) => {
    const newUser = await authService.signupWithEmail(email, name, password);
    setUser(newUser);
    setIsAuthModalOpen(false);
    return newUser;
  };

  const loginWithGoogle = async () => {
    const googleUser = await authService.loginWithGoogle();
    setUser(googleUser);
    setIsAuthModalOpen(false);
    return googleUser;
  };

  const logout = async () => {
    await authService.logout();
    setUser(DEFAULT_GUEST_USER);
  };

  const updatePlan = (plan: PlanTier) => {
    const updated = authService.updatePlan(plan);
    if (updated) setUser(updated);
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user && user.id !== "guest_user"),
        isLoading,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        logout,
        updatePlan,
        openAuthModal,
        closeAuthModal,
        isAuthModalOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
