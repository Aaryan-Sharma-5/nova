/* eslint-disable react-refresh/only-export-components */
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loginApi, logoutApi, meApi, oauthExchangeApi, registerApi } from "@/lib/api";
import { AuthUser, RegisterPayload, UserRole } from "@/types/auth";
import { supabase } from "@/lib/supabaseClient";

const AUTH_STORAGE_KEY = "nova.auth.token";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeGoogleSignIn: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const bootstrapSession = useCallback(async (incomingToken: string) => {
    const me = await meApi(incomingToken);
    setUser(me);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        await bootstrapSession(token);
      } catch {
        if (isMounted) {
          clearSession();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, [bootstrapSession, clearSession, token]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const auth = await loginApi(email, password);
      localStorage.setItem(AUTH_STORAGE_KEY, auth.access_token);
      setToken(auth.access_token);
      await bootstrapSession(auth.access_token);
    } catch (error) {
      clearSession();
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapSession, clearSession]);

  const register = useCallback(async (payload: RegisterPayload) => {
    await registerApi(payload);
    await login(payload.email, payload.password);
  }, [login]);

  const signInWithGoogle = useCallback(async () => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      throw new Error("Google sign-in is not configured. Missing Supabase environment variables.");
    }

    const redirectTo = `${window.location.origin}/login?oauth=google`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const completeGoogleSignIn = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        throw new Error(error?.message || "Google session not found. Please try again.");
      }

      const auth = await oauthExchangeApi(data.session.access_token, "google");
      localStorage.setItem(AUTH_STORAGE_KEY, auth.access_token);
      setToken(auth.access_token);
      await bootstrapSession(auth.access_token);
    } catch (error) {
      clearSession();
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapSession, clearSession]);

  const logout = useCallback(async () => {
    const existingToken = token;
    clearSession();

    if (existingToken) {
      try {
        await logoutApi(existingToken);
      } catch {
        // Session is already removed client-side.
      }
    }
  }, [clearSession, token]);

  const hasRole = useCallback((roles: UserRole[]) => {
    if (!user) {
      return false;
    }
    return roles.includes(user.role);
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    isLoading,
    isAuthenticated: Boolean(user && token),
    login,
    signInWithGoogle,
    completeGoogleSignIn,
    register,
    logout,
    hasRole,
  }), [user, token, isLoading, login, signInWithGoogle, completeGoogleSignIn, register, logout, hasRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
