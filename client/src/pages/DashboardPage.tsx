import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth-context";
import { PageLoader } from "@/components/PageLoader";
import { apiFetch } from "@/lib/api-fetch";
import type { CaseListItem } from "~lib/case-list";
import {
  caseNeedsWork,
  lastComboStartPath,
  needsDebrief,
  pickResumeTarget,
  readLastSessionStart,
  rememberSessionCombo,
  collapseOpenSessionDuplicates,
  uniqueOpenSessions,
  type LastSessionStart,
  type SessionBriefJson,
} from "@/lib/teacher-workbench";

type DepartmentSummary = {
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  casesTotal: number;
  sessionsWithTeacherGrade: number;
  sessionsWithAiAnalysis: number;
};

type AnalyticsPayload = {
  departments: DepartmentSummary[];
};

function lastComboLabel(
  last: LastSessionStart | null,
  cases: CaseListItem[],
  sessions: SessionBriefJson[],
) {
  if (!last?.caseId) return null;
  const caseTitle =
    cases.find((c) => c.id === last.caseId)?.title ??
    sessions.find((s) => s.caseId === last.caseId)?.case.title;
  const groupName =
    last.groupName?.trim() ||
    sessions.find((s) => s.studyGroupId === last.studyGroupId)?.studyGroup
      .name;
  if (!caseTitle || !groupName) return null;
  return `${caseTitle} · ${groupName}`;
}

function stageHint(s: SessionBriefJson) {
  const total = s.totalStages ?? 0;
  if (s.status === "IN_PROGRESS") {
    return total > 0
      ? `Этап ${s.currentStageOrder} из ${total}`
      : `Этап ${s.currentStageOrder}`;
  }
  return "Завершено";
}

export function DashboardPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionBriefJson[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [summary, setSummary] = useState<DepartmentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [sRes, cRes, aRes] = await Promise.all([
        apiFetch("/api/sessions"),
        apiFetch("/api/cases"),
        apiFetch("/api/analytics/departments"),
      ]);
      if (cancelled) return;
      if (!sRes.ok || !cRes.ok) {
        setError("Не удалось загрузить рабочий стол");
        setLoading(false);
        return;
      }
      const sj = (await sRes.json()) as { sessions: SessionBriefJson[] };
      const cj = (await cRes.json()) as { cases: CaseListItem[] };
      setSessions(collapseOpenSessionDuplicates(sj.sessions ?? []));
      setCases(cj.cases ?? []);
      if (aRes.ok) {
        const aj = (await aRes.json()) as AnalyticsPayload;
        const depts = aj.departments ?? [];
        if (depts.length === 1) {
          setSummary(depts[0] ?? null);
        } else if (depts.length > 1) {
          setSummary(
            depts.reduce(
              (acc, d) => ({
                sessionsTotal: acc.sessionsTotal + d.sessionsTotal,
                sessionsCompleted: acc.sessionsCompleted + d.sessionsCompleted,
                sessionsInProgress:
                  acc.sessionsInProgress + d.sessionsInProgress,
                casesTotal: acc.casesTotal + d.casesTotal,
                sessionsWithTeacherGrade:
                  acc.sessionsWithTeacherGrade + d.sessionsWithTeacherGrade,
                sessionsWithAiAnalysis:
                  acc.sessionsWithAiAnalysis + d.sessionsWithAiAnalysis,
              }),
              {
                sessionsTotal: 0,
                sessionsCompleted: 0,
                sessionsInProgress: 0,
                casesTotal: 0,
                sessionsWithTeacherGrade: 0,
                sessionsWithAiAnalysis: 0,
              },
            ),
          );
        }
      }
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const last = useMemo(() => readLastSessionStart(), [sessions]);
  const resume = useMemo(
    () => pickResumeTarget(sessions, last),
    [sessions, last],
  );
  const inProgress = useMemo(
    () => uniqueOpenSessions(sessions),
    [sessions],
  );
  const continueList = useMemo(
    () =>
      resume ? inProgress.filter((s) => s.id !== resume.id) : inProgress,
    [inProgress, resume],
  );
  const comboLabel = useMemo(
    () => lastComboLabel(last, cases, sessions),
    [last, cases, sessions],
  );
  const toDebrief = useMemo(
    () => sessions.filter(needsDebrief),
    [sessions],
  );
  const drafts = useMemo(
    () => cases.filter(caseNeedsWork),
    [cases],
  );
  const readyCases = useMemo(
    () => cases.filter((c) => (c.stageCount ?? 0) > 0),
    [cases],
  );

  if (!user) return null;

  const emptyDay =
    inProgress.length === 0 &&
    toDebrief.length === 0 &&
    drafts.length === 0 &&
    sessions.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="ui-kicker">
            {user.role === "ADMIN" ? "Администратор" : "Преподаватель"}
          </p>
          <h1 className="ui-title mt-2">
            Сегодня{user.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-2 max-w-[48ch] text-ink-soft">
            Продолжите занятие, разберите группу или допишите кейс.
          </p>
        </div>
        {resume ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Link
              to={`/sessions/${resume.id}`}
              className="ui-btn-primary w-full sm:w-auto"
              onClick={() => rememberSessionCombo(resume)}
            >
              Продолжить: {resume.case.title} · {resume.studyGroup.name}
            </Link>
            <Link
              to="/sessions/new"
              className="ui-chip w-full justify-center sm:w-auto"
            >
              Другое занятие
            </Link>
          </div>
        ) : comboLabel && last?.caseId ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Link
              to={lastComboStartPath(last)}
              className="ui-btn-primary w-full sm:w-auto"
            >
              Начать: {comboLabel}
            </Link>
            <Link
              to="/sessions/new"
              className="ui-chip w-full justify-center sm:w-auto"
            >
              Другое занятие
            </Link>
          </div>
        ) : (
          <Link to="/sessions/new" className="ui-btn-primary w-full sm:w-auto">
            Начать занятие
          </Link>
        )}
      </div>

      {error ? <p className="ui-alert-danger">{error}</p> : null}

      {loading ? (
        <PageLoader />
      ) : (
        <>
          {summary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ui-card p-4">
                <p className="ui-kicker">В процессе</p>
                <p className="mt-2 font-display text-2xl font-medium tabular-nums text-ink">
                  {summary.sessionsInProgress}
                </p>
              </div>
              <div className="ui-card p-4">
                <p className="ui-kicker">Ждут разбора</p>
                <p className="mt-2 font-display text-2xl font-medium tabular-nums text-ink">
                  {toDebrief.length}
                </p>
              </div>
              <Link
                to="/analytics"
                className="ui-card-hover p-4"
              >
                <p className="ui-kicker">По кафедре</p>
                <p className="mt-2 font-display text-2xl font-medium tabular-nums text-ink">
                  {summary.sessionsTotal}
                </p>
                <p className="mt-1 text-xs text-muted">занятий всего · открыть аналитику</p>
              </Link>
            </div>
          ) : null}

          {emptyDay ? (
            <div className="ui-empty space-y-4">
              {cases.length === 0 ? (
                <>
                  <p>Пока нет кейсов. Соберите первый сценарий — затем можно вести занятие с группой.</p>
                  <Link to="/cases/new" className="ui-btn-primary">
                    Создать кейс
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    Кейсы есть, занятий ещё не было. Выберите группу и начните разбор.
                  </p>
                  <Link to="/sessions/new" className="ui-btn-primary">
                    Начать первое занятие
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {continueList.length > 0 ? (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold tracking-tight text-ink">
                    Продолжить
                  </h2>
                  <ul className="space-y-2">
                    {continueList.map((s) => (
                      <li key={s.id}>
                        <Link
                          to={`/sessions/${s.id}`}
                          className="ui-card-hover flex items-center justify-between gap-3 px-3.5 py-3"
                          onClick={() => rememberSessionCombo(s)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold tracking-tight text-ink">
                              {s.case.title}
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">
                              {s.studyGroup.name} · {stageHint(s)}
                            </p>
                          </div>
                          <span className="ui-btn-primary pointer-events-none shrink-0">
                            Продолжить
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {toDebrief.length > 0 ? (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold tracking-tight text-ink">
                    Разобрать
                  </h2>
                  <ul className="space-y-2">
                    {toDebrief.map((s) => (
                      <li key={s.id}>
                        <Link
                          to={`/sessions/${s.id}`}
                          className="ui-card-hover flex items-center justify-between gap-3 px-3.5 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold tracking-tight text-ink">
                              {s.case.title}
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">
                              {s.studyGroup.name}
                              {!s.outcome?.aiAnalysis?.trim()
                                ? " · нет ИИ-анализа"
                                : " · нет оценки"}
                            </p>
                          </div>
                          <span className="ui-btn-mark pointer-events-none shrink-0">
                            Разобрать
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {drafts.length > 0 ? (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold tracking-tight text-ink">
                    Дописать кейс
                  </h2>
                  <ul className="space-y-2">
                    {drafts.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/cases/${c.id}/edit`}
                          className="ui-card-hover flex items-center justify-between gap-3 px-3.5 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold tracking-tight text-ink">
                              {c.title}
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">
                              {(c.stageCount ?? 0) === 0
                                ? "Нет этапов"
                                : "Нет эталона для разбора"}
                            </p>
                          </div>
                          <span className="ui-btn-secondary pointer-events-none shrink-0">
                            Открыть
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {readyCases.length > 0 && inProgress.length === 0 ? (
                <p className="text-sm text-muted">
                  Готовых кейсов: {readyCases.length}.{" "}
                  <Link to="/cases" className="text-brand-700 underline">
                    К списку
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
