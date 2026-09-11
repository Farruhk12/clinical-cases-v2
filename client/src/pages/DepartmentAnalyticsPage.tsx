import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import { PageLoader } from "@/components/PageLoader";
import { TakenCheck } from "@/session/GuestIdeasInbox";
import type {
  AnalyticsSessionDetail,
  GradeBucket,
  TeacherAnalyticsPayload,
  TeacherSessionRow,
} from "~lib/teacher-analytics-types";

type DepartmentSummary = {
  departmentId: string;
  departmentName: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  uniqueStudyGroups: number;
  casesTotal: number;
  sessionsWithTeacherGrade: number;
  sessionsWithAiAnalysis: number;
};

function formatDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreText(n: number | null | undefined): string {
  return n == null ? "—" : `${n}/100`;
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
    <div className="ui-card p-4 sm:p-5">
      <p className="ui-kicker">{label}</p>
      <p className="mt-2 font-display text-2xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function BarTrack({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "teacher" | "ai" | "student";
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  const bar =
    tone === "teacher"
      ? "bg-brand-700"
      : tone === "ai"
        ? "bg-slate-500"
        : "bg-emerald-600";
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
      <div className="h-2.5 min-w-0 flex-1 rounded-full bg-surface">
        <div
          className={`h-2.5 rounded-full ${bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink">
        {value}
      </span>
    </div>
  );
}

function GradeBars({ buckets }: { buckets: GradeBucket[] }) {
  const max = Math.max(
    1,
    ...buckets.flatMap((b) => [b.teacher, b.ai, b.student]),
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {buckets.map((b) => (
        <div key={b.label} className="space-y-2">
          <p className="text-sm font-medium text-ink">{b.label}</p>
          <BarTrack label="Препод." value={b.teacher} max={max} tone="teacher" />
          <BarTrack label="ИИ" value={b.ai} max={max} tone="ai" />
          <BarTrack label="Студенты" value={b.student} max={max} tone="student" />
        </div>
      ))}
    </div>
  );
}

export function DepartmentAnalyticsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [data, setData] = useState<TeacherAnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSessionId, setOpenSessionId] = useState(
    () => params.get("sessionId") ?? "",
  );
  const [detail, setDetail] = useState<AnalyticsSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isAdmin = user?.role === "ADMIN";
  const selectedDeptId = params.get("departmentId") ?? "";
  const groupId = params.get("groupId") ?? "";
  const caseId = params.get("caseId") ?? "";

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "sessionId") next.delete("sessionId");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    void apiFetch("/api/analytics/departments")
      .then(async (res) => {
        if (!res.ok) return;
        const j = (await res.json()) as { departments: DepartmentSummary[] };
        if (!cancelled) setDepartments(j.departments ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) return;
    if (isAdmin && !selectedDeptId && departments.length !== 1) {
      setData(null);
      setLoading(false);
      return;
    }
    const dept =
      isAdmin && selectedDeptId
        ? selectedDeptId
        : departments.length === 1
          ? departments[0]?.departmentId
          : "";
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (isAdmin && (dept || selectedDeptId)) {
      q.set("departmentId", selectedDeptId || dept);
    }
    if (groupId) q.set("groupId", groupId);
    if (caseId) q.set("caseId", caseId);
    const qs = q.toString();
    void apiFetch(`/api/analytics/teacher${qs ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof j.error === "string" ? j.error : "Не удалось загрузить",
          );
        }
        setData((await res.json()) as TeacherAnalyticsPayload);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка");
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, selectedDeptId, groupId, caseId, departments]);

  useEffect(() => {
    const fromUrl = params.get("sessionId") ?? "";
    if (fromUrl && fromUrl !== openSessionId) setOpenSessionId(fromUrl);
  }, [params, openSessionId]);

  useEffect(() => {
    if (!openSessionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void apiFetch(`/api/analytics/sessions/${openSessionId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setDetail(null);
          setDetailLoading(false);
          return;
        }
        setDetail((await res.json()) as AnalyticsSessionDetail);
        setDetailLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openSessionId]);

  const byGroup = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        sessions: TeacherSessionRow[];
      }
    >();
    for (const s of data.sessions) {
      const row = map.get(s.studyGroupId) ?? {
        id: s.studyGroupId,
        name: s.groupName,
        sessions: [],
      };
      row.sessions.push(s);
      map.set(s.studyGroupId, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [data]);

  const byCase = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { id: string; title: string; sessions: TeacherSessionRow[] }
    >();
    for (const s of data.sessions) {
      const row = map.get(s.caseId) ?? {
        id: s.caseId,
        title: s.caseTitle,
        sessions: [],
      };
      row.sessions.push(s);
      map.set(s.caseId, row);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }, [data]);

  if (!user) return null;

  const showAdminChooser = isAdmin && !selectedDeptId && departments.length > 1;
  const takeRate =
    data && data.kpis.guestIdeas > 0
      ? Math.round((data.kpis.takenIdeas / data.kpis.guestIdeas) * 100)
      : null;

  function toggleSession(id: string) {
    const next = openSessionId === id ? "" : id;
    setOpenSessionId(next);
    setFilter("sessionId", next);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="ui-title">Аналитика</h1>
          <p className="mt-1 max-w-2xl text-pretty text-sm text-muted sm:text-base">
            Оценки групп и студентов, ответы с телефонов, время по этапам.
            Балл студента считается по его гипотезам и вопросам — даже если их
            не брали в общий список.
          </p>
        </div>
        {isAdmin && departments.length > 0 ? (
          <label className="flex min-w-[16rem] flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft">Кафедра</span>
            <select
              className="ui-input"
              value={selectedDeptId}
              onChange={(e) => setFilter("departmentId", e.target.value)}
            >
              <option value="">Все кафедры</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.departmentName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="ui-alert-danger">{error}</p> : null}

      {showAdminChooser ? (
        <div className="ui-table-wrap">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="ui-table-head">
                <th className="px-4 py-3">Кафедра</th>
                <th className="px-4 py-3 text-right">Кейсов</th>
                <th className="px-4 py-3 text-right">Занятий</th>
                <th className="px-4 py-3 text-right">Завершено</th>
                <th className="px-4 py-3 text-right">С оценкой</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.departmentId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-brand-800 hover:underline"
                      onClick={() => setFilter("departmentId", d.departmentId)}
                    >
                      {d.departmentName}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{d.casesTotal}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{d.sessionsTotal}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand-800">
                    {d.sessionsCompleted}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {d.sessionsWithTeacherGrade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {loading ? <PageLoader /> : null}

      {!loading && data ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Группа</span>
              <select
                className="ui-input"
                value={groupId}
                onChange={(e) => setFilter("groupId", e.target.value)}
              >
                <option value="">Все группы</option>
                {data.filters.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Кейс</span>
              <select
                className="ui-input"
                value={caseId}
                onChange={(e) => setFilter("caseId", e.target.value)}
              >
                <option value="">Все кейсы</option>
                {data.filters.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {data.kpis.departmentName}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Сводка по выбранным фильтрам
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Занятий"
              value={data.kpis.sessionsTotal}
              sub={`${data.kpis.sessionsCompleted} завершено · ${data.kpis.sessionsInProgress} в процессе`}
            />
            <StatCard
              label="Нужна оценка"
              value={data.kpis.needGrade}
              sub="завершены без балла преподавателя"
            />
            <StatCard
              label="Средний балл группы"
              value={scoreText(data.kpis.avgTeacherScore)}
              sub={
                data.kpis.avgAiScore != null
                  ? `ИИ: ${data.kpis.avgAiScore}/100`
                  : "пока без оценки преподавателя"
              }
            />
            <StatCard
              label="Среднее время занятия"
              value={formatDuration(data.kpis.avgDurationMin)}
              sub="только завершённые"
            />
            <StatCard
              label="Студентов с телефона"
              value={data.kpis.guestStudents}
              sub={`${data.kpis.guestIdeas} ответов`}
            />
            <StatCard
              label="Средний балл студента"
              value={scoreText(data.kpis.avgStudentScore)}
              sub="по гипотезам и вопросам с телефона"
            />
            <StatCard
              label="Взято в общий список"
              value={
                takeRate != null
                  ? `${data.kpis.takenIdeas} · ${takeRate}%`
                  : data.kpis.takenIdeas
              }
              sub="из ответов с телефонов"
            />
            <StatCard
              label="Групп / кейсов"
              value={`${data.kpis.uniqueStudyGroups} / ${data.kpis.casesTotal}`}
            />
          </div>

          <section className="ui-card space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Распределение оценок
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Сколько занятий попало в каждый диапазон: ваша оценка, ИИ и
                средний балл студентов с телефона.
              </p>
            </div>
            <GradeBars buckets={data.gradeBuckets} />
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Занятия
            </h2>
            {data.sessions.length === 0 ? (
              <p className="ui-empty">Нет занятий по выбранным фильтрам.</p>
            ) : (
              <div className="ui-table-wrap">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="ui-table-head">
                      <th className="px-4 py-3">Когда</th>
                      <th className="px-4 py-3">Кейс / группа</th>
                      <th className="px-4 py-3 text-right">Время</th>
                      <th className="px-4 py-3 text-right">Список</th>
                      <th className="px-4 py-3 text-right">Телефоны</th>
                      <th className="px-4 py-3 text-right">Препод.</th>
                      <th className="px-4 py-3 text-right">Студенты</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => {
                      const open = openSessionId === s.id;
                      return (
                        <SessionRows
                          key={s.id}
                          session={s}
                          open={open}
                          detail={open ? detail : null}
                          detailLoading={open && detailLoading}
                          onToggle={() => toggleSession(s.id)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Студенты
            </h2>
            <p className="text-sm text-ink-soft">
              По ответам с телефона. Одно имя на разных занятиях складывается.
            </p>
            {data.students.length === 0 ? (
              <p className="ui-empty">
                Пока никто не присылал гипотезы и вопросы с телефона.
              </p>
            ) : (
              <div className="ui-table-wrap">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="ui-table-head">
                      <th className="px-4 py-3">Студент</th>
                      <th className="px-4 py-3 text-right">Занятий</th>
                      <th className="px-4 py-3 text-right">Гипотезы</th>
                      <th className="px-4 py-3 text-right">Вопросы</th>
                      <th className="px-4 py-3 text-right">В списке</th>
                      <th className="px-4 py-3 text-right">Балл</th>
                      <th className="px-4 py-3">Последний кейс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((st) => (
                      <tr
                        key={st.displayName}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          {st.displayName}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.sessionCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.hypothesisCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.questionCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.takenCount}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-800">
                          {st.avgScore}/100
                        </td>
                        <td className="px-4 py-3 text-ink-soft">
                          {st.lastCaseTitle ?? "—"}
                          {st.lastSessionAt ? (
                            <p className="text-xs text-muted">
                              {formatWhen(st.lastSessionAt)}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Этапы
            </h2>
            {data.stages.length === 0 ? (
              <p className="ui-empty">Нет данных по этапам.</p>
            ) : (
              <div className="ui-table-wrap">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="ui-table-head">
                      <th className="px-4 py-3">Этап</th>
                      <th className="px-4 py-3 text-right">Занятий</th>
                      <th className="px-4 py-3 text-right">Время</th>
                      <th className="px-4 py-3 text-right">Гип. / вопр.</th>
                      <th className="px-4 py-3 text-right">С телефонов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stages.map((st) => (
                      <tr
                        key={`${st.caseId}-${st.stageOrder}`}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">
                            {st.stageOrder}. {st.stageTitle}
                          </p>
                          <p className="text-xs text-muted">{st.caseTitle}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.sessions}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatDuration(st.avgDurationMin)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.avgOfficialHypos} / {st.avgOfficialQuestions}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {st.guestIdeas}
                          {st.takenIdeas
                            ? ` · ${st.takenIdeas} в списке`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              По учебным группам
            </h2>
            {byGroup.length === 0 ? (
              <p className="ui-empty">Пока нет занятий по группам.</p>
            ) : (
              <div className="ui-table-wrap">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="ui-table-head">
                      <th className="px-4 py-3">Группа</th>
                      <th className="px-4 py-3 text-right">Занятий</th>
                      <th className="px-4 py-3 text-right">Студентов</th>
                      <th className="px-4 py-3 text-right">Препод.</th>
                      <th className="px-4 py-3 text-right">ИИ</th>
                      <th className="px-4 py-3 text-right">Студенты</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byGroup.map((g) => {
                      const completed = g.sessions.filter(
                        (s) => s.status === "COMPLETED",
                      );
                      const need = completed.filter((s) => s.teacherGrade == null)
                        .length;
                      const students = new Set(
                        g.sessions.flatMap((s) =>
                          s.guestStudents > 0 ? [s.id] : [],
                        ),
                      );
                      const guestN = g.sessions.reduce((n, s) => n + s.guestStudents, 0);
                      return (
                        <tr key={g.id} className="border-b border-line last:border-0">
                          <td className="px-4 py-3 font-medium text-ink">
                            <button
                              type="button"
                              className="text-brand-800 hover:underline"
                              onClick={() => setFilter("groupId", g.id)}
                            >
                              {g.name}
                            </button>
                            {need > 0 ? (
                              <p className="mt-0.5 text-xs font-normal text-[var(--color-warning)]">
                                Нужна оценка: {need}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {g.sessions.length}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {guestN}
                            {students.size ? (
                              <span className="block text-[0.65rem] text-muted">
                                на {students.size} зан.
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-brand-800">
                            {scoreText(
                              avgNums(
                                g.sessions.map((s) => s.teacherGrade),
                              ),
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {scoreText(avgNums(g.sessions.map((s) => s.aiScore)))}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {scoreText(
                              avgNums(g.sessions.map((s) => s.avgStudentScore)),
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              По кейсам
            </h2>
            {byCase.length === 0 ? (
              <p className="ui-empty">Нет кейсов с занятиями.</p>
            ) : (
              <div className="ui-table-wrap">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="ui-table-head">
                      <th className="px-4 py-3">Кейс</th>
                      <th className="px-4 py-3 text-right">Занятий</th>
                      <th className="px-4 py-3 text-right">Время</th>
                      <th className="px-4 py-3 text-right">Препод.</th>
                      <th className="px-4 py-3 text-right">Студенты</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCase.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 font-medium text-ink">
                          <button
                            type="button"
                            className="text-brand-800 hover:underline"
                            onClick={() => setFilter("caseId", c.id)}
                          >
                            {c.title}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.sessions.length}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatDuration(
                            avgNums(
                              c.sessions
                                .filter((s) => s.status === "COMPLETED")
                                .map((s) => s.durationMin),
                            ),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-brand-800">
                          {scoreText(avgNums(c.sessions.map((s) => s.teacherGrade)))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {scoreText(
                            avgNums(c.sessions.map((s) => s.avgStudentScore)),
                          )}
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
    </div>
  );
}

function avgNums(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((n): n is number => n != null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function SessionRows({
  session,
  open,
  detail,
  detailLoading,
  onToggle,
}: {
  session: TeacherSessionRow;
  open: boolean;
  detail: AnalyticsSessionDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <td className="px-4 py-3 text-ink-soft">{formatWhen(session.startedAt)}</td>
        <td className="px-4 py-3">
          <p className="font-medium text-ink">{session.caseTitle}</p>
          <p className="text-xs text-muted">
            {session.groupName}
            {session.status === "IN_PROGRESS" ? " · в процессе" : ""}
            {session.status === "COMPLETED" && session.teacherGrade == null
              ? " · нужна оценка"
              : ""}
          </p>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {formatDuration(session.durationMin)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {session.officialHypos} гип. · {session.officialQuestions} вопр.
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {session.guestStudents
            ? `${session.guestStudents} · ${session.guestIdeas} отв.`
            : "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-brand-800">
          {scoreText(session.teacherGrade)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {scoreText(session.avgStudentScore)}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            className="text-xs font-medium text-brand-700 hover:underline"
            onClick={onToggle}
            aria-expanded={open}
          >
            {open ? "Скрыть" : "Подробно"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-line bg-surface/60">
          <td colSpan={8} className="px-4 py-4">
            {detailLoading ? (
              <p className="text-sm text-muted">Загрузка разбора…</p>
            ) : detail ? (
              <SessionDetailBody detail={detail} />
            ) : (
              <p className="text-sm text-muted">Не удалось открыть занятие.</p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SessionDetailBody({ detail }: { detail: AnalyticsSessionDetail }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          Официальный список: {detail.session.officialHypos} гипотез,{" "}
          {detail.session.officialQuestions} вопросов. С телефонов:{" "}
          {detail.session.guestIdeas} ответов, {detail.session.takenIdeas} взяли
          в список.
        </p>
        <Link
          to={`/sessions/${detail.session.id}`}
          className="text-sm font-medium text-brand-800 hover:underline"
        >
          Открыть занятие
        </Link>
      </div>
      {detail.students.length > 0 ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {detail.students.map((st) => (
            <li
              key={st.guestKey}
              className="rounded-[12px] border border-line bg-elevated px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{st.displayName}</p>
                <p className="font-display text-xl tabular-nums text-ink">
                  {st.score}
                  <span className="text-xs text-muted"> /100</span>
                </p>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {st.hypothesisCount} гип. · {st.questionCount} вопр.
                {st.takenCount ? ` · ${st.takenCount} в списке` : " · в список не брали"}
              </p>
              <ul className="mt-2 space-y-1">
                {st.ideas.map((idea, i) => (
                  <li key={`${idea.text}-${i}`} className="flex items-start gap-2 text-sm">
                    {idea.takenAt ? (
                      <TakenCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    )}
                    <span>
                      <span className="text-xs text-muted">
                        {idea.kind === "HYPOTHESIS" ? "Гипотеза" : "Вопрос"}
                        {idea.stageOrder != null ? ` · этап ${idea.stageOrder}` : ""}
                      </span>
                      <span className="block text-ink">{idea.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">С телефонов на этом занятии никто не писал.</p>
      )}
      {detail.stages.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="py-1 pr-3">Этап</th>
                <th className="py-1 pr-3 text-right">Время</th>
                <th className="py-1 pr-3 text-right">Список</th>
                <th className="py-1 text-right">Телефоны</th>
              </tr>
            </thead>
            <tbody>
              {detail.stages.map((st) => (
                <tr key={st.stageOrder}>
                  <td className="py-1 pr-3 text-ink">
                    {st.stageOrder}. {st.stageTitle}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {formatDuration(st.durationMin)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {st.officialHypos} / {st.officialQuestions}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {st.guestIdeas}
                    {st.takenIdeas ? ` · ${st.takenIdeas} в списке` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
