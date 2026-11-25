"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { API, api } from "./api";

export type Account = {
  id: number;
  public_client_id: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  language: string;
  branch_id: number | null;
  is_blocked?: boolean;
};

type AuthValue = {
  user: Account | null;
  loading: boolean;
  badges: { orders: number; messages: number };
  setSession: (token: string, user: Account) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const listeners = new Set<(payload: { type?: string }) => void>();

export function subscribe(listener: (payload: { type?: string }) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState({ orders: 0, messages: 0 });

  const refresh = async () => {
    const data = await api<{ user: Account; badges: { orders: number; messages: number } }>("/api/auth/me");
    setUser(data.user);
    setBadges(data.badges);
    if (data.user.language === "tj" || data.user.language === "ru" || data.user.language === "en") {
      localStorage.setItem("safi_lang", data.user.language);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("safi_token");
    if (!saved) {
      setLoading(false);
      return;
    }
    refresh()
      .catch(() => {
        localStorage.removeItem("safi_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const current = localStorage.getItem("safi_token");
      if (!current || closed) return;
      const url = API.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(current)}`;
      socket = new WebSocket(url);
      socket.onopen = () => {
        failures = 0;
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          listeners.forEach((listener) => listener(payload));
          if (payload.type === "notification" || payload.type === "orders" || payload.type === "message") {
            api<{ badges: { orders: number; messages: number } }>("/api/auth/me")
              .then((data) => setBadges(data.badges))
              .catch(() => undefined);
          }
        } catch {
          /* ignore malformed socket payloads */
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        failures += 1;
        if (!closed && failures < 2) retry = setTimeout(connect, 4000);
      };
    };
    connect();
    const timer = setInterval(() => {
      api<{ badges: { orders: number; messages: number } }>("/api/auth/me")
        .then((data) => setBadges(data.badges))
        .catch(() => undefined);
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        listeners.forEach((listener) => listener({ type: "poll" }));
      }
    }, 15000);
    return () => {
      closed = true;
      clearInterval(timer);
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [user?.id]);

  const setSession = (nextToken: string, nextUser: Account) => {
    localStorage.setItem("safi_token", nextToken);
    setUser(nextUser);
  };

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* local session still ends */
    }
    localStorage.removeItem("safi_token");
    setUser(null);
    setBadges({ orders: 0, messages: 0 });
  };

  return (
    <AuthContext.Provider value={{ user, loading, badges, setSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("auth");
  return value;
}
