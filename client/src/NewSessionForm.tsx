import type { CaseListItem } from "~lib/case-list";
import { apiFetch } from "@/lib/api-fetch";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth-context";
import {
  findOpenSessionForGroup,
  readLastSessionStart,
  rememberSessionCombo,
  writeLastSessionStart,
  type SessionBriefJson,
} from "@/lib/teacher-workbench";

type User = {
  id: string;
  name: string | null;
  login: string;
  role: string;
  departmentId: string | null;
};

export type StudyGroupOption = {
  id: string;
  name: string;
  facultyId: string;
  courseLevelId: string;
  faculty: { id: string; name: string };
  courseLevel: { id: string; name: string; sort: number };
};

type CaseRow = CaseListItem;

const inputClass = "ui-input";

export function NewSessionForm({
  cases,
  leaderCandidates,
  studyGroups,
  sessions = [],
  defaultCaseId,
  defaultGroupId,
}: {
  cases: CaseRow[];
  leaderCandidates: User[];
  studyGroups: StudyGroupOption[];
  sessions?: SessionBriefJson[];
  defaultCaseId?: string;
  defaultGroupId?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const last = useMemo(() => readLastSessionStart(), []);
  const [caseId, setCaseId] = useState(() => {
    if (defaultCaseId && cases.some((c) => c.id === defaultCaseId)) {
      return defaultCaseId;
    }
    return cases[0]?.id ?? "";
  });
  const [groupMode, setGroupMode] = useState<"existing" | "new">(
    () => (studyGroups.length > 0 ? "existing" : "new"),
  );
  const [studyGroupId, setStudyGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [courseLevelId, setCourseLevelId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowNew, setAllowNew] = useState(false);

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === caseId),
    [cases, caseId],
  );

  useEffect(() => {
    if (cases.length === 0) {
      setCaseId("");
      return;
    }
    if (caseId && cases.some((c) => c.id === caseId)) return;
    if (defaultCaseId && cases.some((c) => c.id === defaultCaseId)) {
      setCaseId(defaultCaseId);
      return;
    }
    setCaseId(cases[0]!.id);
  }, [caseId, cases, defaultCaseId]);

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

  const groupsForCase = useMemo(() => {
    if (!selectedCase) return [];
    const fac = new Set(selectedCase.caseFaculties.map((x) => x.facultyId));
    const crs = new Set(
      selectedCase.caseCourseLevels.map((x) => x.courseLevelId),
    );
    return studyGroups.filter(
      (g) => fac.has(g.facultyId) && crs.has(g.courseLevelId),
    );
  }, [selectedCase, studyGroups]);

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
    const lastFacOk =
      last?.facultyId &&
      selectedCase.caseFaculties.some((x) => x.facultyId === last.facultyId);
    const lastCrsOk =
      last?.courseLevelId &&
      selectedCase.caseCourseLevels.some(
        (x) => x.courseLevelId === last.courseLevelId,
      );
    setFacultyId(
      lastFacOk
        ? last!.facultyId!
        : (selectedCase.caseFaculties[0]?.facultyId ?? ""),
    );
    const sorted = [...selectedCase.caseCourseLevels].sort(
      (a, b) => a.courseLevel.sort - b.courseLevel.sort,
    );
    setCourseLevelId(
      lastCrsOk ? last!.courseLevelId! : (sorted[0]?.courseLevelId ?? ""),
    );
  }, [selectedCase, last]);

  useEffect(() => {
    if (groupsForCase.length === 0) {
      setGroupMode("new");
      setStudyGroupId("");
      return;
    }
    const preferred =
      (defaultGroupId &&
        groupsForCase.find((g) => g.id === defaultGroupId)?.id) ||
      (last?.studyGroupId &&
        groupsForCase.find((g) => g.id === last.studyGroupId)?.id) ||
      groupsForCase[0]!.id;
    setStudyGroupId(preferred);
    setGroupMode((mode) => (mode === "new" ? mode : "existing"));
  }, [groupsForCase, last, defaultGroupId]);

  useEffect(() => {
    if (groupMode !== "existing") return;
    const g = groupsForCase.find((x) => x.id === studyGroupId);
    if (!g) return;
    setGroupName(g.name);
    setFacultyId(g.facultyId);
    setCourseLevelId(g.courseLevelId);
  }, [groupMode, studyGroupId, groupsForCase]);

  useEffect(() => {
    const list = leadersForCase;
    if (list.length === 0) {
      setLeaderId("");
      return;
    }
    const self = user && list.some((u) => u.id === user.id) ? user.id : null;
    if (self) {
      setLeaderId(self);
      return;
    }
    if (!leaderId || !list.some((u) => u.id === leaderId)) {
      setLeaderId(list[0]!.id);
    }
  }, [leadersForCase, leaderId, user]);

  const hideFaculty = facultyOptions.length <= 1;
  const hideCourse = courseLevelOptions.length <= 1;
  const hideLeader = leadersForCase.length <= 1;

  const canSubmit =
    Boolean(caseId) &&
    Boolean(
      groupMode === "existing"
        ? studyGroupId
        : groupName.trim(),
    ) &&
    Boolean(facultyId) &&
    Boolean(courseLevelId) &&
    Boolean(leaderId) &&
    leadersForCase.length > 0 &&
    facultyOptions.length > 0 &&
    courseLevelOptions.length > 0;

  const selectedGroupName =
    groupMode === "existing"
      ? (groupsForCase.find((g) => g.id === studyGroupId)?.name ??
        groupName.trim())
      : groupName.trim();

  const openSession = useMemo(() => {
    if (!caseId) return null;
    return findOpenSessionForGroup(sessions, {
      caseId,
      studyGroupId:
        groupMode === "existing" && studyGroupId ? studyGroupId : undefined,
      groupName: selectedGroupName || undefined,
    });
  }, [sessions, caseId, groupMode, studyGroupId, selectedGroupName]);

  useEffect(() => {
    setAllowNew(false);
  }, [caseId, studyGroupId, groupMode, selectedGroupName]);

  function persistCombo(session: SessionBriefJson) {
    rememberSessionCombo(session, { facultyId, courseLevelId });
  }

  function goToOpenSession() {
    if (!openSession) return;
    persistCombo(openSession);
    navigate(`/sessions/${openSession.id}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (openSession && !allowNew) {
      goToOpenSession();
      return;
    }
    setLoading(true);
    setError(null);
    const name = selectedGroupName;
    const body: Record<string, unknown> = {
      caseId,
      leaderUserId: leaderId,
    };
    if (groupMode === "existing" && studyGroupId) {
      body.studyGroupId = studyGroupId;
    } else {
      body.studyGroupName = name;
      body.facultyId = facultyId;
      body.courseLevelId = courseLevelId;
    }
    if (allowNew) body.forceNew = true;
    const res = await apiFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      existingSessionId?: string;
      session?: { id: string; studyGroupId?: string };
    };
    setLoading(false);
    if (res.status === 409 && j.existingSessionId && !allowNew) {
      navigate(`/sessions/${j.existingSessionId}`);
      return;
    }
    if (!res.ok) {
      setError(
        typeof j.error === "string" ? j.error : "Не удалось начать занятие",
      );
      return;
    }
    writeLastSessionStart({
      caseId,
      studyGroupId: j.session?.studyGroupId ?? (groupMode === "existing" ? studyGroupId : undefined),
      groupName: name,
      facultyId,
      courseLevelId,
    });
    if (!j.session?.id) {
      setError("Не удалось начать занятие");
      return;
    }
    navigate(`/sessions/${j.session.id}`);
  }

  function caseOptionLabel(c: CaseRow): string {
    const fac = c.caseFaculties.map((x) => x.faculty.name).join(", ");
    const crs = c.caseCourseLevels.map((x) => x.courseLevel.name).join(", ");
    return `${c.title} (${fac}; ${crs})`;
  }

  const readyCases = cases.filter((c) => (c.stageCount ?? 0) > 0);
  const sourceCases = readyCases.length > 0 ? readyCases : cases;

  if (cases.length === 0) {
    return (
      <div className="ui-empty space-y-4">
        <p>
          Чтобы начать занятие, сначала нужен кейс с этапами, факультетами и
          курсами.
        </p>
        <Link to="/cases/new" className="ui-btn-primary">
          Создать кейс
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="ui-card space-y-5 p-6 sm:p-8">
      <Link
        to="/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-brand-600 transition hover:text-brand-800"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        К занятиям
      </Link>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">
          Кейс
        </span>
        <select
          className={inputClass}
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {sourceCases.map((c) => (
            <option key={c.id} value={c.id}>
              {caseOptionLabel(c)}
            </option>
          ))}
        </select>
      </label>

      {groupsForCase.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-600">Группа</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={
                groupMode === "existing" ? "ui-chip-on" : "ui-chip"
              }
              onClick={() => setGroupMode("existing")}
            >
              Существующая
            </button>
            <button
              type="button"
              className={
                groupMode === "new" ? "ui-chip-on" : "ui-chip"
              }
              onClick={() => {
                setGroupMode("new");
                setGroupName(last?.groupName ?? "");
              }}
            >
              Новая
            </button>
          </div>
          {groupMode === "existing" ? (
            <select
              className={inputClass}
              value={studyGroupId}
              onChange={(e) => setStudyGroupId(e.target.value)}
            >
              {groupsForCase.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.faculty.name} · {g.courseLevel.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={inputClass}
              placeholder="Например, группа 401"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoComplete="off"
            />
          )}
        </fieldset>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">
            Название группы
          </span>
          <input
            type="text"
            className={inputClass}
            placeholder="Например, группа 401"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}

      {groupMode === "new" || groupsForCase.length === 0 ? (
        <div className={`grid gap-4 ${hideFaculty && hideCourse ? "" : "sm:grid-cols-2"}`}>
          {!hideFaculty ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">
                Факультет
              </span>
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
            </label>
          ) : null}
          {!hideCourse ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">
                Курс
              </span>
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
            </label>
          ) : null}
        </div>
      ) : null}

      {!hideLeader ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">
            Ведущий
          </span>
          <select
            className={inputClass}
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
          >
            {leadersForCase.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.login}
                {user?.id === u.id ? " (вы)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error && <p className="ui-alert-danger">{error}</p>}

      {openSession && !allowNew ? (
        <div className="ui-alert-warning space-y-3">
          <p className="font-medium">
            У этой группы уже идёт занятие — продолжить?
          </p>
          <p>
            {openSession.case.title} · {openSession.studyGroup.name}
            {openSession.totalStages
              ? ` · этап ${openSession.currentStageOrder} из ${openSession.totalStages}`
              : ` · этап ${openSession.currentStageOrder}`}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="ui-btn-primary"
              onClick={goToOpenSession}
            >
              Продолжить
            </button>
            <button
              type="button"
              className="ui-btn-secondary"
              onClick={() => setAllowNew(true)}
            >
              Всё равно начать новое
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="ui-btn-primary"
        >
          Начать занятие
        </button>
      )}

      {loading && <LoadingOverlay label="Начинаем занятие…" />}
    </form>
  );
}
