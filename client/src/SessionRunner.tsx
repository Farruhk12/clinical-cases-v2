import { BlockView } from "@/components/block-view";
import { apiFetch, apiUrl } from "@/lib/api-fetch";
import { AiPreliminaryScoresPanel } from "@/components/ai-preliminary-scores-panel";
import { SessionAnalysisView } from "@/components/session-analysis-view";
import { preliminaryScoresFromOutcome } from "~lib/session-ai-scores";
import { parseScore100 } from "@/lib/score-100";
import type { BlockType, Role } from "~types/db";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

type ApiBlock = {
  id: string;
  blockType: BlockType;
  rawText: string | null;
  formattedContent: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
};

type ApiStage = {
  id: string;
  order: number;
  title: string;
  isFinalReveal: boolean;
  learningGoals: string | null;
  blocks: ApiBlock[];
};

type HypoRow = { id: string; text: string; lineageId: string };
type QuestionRow = { id: string; text: string; lineageId: string };

type TimelineRow = {
  stageOrder: number;
  stageTitle: string;
  submittedAt: string | null;
  openedAt: string | null;
  hypotheses: HypoRow[];
  questions: QuestionRow[];
};

type GroupMember = {
  id: string;
  name: string | null;
  login: string | null;
};

type SessionPayload = {
  session: {
    id: string;
    status: string;
    currentStageOrder: number;
    startedAt: string;
    completedAt: string | null;
    caseVersionSnapshot: number;
    case: { id: string; title: string; teacherKey?: string | null };
    studyGroup: {
      id: string;
      name: string;
      faculty: { name: string };
      courseLevel: { name: string };
    };
    leader: { id: string; name: string | null; login: string | null };
    outcome: {
      aiAnalysis: string | null;
      aiModel: string | null;
      aiPreliminaryScores?: unknown | null;
      teacherGrade: string | null;
      teacherComment: string | null;
      finalizedAt: string | null;
    } | null;
  };
  groupMembers: GroupMember[];
  canEditSessionSettings: boolean;
  currentStage: ApiStage | null;
  visibleStages: ApiStage[];
  draft: {
    submissionId: string;
    hypotheses: HypoRow[];
    questions: QuestionRow[];
  } | null;
  timeline: TimelineRow[];
  canEdit: boolean;
  analytics: {
    stageOrder: number;
    openedAt: string | null;
    submittedAt: string | null;
  }[];
};

/* ── Collapsible helper ─────────────────────────────────── */
function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50/80 sm:min-h-0 sm:px-5"
      >
        <span>{title}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function SessionRunner({
  sessionId,
  userId,
  role,
}: {
  sessionId: string;
  userId: string;
  role: Role;
}) {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hypos, setHypos] = useState<{ text: string; lineageId?: string }[]>(
    [],
  );
  const [newHypoInput, setNewHypoInput] = useState("");
  const [editingHypoIdx, setEditingHypoIdx] = useState<number | null>(null);
  const [questions, setQuestions] = useState<
    { text: string; lineageId?: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [grade, setGrade] = useState("");
  const [comment, setComment] = useState("");
  const [leaderChoice, setLeaderChoice] = useState("");
  const lastLeaderId = useRef<string | null>(null);
  const analysisResultsRef = useRef<HTMLDivElement | null>(null);

  const applyPayload = useCallback(
    (j: SessionPayload) => {
      setData(j);
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
    [],
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

  async function persistDraft(): Promise<boolean> {
    const res = await apiFetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveDraft",
        hypotheses: hypos.filter((h) => h.text.trim()),
        questions: questions.filter((q) => q.text.trim()),
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
    setHypos((prev) => [
      ...prev,
      { text: t, lineageId: crypto.randomUUID() },
    ]);
    setNewHypoInput("");
  }

  async function advance() {
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
        "Завершить сессию сейчас? Текущий этап будет сохранён, дальнейшие этапы недоступны.",
      )
    ) {
      return;
    }
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
        setError(j.error ?? "Не удалось завершить сессию");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Анализ не выполнен");
        return;
      }
      await load();
      requestAnimationFrame(() => {
        analysisResultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveOutcome() {
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

  if (loading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-slate-500">Загрузка сессии...</p>
      </div>
    );
  }

  const completed = data.session.status === "COMPLETED";
  const staff = role === "ADMIN" || role === "TEACHER";
  const preliminaryScores = preliminaryScoresFromOutcome(
    data.session.outcome ?? null,
  );

  const totalStages = data.visibleStages.length;
  const currentOrder = data.session.currentStageOrder;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* ── Compact top bar ──────────────────────────────── */}
      <header className="safe-area-t sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="safe-area-x mx-auto flex max-w-5xl flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <Link
            to="/sessions"
            className="flex min-h-10 shrink-0 items-center gap-2 text-sm text-slate-500 transition hover:text-teal-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Все сессии
          </Link>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
            {!completed && (
              <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">
                Этап {currentOrder} из {totalStages}
              </span>
            )}
            {completed && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                Завершена
              </span>
            )}
            {staff && (
              <a
                href={apiUrl(`/api/sessions/${sessionId}/export`)}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Экспорт
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Error toast ──────────────────────────────────── */}
      {error && (
        <div className="safe-area-x mx-auto mt-4 w-full max-w-3xl">
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        </div>
      )}

      {/* ── Main reading area ────────────────────────────── */}
      <main className="safe-area-x mx-auto w-full max-w-3xl flex-1 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:py-10">
        {/* Case title */}
        <div className="mb-8 text-center sm:mb-10">
          <h1 className="font-display text-2xl font-bold leading-snug text-slate-900 sm:text-3xl md:text-4xl">
            {data.session.case.title}
          </h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-slate-500">
            {data.session.studyGroup.name} · {data.session.studyGroup.faculty.name}
          </p>
        </div>

        {/* ── Stage content (the star of the show) ───────── */}
        <div className="space-y-8 sm:space-y-12">
          {data.visibleStages.map((st) => (
            <article key={st.id}>
              <h2 className="mb-6 border-b border-slate-200/60 pb-3 text-lg font-semibold text-slate-800">
                <span className="mr-2 text-teal-600">{st.order}.</span>
                {st.title}
              </h2>
              <div className="space-y-5">
                {st.blocks.map((b) => (
                  <BlockView
                    key={b.id}
                    blockType={b.blockType}
                    rawText={b.rawText}
                    formattedContent={b.formattedContent}
                    imageUrl={b.imageUrl}
                    imageAlt={b.imageAlt}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>

        {/* ── Draft: hypotheses + questions (active session) ── */}
        {!completed && data.draft && data.canEdit && (
          <section className="mt-8 rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm backdrop-blur-sm sm:mt-12 sm:p-5">
            {/* Hypotheses — compact tags */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Гипотезы</h3>
              {hypos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hypos.map((h, i) => (
                    <span
                      key={h.lineageId ?? `hypo-${i}`}
                      className="group inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
                    >
                      {editingHypoIdx === i ? (
                        <input
                          autoFocus
                          type="text"
                          className="min-w-0 flex-1 border-none bg-transparent p-0 text-xs text-amber-900 outline-none sm:w-40 sm:flex-none"
                          value={h.text}
                          onChange={(e) => {
                            const next = [...hypos];
                            next[i] = { ...next[i], text: e.target.value };
                            setHypos(next);
                          }}
                          onBlur={() => setEditingHypoIdx(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              e.preventDefault();
                              setEditingHypoIdx(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="max-w-full truncate text-left sm:max-w-[200px]"
                          onClick={() => setEditingHypoIdx(i)}
                          title={h.text}
                        >
                          {h.text || "..."}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ml-0.5 text-amber-600/60 transition hover:text-amber-900"
                        aria-label="Удалить"
                        onClick={() => {
                          setHypos(hypos.filter((_, j) => j !== i));
                          if (editingHypoIdx === i) setEditingHypoIdx(null);
                          else if (editingHypoIdx !== null && editingHypoIdx > i) {
                            setEditingHypoIdx(editingHypoIdx - 1);
                          }
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  className="h-10 min-h-10 w-full flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-3 text-base placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 sm:h-8 sm:min-h-0 sm:text-sm"
                  placeholder="Новая гипотеза... (Enter)"
                  value={newHypoInput}
                  onChange={(e) => setNewHypoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addHypoFromInput();
                    }
                  }}
                />
                <button
                  type="button"
                  className="h-10 shrink-0 rounded-full bg-amber-100 px-4 text-sm font-medium text-amber-900 transition hover:bg-amber-200 sm:h-8 sm:px-3 sm:text-xs"
                  onClick={() => addHypoFromInput()}
                >
                  +
                </button>
              </div>
            </div>

            {/* Questions — compact inputs */}
            <div className="mb-4 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700">Вопросы</h3>
              <div className="mt-2 space-y-1.5">
                {questions.map((q, i) => (
                  <div key={i} className="flex min-w-0 items-center gap-2">
                    <input
                      type="text"
                      className="h-10 min-h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-3 text-base placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 sm:h-8 sm:min-h-0 sm:text-sm"
                      placeholder="Вопрос..."
                      value={q.text}
                      onChange={(e) => {
                        const next = [...questions];
                        next[i] = { ...next[i], text: e.target.value };
                        setQuestions(next);
                      }}
                    />
                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-slate-400 transition hover:text-red-500"
                        onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-1.5 text-xs font-medium text-teal-600 transition hover:text-teal-800"
                onClick={() => setQuestions([...questions, { text: "" }])}
              >
                + ещё вопрос
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                disabled={busy}
                aria-busy={advancing}
                onClick={() => void advance()}
                className="order-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-100 sm:order-none sm:min-w-[9.5rem] sm:w-auto sm:min-h-0 sm:py-2"
              >
                {advancing ? (
                  <>
                    <span
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white"
                      aria-hidden
                    />
                    <span>Переход…</span>
                  </>
                ) : (
                  "Далее"
                )}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDraft()}
                className="order-2 min-h-11 w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:order-none sm:w-auto sm:min-h-0 sm:py-2"
              >
                Сохранить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceComplete()}
                className="order-3 min-h-11 w-full rounded-full border border-red-200/70 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60 sm:order-none sm:ml-auto sm:w-auto sm:min-h-0 sm:py-2"
              >
                Завершить
              </button>
            </div>
          </section>
        )}

        {/* ── Collapsible panels (secondary info) ────────── */}
        <div className="mt-14 space-y-3">
          {/* Session settings (leader change) */}
          {(data.canEditSessionSettings ?? false) && (
            <Collapsible title="Параметры сессии">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:min-w-[220px] sm:flex-none">
                  <span className="text-slate-600">Ведущий сессии</span>
                  <select
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-base sm:min-h-0 sm:min-w-[220px] sm:text-sm"
                    value={leaderChoice}
                    onChange={(e) => setLeaderChoice(e.target.value)}
                  >
                    {(data.groupMembers ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? m.login ?? m.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={
                    busy || leaderChoice === data.session.leader.id || !leaderChoice
                  }
                  onClick={() => void saveLeader()}
                  className="min-h-11 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50 sm:w-auto sm:min-h-0 sm:py-2"
                >
                  Сохранить
                </button>
              </div>
            </Collapsible>
          )}

          {/* Session info */}
          <Collapsible title="Информация о сессии">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <dt className="text-slate-500">Ведущий</dt>
              <dd className="font-medium text-slate-800">
                {data.session.leader.name ?? data.session.leader.login}
                {data.session.leader.id === userId && (
                  <span className="ml-2 rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-900">
                    вы
                  </span>
                )}
              </dd>
              <dt className="text-slate-500">Группа</dt>
              <dd className="text-slate-800">{data.session.studyGroup.name}</dd>
              <dt className="text-slate-500">Факультет</dt>
              <dd className="text-slate-800">{data.session.studyGroup.faculty.name}</dd>
              <dt className="text-slate-500">Курс</dt>
              <dd className="text-slate-800">{data.session.studyGroup.courseLevel.name}</dd>
              <dt className="text-slate-500">Начата</dt>
              <dd className="text-slate-800">
                {new Date(data.session.startedAt).toLocaleString("ru-RU")}
              </dd>
              <dt className="text-slate-500">Версия кейса</dt>
              <dd className="text-slate-800">{data.session.caseVersionSnapshot}</dd>
            </dl>
          </Collapsible>

          {/* Stage analytics */}
          {data.analytics.length > 0 && (
            <Collapsible title="Аналитика этапов">
              <ul className="space-y-1 text-sm text-slate-600">
                {data.analytics.map((a) => (
                  <li key={a.stageOrder}>
                    Этап {a.stageOrder}: открыт{" "}
                    {a.openedAt
                      ? new Date(a.openedAt).toLocaleString("ru-RU")
                      : "—"}
                    , сабмит{" "}
                    {a.submittedAt
                      ? new Date(a.submittedAt).toLocaleString("ru-RU")
                      : "—"}
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}
        </div>

        {/* ── Completed session: timeline + analysis ─────── */}
        {completed && (
          <div className="mt-14 space-y-6">
            <Collapsible title="Таймлайн гипотез и вопросов" defaultOpen>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2 pr-4">Этап</th>
                      <th className="py-2 pr-4">Гипотезы</th>
                      <th className="py-2">Вопросы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.timeline.map((row) => (
                      <tr
                        key={row.stageOrder}
                        className="border-b border-slate-100"
                      >
                        <td className="py-2 pr-4 align-top">
                          {row.stageOrder}. {row.stageTitle}
                        </td>
                        <td className="py-2 pr-4 align-top">
                          <ul className="list-disc pl-4">
                            {row.hypotheses.map((h) => (
                              <li key={h.id}>{h.text}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="py-2 align-top">
                          <ul className="list-disc pl-4">
                            {row.questions.map((q) => (
                              <li key={q.id}>{q.text}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAnalysis()}
                  className="min-h-11 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm text-white hover:bg-violet-700 disabled:opacity-60 sm:w-auto sm:min-h-0 sm:py-2"
                >
                  Сгенерировать ИИ-анализ
                </button>
              </div>
            </Collapsible>

            {(preliminaryScores || data.session.outcome?.aiAnalysis) && (
              <div
                ref={analysisResultsRef}
                className="scroll-mt-6 space-y-4"
              >
                {preliminaryScores ? (
                  <AiPreliminaryScoresPanel scores={preliminaryScores} />
                ) : null}
                {data.session.outcome?.aiAnalysis ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                    <SessionAnalysisView
                      content={data.session.outcome.aiAnalysis}
                      stageScores={preliminaryScores?.stageScores}
                      averageScore={preliminaryScores?.averageScore}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {staff && (
              <Collapsible title="Оценка преподавателя" defaultOpen>
                {preliminaryScores ? (
                  <p className="mb-3 text-xs text-slate-500">
                    Средняя предварительная оценка ИИ:{" "}
                    <span className="font-semibold text-slate-700">
                      {preliminaryScores.averageScore}/100
                    </span>{" "}
                    — ориентир; итог выставляете баллом 0–100 ниже.
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-slate-500">
                    Итоговая оценка группы — в баллах по шкале{" "}
                    <span className="font-semibold text-slate-700">0–100</span>{" "}
                    (как у ИИ).
                  </p>
                )}
                <div className="space-y-3">
                  {grade.trim() !== "" && parseScore100(grade) === null ? (
                    <>
                      <p className="text-xs text-amber-800">
                        Сохранена нечисловая оценка. Для формата как у ИИ укажите число
                        от 0 до 100 или замените значение.
                      </p>
                      <input
                        className="min-h-11 w-full max-w-xs rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-base sm:min-h-0 sm:text-sm"
                        placeholder="Например: 75"
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                      />
                    </>
                  ) : (
                    <label className="block max-w-xs space-y-1.5">
                      <span className="text-xs font-medium text-slate-600">
                        Балл (0–100)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-base tabular-nums sm:min-h-0 sm:text-sm"
                        placeholder="Например: 75"
                        value={
                          grade === ""
                            ? ""
                            : (parseScore100(grade) ?? "")
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setGrade("");
                            return;
                          }
                          const n = Number(v);
                          if (!Number.isFinite(n)) return;
                          setGrade(
                            String(Math.round(Math.min(100, Math.max(0, n)))),
                          );
                        }}
                      />
                    </label>
                  )}
                  <textarea
                    className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-base sm:text-sm"
                    placeholder="Комментарий"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveOutcome()}
                    className="min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto sm:min-h-0 sm:py-2"
                  >
                    Сохранить оценку и зафиксировать
                  </button>
                </div>
              </Collapsible>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
