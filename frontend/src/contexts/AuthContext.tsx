/* eslint-disable react-refresh/only-export-components */
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, loginApi, logoutApi, meApi, oauthExchangeApi, registerApi } from "@/lib/api";
import { AuthUser, RegisterPayload, UserRole } from "@/types/auth";
import { supabase } from "@/lib/supabaseClient";

const LEGACY_AUTH_STORAGE_KEY = "nova.auth.token";
const AUTH_STORAGE_SCOPE = (API_BASE_URL || "same-origin").replace(/[^a-zA-Z0-9]+/g, "_");
const AUTH_STORAGE_KEY = `nova.auth.token.${AUTH_STORAGE_SCOPE}`;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return true;
  }

  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowEpochSeconds + 15;
}

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
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
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

      if (isTokenExpired(token)) {
        if (isMounted) {
          clearSession();
          setIsLoading(false);
        }
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
      localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
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
    if (!supabase || !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
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
    if (!supabase) {
      throw new Error("Google sign-in is not configured. Missing Supabase environment variables.");
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        throw new Error(error?.message || "Google session not found. Please try again.");
      }

      const auth = await oauthExchangeApi(data.session.access_token, "google");
      localStorage.setItem(AUTH_STORAGE_KEY, auth.access_token);
      localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
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
