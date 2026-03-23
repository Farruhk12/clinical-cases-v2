import { BlockView } from "@/components/block-view";
import { apiFetch, apiUrl } from "@/lib/api-fetch";
import { AiPreliminaryScoresPanel } from "@/components/ai-preliminary-scores-panel";
import { SessionAnalysisView } from "@/components/session-analysis-view";
import { preliminaryScoresFromOutcome } from "~lib/session-ai-scores";
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
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50/80"
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
        <div className="border-t border-slate-100 px-5 py-4">{children}</div>
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
  const [grade, setGrade] = useState("");
  const [comment, setComment] = useState("");
  const [leaderChoice, setLeaderChoice] = useState("");
  const lastLeaderId = useRef<string | null>(null);
  const analysisResultsRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      setError("Сессия недоступна");
      setLoading(false);
      return;
    }
    const j = (await res.json()) as SessionPayload;
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
    setLoading(false);
  }, [sessionId]);

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
    setError(null);
    try {
      if (!(await persistDraft())) return;
      const res = await apiFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Не удалось перейти далее");
        return;
      }
      await load();
    } finally {
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
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* ── Compact top bar ──────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <Link
            to="/sessions"
            className="flex items-center gap-2 text-sm text-slate-500 transition hover:text-teal-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Все сессии
          </Link>

          <div className="flex items-center gap-3">
            {!completed && (
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                Этап {currentOrder} из {totalStages}
              </span>
            )}
            {completed && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Завершена
              </span>
            )}
            {staff && (
              <a
                href={apiUrl(`/api/sessions/${sessionId}/export`)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Экспорт
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Error toast ──────────────────────────────────── */}
      {error && (
        <div className="mx-auto mt-4 w-full max-w-3xl px-6">
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        </div>
      )}

      {/* ── Main reading area ────────────────────────────── */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {/* Case title */}
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
            {data.session.case.title}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {data.session.studyGroup.name} · {data.session.studyGroup.faculty.name}
          </p>
        </div>

        {/* ── Stage content (the star of the show) ───────── */}
        <div className="space-y-12">
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
          <section className="mt-12 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm backdrop-blur-sm">
            {/* Hypotheses — compact tags */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Гипотезы</h3>
              {hypos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hypos.map((h, i) => (
                    <span
                      key={h.lineageId ?? `hypo-${i}`}
                      className="group inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs text-amber-900"
                    >
                      {editingHypoIdx === i ? (
                        <input
                          autoFocus
                          type="text"
                          className="w-40 border-none bg-transparent p-0 text-xs text-amber-900 outline-none"
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
                          className="max-w-[200px] truncate text-left"
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
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  className="h-8 flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-3 text-sm placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
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
                  className="h-8 shrink-0 rounded-full bg-amber-100 px-3 text-xs font-medium text-amber-900 transition hover:bg-amber-200"
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
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      className="h-8 flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-3 text-sm placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
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

            {/* Action buttons — single row */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void advance()}
                className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
              >
                Далее
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDraft()}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Сохранить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceComplete()}
                className="ml-auto rounded-full border border-red-200/70 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
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
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">Ведущий сессии</span>
                  <select
                    className="min-w-[220px] rounded-lg border border-slate-200 px-3 py-2"
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
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  Сохранить
                </button>
              </div>
            </Collapsible>
          )}

          {/* Session info */}
          <Collapsible title="Информация о сессии">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
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
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-60"
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
                    — ориентир; итог выставляете в поле ниже.
                  </p>
                ) : null}
                <div className="space-y-3">
                  <input
                    className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Оценка (текст или балл)"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  />
                  <textarea
                    className="min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Комментарий"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveOutcome()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
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
