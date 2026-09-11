import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { sessionBroadcastChannelName } from "./useSessionRunner";
import type { SessionPayload } from "./types";

/**
 * Read-only данные для окна проектора: та же сессия, без формы ввода/мутаций.
 * Обновляется мгновенно через BroadcastChannel при действиях в окне ведущего
 * (тот же браузер, см. useSessionRunner.applyPayload), с фолбэком на polling —
 * на случай второго проектора/устройства без общего BroadcastChannel.
 */
export function usePresentationData(sessionId: string) {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch(`/api/sessions/${sessionId}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Сессия недоступна");
        setLoading(false);
        return;
      }
      const j = (await res.json()) as SessionPayload;
      setData(j);
      setLoading(false);
    }
    void load();

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(sessionBroadcastChannelName(sessionId))
        : null;
    channel?.addEventListener("message", (e) => {
      if (e.data?.type === "session-updated") {
        setData(e.data.payload as SessionPayload);
        setLoading(false);
      }
    });

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8000);

    return () => {
      cancelled = true;
      channel?.close();
      window.clearInterval(pollId);
    };
  }, [sessionId]);

  return { data, error, loading };
}
