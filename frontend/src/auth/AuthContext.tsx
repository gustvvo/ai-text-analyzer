import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { login as apiLogin, me as apiMe, register as apiRegister, setAuthToken, setUnauthorizedHandler } from "../api/client";
import type { AuthUser } from "../api/types";

// Token lives in localStorage for simplicity, which means it's readable by
// any script running on the page (XSS risk). The production-grade
// alternative is an httpOnly, secure cookie set by the backend — it trades
// a bit of complexity (CSRF handling) for immunity to token theft via
// injected JS. Acceptable trade-off for this assessment's scope.
const TOKEN_KEY = "ai-text-analyzer:token";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const applySession = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(authUser);
    setStatus("authenticated");
  }, []);

  // Bootstrap: if a token is already stored (e.g. page reload), validate it
  // against /auth/me instead of trusting it blindly.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setStatus("anonymous");
      return;
    }
    setAuthToken(stored);
    apiMe()
      .then((res) => {
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch(() => {
        clearSession();
      });
  }, [clearSession]);

  // Any authenticated request that comes back 401 means the token is
  // stale/invalid server-side — drop the session and send the user to
  // /login, regardless of which page triggered it.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      navigate("/login", { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      applySession(res.token, res.user);
    },
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await apiRegister(email, password);
      applySession(res.token, res.user);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
