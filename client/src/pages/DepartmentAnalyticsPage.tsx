import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";

type DepartmentSummary = {
  departmentId: string;
  departmentName: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  uniqueStudyGroups: number;
  casesTotal: number;
  sessionsWithOutcome: number;
  sessionsWithTeacherGrade: number;
  sessionsWithAiAnalysis: number;
};

type StudyGroupStats = {
  studyGroupId: string;
  studyGroupName: string;
  facultyName: string;
  courseLevelName: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  avgAiScore?: number | null;
  sessionsWithAiScore?: number | null;
  avgTeacherScore?: number | null;
  sessionsWithTeacherNumericScore?: number | null;
  teacherGradesSummary?: string | null;
  teacherEvaluationsText?: string | null;
};

type CaseStats = {
  caseId: string;
  caseTitle: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  avgAiScore?: number | null;
  sessionsWithAiScore?: number | null;
  avgTeacherScore?: number | null;
  sessionsWithTeacherNumericScore?: number | null;
  teacherGradesSummary?: string | null;
  teacherEvaluationsText?: string | null;
};

type AnalyticsPayload = {
  scope: "all" | "department";
  departments: DepartmentSummary[];
  byStudyGroup: StudyGroupStats[];
  byCase: CaseStats[];
};

function AiScoreCell({
  avg,
  count,
}: {
  avg: number | null | undefined;
  count: number | null | undefined;
}) {
  const n = Number(count) || 0;
  const a = avg != null && !Number.isNaN(Number(avg)) ? Math.round(Number(avg)) : null;
  return (
    <div className="text-right">
      <span className="tabular-nums font-medium text-violet-800">
        {a != null ? `${a}/100` : "—"}
      </span>
      {n > 0 ? (
        <p className="mt-0.5 text-[0.65rem] leading-tight text-slate-500">
          {n} сесс. с баллом ИИ
        </p>
      ) : null}
    </div>
  );
}

function TeacherScoreCell({
  avg,
  count,
}: {
  avg: number | null | undefined;
  count: number | null | undefined;
}) {
  const n = Number(count) || 0;
  const a = avg != null && !Number.isNaN(Number(avg)) ? Math.round(Number(avg)) : null;
  return (
    <div className="text-right">
      <span className="tabular-nums font-medium text-teal-800">
        {a != null ? `${a}/100` : "—"}
      </span>
      {n > 0 ? (
        <p className="mt-0.5 text-[0.65rem] leading-tight text-slate-500">
          {n} с оценкой преподавателя
        </p>
      ) : null}
    </div>
  );
}

function TeacherFeedbackCell({
  text,
}: {
  text: string | null | undefined;
}) {
  const t = (text?.trim() || "") || "";
  if (!t) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <div className="min-w-[11rem] max-w-[min(28rem,85vw)]">
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
        {t}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-card backdrop-blur-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function DepartmentAnalyticsPage() {
  const { user } = useAuth();
  const [allDepartments, setAllDepartments] = useState<DepartmentSummary[]>([]);
  const [detailSummary, setDetailSummary] = useState<DepartmentSummary | null>(
    null,
  );
  const [byStudyGroup, setByStudyGroup] = useState<StudyGroupStats[]>([]);
  const [byCase, setByCase] = useState<CaseStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState("");

  const isAdmin = user?.role === "ADMIN";

  const fetchPayload = useCallback(async (departmentId?: string) => {
    const q = departmentId
      ? `?departmentId=${encodeURIComponent(departmentId)}`
      : "";
    const res = await apiFetch(`/api/analytics/departments${q}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(
        typeof j.error === "string" ? j.error : "Не удалось загрузить",
      );
    }
    return (await res.json()) as AnalyticsPayload;
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    setLoadingOverview(true);
    setError(null);
    void fetchPayload()
      .then((p) => {
        if (cancelled) return;
        setAllDepartments(p.departments);
        setLoadingOverview(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка");
        setLoadingOverview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, fetchPayload]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    if (!selectedDeptId) {
      setDetailSummary(null);
      setByStudyGroup([]);
      setByCase([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void fetchPayload(selectedDeptId)
      .then((p) => {
        if (cancelled) return;
        setDetailSummary(p.departments[0] ?? null);
        setByStudyGroup(p.byStudyGroup);
        setByCase(p.byCase);
        setLoadingDetail(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка");
        setDetailSummary(null);
        setByStudyGroup([]);
        setByCase([]);
        setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, selectedDeptId, fetchPayload]);

  useEffect(() => {
    if (!user || user.role !== "TEACHER") return;
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void fetchPayload()
      .then((p) => {
        if (cancelled) return;
        setDetailSummary(p.departments[0] ?? null);
        setByStudyGroup(p.byStudyGroup);
        setByCase(p.byCase);
        setLoadingDetail(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка");
        setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, fetchPayload]);

  if (!user) return null;

  const showDetail =
    user.role === "TEACHER" ? Boolean(detailSummary) : Boolean(selectedDeptId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Аналитика
          </h1>
          <p className="mt-1 max-w-2xl text-pretty text-sm text-slate-500 sm:text-base">
            Сводка сессий, учебных групп и кейсов. Преподаватель видит данные своей
            кафедры; администратор — все кафедры и детализацию по выбранной.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-col gap-1 sm:min-w-[16rem]">
            <label className="text-xs font-medium text-slate-600">
              Детализация по кафедре
            </label>
            <select
              className="rounded-xl border border-mist-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200/50"
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              disabled={loadingOverview && allDepartments.length === 0}
            >
              <option value="">Только сводная таблица</option>
              {allDepartments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.departmentName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isAdmin && loadingOverview && allDepartments.length === 0 ? (
        <p className="text-slate-500">Загрузка сводки…</p>
      ) : isAdmin && allDepartments.length > 0 && !selectedDeptId ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/90 shadow-card backdrop-blur-sm">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Кафедра</th>
                  <th className="px-4 py-3 text-right">Кейсов</th>
                  <th className="px-4 py-3 text-right">Сессий</th>
                  <th className="px-4 py-3 text-right">Завершено</th>
                  <th className="px-4 py-3 text-right">В процессе</th>
                  <th className="px-4 py-3 text-right">Групп</th>
                  <th className="px-4 py-3 text-right">С оценкой</th>
                  <th className="px-4 py-3 text-right">ИИ-разбор</th>
                </tr>
              </thead>
              <tbody>
                {allDepartments.map((d) => (
                  <tr
                    key={d.departmentId}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.departmentName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {d.casesTotal}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {d.sessionsTotal}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-teal-700">
                      {d.sessionsCompleted}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                      {d.sessionsInProgress}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {d.uniqueStudyGroups}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {d.sessionsWithTeacherGrade}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {d.sessionsWithAiAnalysis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-500">
            Выберите кафедру в списке выше, чтобы открыть разрез по учебным группам и
            кейсам.
          </p>
        </>
      ) : null}

      {showDetail && loadingDetail ? (
        <p className="text-slate-500">Загрузка детализации…</p>
      ) : showDetail && detailSummary ? (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {detailSummary.departmentName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Результаты работы групп по кейсам кафедры
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Всего сессий" value={detailSummary.sessionsTotal} />
            <StatCard
              label="Завершено"
              value={detailSummary.sessionsCompleted}
              sub="полное прохождение"
            />
            <StatCard
              label="В процессе"
              value={detailSummary.sessionsInProgress}
            />
            <StatCard
              label="Учебных групп"
              value={detailSummary.uniqueStudyGroups}
              sub="с сессиями по кейсам кафедры"
            />
            <StatCard label="Кейсов" value={detailSummary.casesTotal} />
            <StatCard
              label="С итогом (outcome)"
              value={detailSummary.sessionsWithOutcome}
            />
            <StatCard
              label="С оценкой преподавателя"
              value={detailSummary.sessionsWithTeacherGrade}
            />
            <StatCard
              label="С ИИ-анализом"
              value={detailSummary.sessionsWithAiAnalysis}
            />
          </div>

          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-slate-900">
              По учебным группам
            </h3>
            {byStudyGroup.length === 0 ? (
              <p className="text-sm text-slate-500">Пока нет сессий по группам.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/90 shadow-card backdrop-blur-sm">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Группа</th>
                      <th className="px-4 py-3">Факультет</th>
                      <th className="px-4 py-3">Курс</th>
                      <th className="px-4 py-3 text-right">Сессий</th>
                      <th className="px-4 py-3 text-right">Завершено</th>
                      <th className="px-4 py-3 text-right">В процессе</th>
                      <th className="px-4 py-3 text-right">ИИ (ср.)</th>
                      <th className="px-4 py-3 text-right">Препод. (ср.)</th>
                      <th className="min-w-[12rem] px-4 py-3">
                        Комментарии, детали
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStudyGroup.map((g) => (
                      <tr
                        key={g.studyGroupId}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {g.studyGroupName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {g.facultyName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {g.courseLevelName}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {g.sessionsTotal}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-teal-700">
                          {g.sessionsCompleted}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                          {g.sessionsInProgress}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <AiScoreCell
                            avg={g.avgAiScore}
                            count={g.sessionsWithAiScore}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <TeacherScoreCell
                            avg={g.avgTeacherScore}
                            count={g.sessionsWithTeacherNumericScore}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <TeacherFeedbackCell
                            text={g.teacherEvaluationsText}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-slate-900">
              По кейсам
            </h3>
            {byCase.length === 0 ? (
              <p className="text-sm text-slate-500">Нет кейсов у кафедры.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/90 shadow-card backdrop-blur-sm">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Кейс</th>
                      <th className="px-4 py-3 text-right">Сессий</th>
                      <th className="px-4 py-3 text-right">Завершено</th>
                      <th className="px-4 py-3 text-right">В процессе</th>
                      <th className="px-4 py-3 text-right">ИИ (ср.)</th>
                      <th className="px-4 py-3 text-right">Препод. (ср.)</th>
                      <th className="min-w-[12rem] px-4 py-3">
                        Комментарии, детали
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCase.map((c) => (
                      <tr
                        key={c.caseId}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {c.caseTitle}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.sessionsTotal}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-teal-700">
                          {c.sessionsCompleted}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                          {c.sessionsInProgress}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <AiScoreCell
                            avg={c.avgAiScore}
                            count={c.sessionsWithAiScore}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <TeacherScoreCell
                            avg={c.avgTeacherScore}
                            count={c.sessionsWithTeacherNumericScore}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <TeacherFeedbackCell
                            text={c.teacherEvaluationsText}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {user.role === "TEACHER" && !loadingDetail && !detailSummary && !error ? (
        <p className="text-slate-500">Нет данных по вашей кафедре.</p>
      ) : null}
    </div>
  );
}
