import type { CaseListItem } from "~lib/case-list";
import { apiFetch } from "@/lib/api-fetch";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  name: string | null;
  login: string;
  role: string;
  departmentId: string | null;
};

type CaseRow = CaseListItem;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200/50";

export function NewSessionForm({
  cases,
  leaderCandidates,
  defaultCaseId,
}: {
  cases: CaseRow[];
  leaderCandidates: User[];
  defaultCaseId?: string;
}) {
  const navigate = useNavigate();
  const [caseId, setCaseId] = useState(defaultCaseId ?? cases[0]?.id ?? "");
  const [groupName, setGroupName] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [courseLevelId, setCourseLevelId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === caseId),
    [cases, caseId],
  );

  const facultyOptions = useMemo(() => {
    if (!selectedCase) return [];
    return selectedCase.caseFaculties;
  }, [selectedCase]);

  const courseLevelOptions = useMemo(() => {
    if (!selectedCase) return [];
    return [...selectedCase.caseCourseLevels].sort(
      (a, b) => a.courseLevel.sort - b.courseLevel.sort,
    );
  }, [selectedCase]);

  const leadersForCase = useMemo(() => {
    if (!selectedCase) return leaderCandidates;
    return leaderCandidates.filter(
      (u) =>
        u.role === "ADMIN" ||
        (u.role === "TEACHER" && u.departmentId === selectedCase.departmentId),
    );
  }, [leaderCandidates, selectedCase]);

  useEffect(() => {
    if (!selectedCase) return;
    setFacultyId(selectedCase.caseFaculties[0]?.facultyId ?? "");
    const sorted = [...selectedCase.caseCourseLevels].sort(
      (a, b) => a.courseLevel.sort - b.courseLevel.sort,
    );
    setCourseLevelId(sorted[0]?.courseLevelId ?? "");
  }, [selectedCase]);

  useEffect(() => {
    const list = leadersForCase;
    if (list.length === 0) {
      setLeaderId("");
      return;
    }
    if (!leaderId || !list.some((u) => u.id === leaderId)) {
      setLeaderId(list[0]!.id);
    }
  }, [leadersForCase, leaderId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId,
        studyGroupName: groupName.trim(),
        facultyId,
        courseLevelId,
        leaderUserId: leaderId,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(typeof j.error === "string" ? j.error : "Не удалось создать сессию");
      return;
    }
    const data = (await res.json()) as { session: { id: string } };
    navigate(`/sessions/${data.session.id}`);
  }

  function caseOptionLabel(c: CaseRow): string {
    const fac = c.caseFaculties.map((x) => x.faculty.name).join(", ");
    const crs = c.caseCourseLevels.map((x) => x.courseLevel.name).join(", ");
    return `${c.title} (${fac}; ${crs})`;
  }

  const canSubmit =
    Boolean(caseId) &&
    Boolean(groupName.trim()) &&
    Boolean(facultyId) &&
    Boolean(courseLevelId) &&
    Boolean(leaderId) &&
    leadersForCase.length > 0 &&
    facultyOptions.length > 0 &&
    courseLevelOptions.length > 0;

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-card backdrop-blur-sm sm:p-8"
    >
      <Link to="/sessions" className="inline-flex items-center gap-1.5 text-sm text-brand-600 transition hover:text-brand-800">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        К сессиям
      </Link>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">Кейс</span>
        <select className={inputClass} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {caseOptionLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Факультет</span>
          <select
            className={inputClass}
            value={facultyId}
            onChange={(e) => setFacultyId(e.target.value)}
            disabled={facultyOptions.length === 0}
          >
            {facultyOptions.map((x) => (
              <option key={x.facultyId} value={x.facultyId}>
                {x.faculty.name}
              </option>
            ))}
          </select>
          {facultyOptions.length === 0 && selectedCase && (
            <p className="mt-1.5 text-xs text-amber-600">
              У кейса не заданы факультеты — отредактируйте кейс.
            </p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Курс (уровень)</span>
          <select
            className={inputClass}
            value={courseLevelId}
            onChange={(e) => setCourseLevelId(e.target.value)}
            disabled={courseLevelOptions.length === 0}
          >
            {courseLevelOptions.map((x) => (
              <option key={x.courseLevelId} value={x.courseLevelId}>
                {x.courseLevel.name}
              </option>
            ))}
          </select>
          {courseLevelOptions.length === 0 && selectedCase && (
            <p className="mt-1.5 text-xs text-amber-600">
              У кейса не заданы курсы — отредактируйте кейс.
            </p>
          )}
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">Название группы</span>
        <input
          type="text"
          className={inputClass}
          placeholder="Например, группа 401"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          autoComplete="off"
        />
        <span className="mt-1.5 block text-xs text-slate-400">
          Если группа с таким названием, факультетом и курсом уже есть — будет использована она.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">Ведущий</span>
        <select className={inputClass} value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
          {leadersForCase.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.login}
            </option>
          ))}
        </select>
        {leadersForCase.length === 0 && (
          <p className="mt-1.5 text-xs text-amber-600">
            Нет пользователя для ведения (нужен админ или преподаватель кафедры кейса).
          </p>
        )}
      </label>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? "Создание..." : "Начать сессию"}
      </button>
    </form>
  );
}
