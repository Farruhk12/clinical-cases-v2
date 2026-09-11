import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { DraftItem, GuestIdeaJson, SessionPayload } from "./types";

/** Общий канал для синхронизации окна ведущего и окна проектора той же сессии. */
export function sessionBroadcastChannelName(sessionId: string): string {
  return `session-${sessionId}`;
}

/** Разовая отправка — без долгоживущего канала, которым нужно управлять через cleanup. */
function broadcastSessionUpdate(sessionId: string, payload: SessionPayload) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(sessionBroadcastChannelName(sessionId));
    ch.postMessage({ type: "session-updated", payload });
    ch.close();
  } catch {
    /* проектор не откроется мгновенно — не критично, есть фолбэк-polling */
  }
}

export function useSessionRunner(sessionId: string) {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hypos, setHypos] = useState<DraftItem[]>([]);
  const [newHypoInput, setNewHypoInput] = useState("");
  const [editingHypoIdx, setEditingHypoIdx] = useState<number | null>(null);
  const [questions, setQuestions] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Сохраняем…");
  const [grade, setGrade] = useState("");
  const [comment, setComment] = useState("");
  const [leaderChoice, setLeaderChoice] = useState("");
  const lastLeaderId = useRef<string | null>(null);

  const applyPayload = useCallback(
    (j: SessionPayload, opts?: { broadcast?: boolean }) => {
      setData({ ...j, guestIdeas: j.guestIdeas ?? [] });
      if (opts?.broadcast !== false) {
        broadcastSessionUpdate(sessionId, j);
      }
      if (j.draft) {
        const hs = j.draft.hypotheses.map((h) => ({
          text: h.text,
          lineageId: h.lineageId,
        }));
        const qs = j.draft.questions.map((q) => ({
          text: q.text,
          lineageId: q.lineageId,
        }));
        if (j.canEdit) {
          setHypos(hs);
          setQuestions(qs.length > 0 ? qs : [{ text: "" }]);
          setNewHypoInput("");
          setEditingHypoIdx(null);
        } else {
          setHypos(hs);
          setQuestions(qs);
        }
      }
      if (j.session.outcome) {
        setGrade(j.session.outcome.teacherGrade ?? "");
        setComment(j.session.outcome.teacherComment ?? "");
      }
      if (j.session.leader.id !== lastLeaderId.current) {
        lastLeaderId.current = j.session.leader.id;
        setLeaderChoice(j.session.leader.id);
      }
    },
    [sessionId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      setError("Сессия недоступна");
      setLoading(false);
      return;
    }
    const j = (await res.json()) as SessionPayload;
    applyPayload(j);
    setLoading(false);
  }, [sessionId, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  // Лёгкий polling для участников без права редактирования (не ведущий):
  // у них нет несохранённого черновика, который можно случайно затереть,
  // поэтому безопасно подтягивать прогресс ведущего в реальном времени.
  // Не трогаем данные того, кто сам сейчас редактирует (canEdit === true).
  const canEdit = data?.canEdit ?? true;
  const status = data?.session.status;
  useEffect(() => {
    if (canEdit) return;
    if (status !== "IN_PROGRESS") return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await apiFetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const j = (await res.json()) as SessionPayload;
      applyPayload(j);
    };
    const id = window.setInterval(() => void tick(), 6000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canEdit, status, sessionId, applyPayload]);

  useEffect(() => {
    if (!canEdit) return;
    if (status !== "IN_PROGRESS") return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await apiFetch(`/api/sessions/${sessionId}/guest-ideas`);
      if (!res.ok) return;
      const j = (await res.json()) as {
        ideas: GuestIdeaJson[];
        joinToken?: string;
      };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          guestIdeas: j.ideas,
          session: {
            ...prev.session,
            joinToken: j.joinToken ?? prev.session.joinToken,
          },
        };
      });
    };
    const id = window.setInterval(() => void tick(), 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canEdit, status, sessionId]);

  const keysRef = useRef({
    canEdit: false,
    status: "",
    busy: false,
    editingHypoIdx: null as number | null,
    addHypoFromInput: () => {},
    advance: async () => {},
  });

  useEffect(() => {
    function isTypingField(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (el as HTMLInputElement).type;
        return type !== "button" && type !== "submit" && type !== "checkbox" && type !== "radio";
      }
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      const live = keysRef.current;
      if (!live.canEdit || live.status !== "IN_PROGRESS" || live.busy) return;
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === "ArrowRight") {
        if (isTypingField(e.target)) return;
        if (live.editingHypoIdx !== null) return;
        e.preventDefault();
        void live.advance();
        return;
      }

      if (e.key !== "Enter") return;
      if (live.editingHypoIdx !== null) return;
      const target = e.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      if (target instanceof HTMLInputElement && target.dataset.role === "question") return;
      if (target instanceof HTMLInputElement && target.dataset.role === "hypo-edit") return;
      if (target instanceof HTMLInputElement && target.dataset.role === "hypothesis") return;

      e.preventDefault();
      const field = document.getElementById("session-hypo-input");
      if (field instanceof HTMLInputElement && !field.value.trim()) {
        field.focus();
        return;
      }
      live.addHypoFromInput();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function persistDraft(items?: {
    hypotheses: DraftItem[];
    questions: DraftItem[];
  }): Promise<boolean> {
    const hypotheses = (items?.hypotheses ?? hypos).filter((h) => h.text.trim());
    const qs = (items?.questions ?? questions).filter((q) => q.text.trim());
    const res = await apiFetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveDraft",
        hypotheses,
        questions: qs,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Не удалось сохранить");
      return false;
    }
    return true;
  }

  async function saveDraft() {
    setBusyLabel("Сохраняем…");
    setBusy(true);
    setError(null);
    try {
      if (await persistDraft()) await load();
    } finally {
      setBusy(false);
    }
  }

  function addHypoFromInput() {
    const t = newHypoInput.trim();
    if (!t) return;
    setHypos((prev) => [...prev, { text: t, lineageId: crypto.randomUUID() }]);
    setNewHypoInput("");
  }

  async function advance() {
    setBusyLabel("Переходим к следующему этапу…");
    setBusy(true);
    setAdvancing(true);
    setError(null);
    try {
      // Черновик + переход + загрузка следующего шага — один запрос
      const res = await apiFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance",
          hypotheses: hypos.filter((h) => h.text.trim()),
          questions: questions.filter((q) => q.text.trim()),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Не удалось перейти далее");
        return;
      }
      const j = (await res.json()) as SessionPayload;
      applyPayload(j);
    } finally {
      setAdvancing(false);
      setBusy(false);
    }
  }

  async function saveLeader() {
    if (!data || leaderChoice === data.session.leader.id) return;
    setBusyLabel("Меняем ведущего…");
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setLeader",
        leaderUserId: leaderChoice,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Не удалось сменить ведущего");
      return;
    }
    await load();
  }

  async function forceComplete() {
    if (
      !confirm(
        "Завершить занятие сейчас? Текущий этап будет сохранён, дальнейшие этапы недоступны.",
      )
    ) {
      return;
    }
    setBusyLabel("Завершаем занятие…");
    setBusy(true);
    setError(null);
    try {
      if (!(await persistDraft())) return;
      const res = await apiFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forceComplete" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Не удалось завершить занятие");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis(): Promise<boolean> {
    setBusyLabel("ИИ анализирует ход занятия…");
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Анализ не выполнен");
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  keysRef.current = {
    canEdit: Boolean(data?.canEdit),
    status: data?.session.status ?? "",
    busy,
    editingHypoIdx,
    addHypoFromInput,
    advance,
  };

  async function adoptGuestIdea(idea: GuestIdeaJson) {
    const text = idea.text.trim();
    if (!text) return;
    let nextHypos = hypos;
    let nextQuestions = questions;
    if (idea.kind === "HYPOTHESIS") {
      if (!hypos.some((h) => h.text.trim().toLowerCase() === text.toLowerCase())) {
        nextHypos = [...hypos, { text, lineageId: crypto.randomUUID() }];
        setHypos(nextHypos);
      }
    } else {
      const cleaned = questions.filter((q) => q.text.trim());
      if (!cleaned.some((q) => q.text.trim().toLowerCase() === text.toLowerCase())) {
        nextQuestions = [...cleaned, { text, lineageId: crypto.randomUUID() }];
        setQuestions(nextQuestions);
      }
    }
    setBusyLabel("Добавляем в список…");
    setBusy(true);
    setError(null);
    try {
      if (
        !(await persistDraft({
          hypotheses: nextHypos,
          questions: nextQuestions,
        }))
      ) {
        return;
      }
      await apiFetch(`/api/sessions/${sessionId}/guest-ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "take" }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveOutcome() {
    setBusyLabel("Сохраняем оценку…");
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/sessions/${sessionId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherGrade: grade || undefined,
        teacherComment: comment || undefined,
        finalize: true,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Не удалось сохранить оценку");
      return;
    }
    await load();
  }

  return {
    data,
    error,
    loading,
    busy,
    busyLabel,
    advancing,
    hypos,
    setHypos,
    newHypoInput,
    setNewHypoInput,
    editingHypoIdx,
    setEditingHypoIdx,
    questions,
    setQuestions,
    grade,
    setGrade,
    comment,
    setComment,
    leaderChoice,
    setLeaderChoice,
    addHypoFromInput,
    saveDraft,
    advance,
    saveLeader,
    forceComplete,
    runAnalysis,
    saveOutcome,
    adoptGuestIdea,
  };
}

export type SessionRunnerState = ReturnType<typeof useSessionRunner>;
