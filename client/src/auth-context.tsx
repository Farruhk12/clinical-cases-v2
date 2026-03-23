import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api-fetch";

export type AuthUser = {
  id: string;
  login: string;
  name: string | null;
  role: "ADMIN" | "TEACHER";
  departmentId: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (
    login: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/auth/session");
    const text = await res.text();
    let j: { user: AuthUser | null } = { user: null };
    if (text) {
      try {
        j = JSON.parse(text) as { user: AuthUser | null };
      } catch {
        /* ignore */
      }
    }
    setUser(j.user ?? null);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(
    async (login: string, password: string) => {
      try {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (res.ok && !ct.includes("application/json")) {
          return {
            ok: false as const,
            error:
              "Ответ не от API (ожидался JSON). Проверьте деплой и переменные DATABASE_URL / AUTH_SECRET на Vercel.",
          };
        }
        if (!res.ok) {
          const raw = await res.text();
          let msg: string | undefined;
          if (raw) {
            try {
              const j = JSON.parse(raw) as { error?: string };
              msg = typeof j.error === "string" ? j.error : undefined;
            } catch {
              /* ignore */
            }
          }
          return {
            ok: false as const,
            error:
              msg ??
              (res.status === 502 || res.status === 503
                ? "API недоступен: проверьте npm run dev и порт API."
                : "Ошибка входа"),
          };
        }
        await refresh();
        return { ok: true as const };
      } catch {
        return {
          ok: false as const,
          error:
            "Нет ответа от API. Локально: npm run dev. На Vercel: в Project Settings задайте DATABASE_URL и AUTH_SECRET.",
        };
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, refresh, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
