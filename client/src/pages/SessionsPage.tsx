import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import {
  collapseOpenSessionDuplicates,
  debriefLabel,
  isGraded,
  isInProgress,
  needsDebrief,
  sessionActionClass,
  sessionActionLabel,
  type SessionBriefJson,
} from "@/lib/teacher-workbench";

type TabId = "all" | "in_progress" | "debrief" | "graded";

const tabs: { id: TabId; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "in_progress", label: "В процессе" },
  { id: "debrief", label: "Ждут разбора" },
  { id: "graded", label: "Оценены" },
];

function matchesTab(s: SessionBriefJson, tab: TabId) {
  if (tab === "all") return true;
  if (tab === "in_progress") return isInProgress(s);
  if (tab === "debrief") return needsDebrief(s);
  return isGraded(s);
}

function stageLine(s: SessionBriefJson) {
  if (isInProgress(s)) {
    const total = s.totalStages ?? 0;
    return total > 0
      ? `Этап ${s.currentStageOrder} из ${total}`
      : `Этап ${s.currentStageOrder}`;
  }
  return "Завершено";
}

export function SessionsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdFilter = searchParams.get("caseId") ?? undefined;
  const groupIdFilter = searchParams.get("groupId") ?? undefined;
  const tabParam = searchParams.get("tab");
  const tab: TabId =
    tabParam === "in_progress" || tabParam === "debrief" || tabParam === "graded"
      ? tabParam
      : "all";
  const [sessions, setSessions] = useState<SessionBriefJson[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const q = caseIdFilter
        ? `?caseId=${encodeURIComponent(caseIdFilter)}`
        : "";
      const res = await apiFetch(`/api/sessions${q}`);
      if (!res.ok) {
        if (!cancelled) {
          setError("Не удалось загрузить занятия");
          setLoading(false);
        }
        return;
      }
      const j = (await res.json()) as { sessions: SessionBriefJson[] };
      if (!cancelled) {
        setSessions(collapseOpenSessionDuplicates(j.sessions));
        setError(null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseIdFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (groupIdFilter && s.studyGroupId !== groupIdFilter) return false;
      if (!matchesTab(s, tab)) return false;
      if (!q) return true;
      const hay = `${s.case.title} ${s.studyGroup.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, query, tab, groupIdFilter]);
  const stats = useMemo(
    () => ({
      inProgress: sessions.filter(isInProgress).length,
      debrief: sessions.filter(needsDebrief).length,
      graded: sessions.filter(isGraded).length,
      total: sessions.length,
    }),
    [sessions],
  );

  function setTab(next: TabId) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "all") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  }

  if (!user) return null;

  const newHref = caseIdFilter
    ? `/sessions/new?caseId=${encodeURIComponent(caseIdFilter)}`
    : "/sessions/new";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="ui-title">Занятия</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {stats.total > 0
              ? `${stats.inProgress} в процессе · ${stats.debrief} ждут разбора`
              : "Прохождения кейсов с группой"}
            {caseIdFilter ? (
              <span className="mt-1 block text-sm text-brand-700">
                Только занятия этого кейса.{" "}
                <Link to="/sessions" className="underline">
                  Показать все
                </Link>
              </span>
            ) : null}
            {groupIdFilter ? (
              <span className="mt-1 block text-sm text-brand-700">
                Фильтр по учебной группе.{" "}
                <Link to="/sessions" className="underline">
                  Сбросить
                </Link>
              </span>
            ) : null}
          </p>
        </div>
        <Link to={newHref} className="ui-btn-primary w-full sm:w-auto">
          Новое занятие
        </Link>
      </div>

      {error ? <p className="ui-alert-danger">{error}</p> : null}

      <section className="ui-card overflow-hidden">
        <div className="border-b border-line p-3">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={tab === t.id ? "ui-chip-on" : "ui-chip"}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="sr-only">Поиск по кейсу или группе</span>
            <input
              className="ui-input ui-input-search bg-surface"
              placeholder="Поиск по названию"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div>
          {loading ? (
            <PageLoader />
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((s) => {
                const mark = debriefLabel(s);
                return (
                  <li key={s.id}>
                    <Link
                      to={`/sessions/${s.id}`}
                      className="group flex items-start gap-2.5 bg-elevated px-3.5 py-2.5 transition hover:bg-surface"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          isInProgress(s)
                            ? "bg-[var(--color-action)]"
                            : needsDebrief(s)
                              ? "bg-[var(--color-mark)]"
                              : isGraded(s)
                                ? "bg-[var(--color-gilt)]"
                                : "bg-[var(--color-border-strong)]"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold tracking-tight text-ink">
                          {s.case.title}
                        </p>
                        <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">
                          {s.studyGroup.name} · {s.studyGroup.faculty.name}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                          <span
                            className={`ui-badge ${
                              isInProgress(s)
                                ? "bg-brand-50 text-brand-800"
                                : "bg-surface text-ink-soft"
                            }`}
                          >
                            {stageLine(s)}
                          </span>
                          {s.status === "COMPLETED" &&
                          mark &&
                          mark !== "Готово" ? (
                            <span className="ui-badge bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                              {mark}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <span
                        className={`${sessionActionClass(s)} pointer-events-none mt-0.5 shrink-0`}
                      >
                        {sessionActionLabel(s)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!loading && !error && filtered.length === 0 ? (
          <div className="p-4">
            <div className="ui-empty space-y-4 px-4 py-12">
              <p>
                {sessions.length === 0
                  ? caseIdFilter
                    ? "По этому кейсу ещё нет занятий."
                    : "Занятий пока нет."
                  : "Нет занятий по этому фильтру."}
              </p>
              {sessions.length === 0 ? (
                <Link to={newHref} className="ui-btn-primary">
                  Начать занятие
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
