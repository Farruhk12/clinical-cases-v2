import type { CaseListItem } from "~lib/case-list";

export type SessionBriefJson = {
  id: string;
  caseId: string;
  studyGroupId: string;
  status: "IN_PROGRESS" | "COMPLETED" | string;
  currentStageOrder: number;
  totalStages?: number;
  startedAt: string;
  completedAt: string | null;
  case: { id: string; title: string };
  studyGroup: {
    id: string;
    name: string;
    faculty: { name: string };
    courseLevel: { name: string };
  };
  leader: { name: string | null; login: string };
  outcome: {
    aiAnalysis: string | null;
    teacherGrade: string | null;
    finalizedAt: string | null;
  } | null;
};

const LAST_START_KEY = "clinical-cases:last-session-start";

export type LastSessionStart = {
  caseId?: string;
  studyGroupId?: string;
  groupName?: string;
  facultyId?: string;
  courseLevelId?: string;
};

function openSessionRank(a: SessionBriefJson, b: SessionBriefJson) {
  if (b.currentStageOrder !== a.currentStageOrder) {
    return b.currentStageOrder - a.currentStageOrder;
  }
  return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
}

export function findOpenSessionForGroup(
  sessions: SessionBriefJson[],
  opts: { caseId: string; studyGroupId?: string; groupName?: string },
): SessionBriefJson | null {
  const name = opts.groupName?.trim().toLowerCase();
  const matches = sessions.filter((s) => {
    if (!isInProgress(s) || s.caseId !== opts.caseId) return false;
    if (opts.studyGroupId) return s.studyGroupId === opts.studyGroupId;
    if (name && s.studyGroup.name.trim().toLowerCase() === name) return true;
    return false;
  });
  if (matches.length === 0) return null;
  return [...matches].sort(openSessionRank)[0] ?? null;
}

export function uniqueOpenSessions(sessions: SessionBriefJson[]) {
  const byKey = new Map<string, SessionBriefJson>();
  for (const s of sessions.filter(isInProgress)) {
    const key = `${s.caseId}:${s.studyGroupId}`;
    const prev = byKey.get(key);
    if (!prev || openSessionRank(s, prev) < 0) {
      byKey.set(key, s);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

/** Прячет лишние «в процессе» на одну группу — оставляет более поздний этап. */
export function collapseOpenSessionDuplicates(sessions: SessionBriefJson[]) {
  const keep = new Set(uniqueOpenSessions(sessions).map((s) => s.id));
  return sessions.filter((s) => !isInProgress(s) || keep.has(s.id));
}

export function pickResumeTarget(
  sessions: SessionBriefJson[],
  last: LastSessionStart | null,
): SessionBriefJson | null {
  if (last?.caseId) {
    const fromLast = findOpenSessionForGroup(sessions, {
      caseId: last.caseId,
      studyGroupId: last.studyGroupId,
      groupName: last.groupName,
    });
    if (fromLast) return fromLast;
  }
  const unique = uniqueOpenSessions(sessions);
  return unique.length === 1 ? (unique[0] ?? null) : null;
}

export function readLastSessionStart(): LastSessionStart | null {
  try {
    const raw = localStorage.getItem(LAST_START_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastSessionStart;
  } catch {
    return null;
  }
}

export function writeLastSessionStart(value: LastSessionStart) {
  try {
    localStorage.setItem(LAST_START_KEY, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function rememberSessionCombo(
  s: Pick<SessionBriefJson, "caseId" | "studyGroupId" | "studyGroup">,
  extra?: Pick<LastSessionStart, "facultyId" | "courseLevelId">,
) {
  writeLastSessionStart({
    caseId: s.caseId,
    studyGroupId: s.studyGroupId,
    groupName: s.studyGroup.name,
    facultyId: extra?.facultyId,
    courseLevelId: extra?.courseLevelId,
  });
}

export function lastComboStartPath(last: LastSessionStart | null) {
  if (!last?.caseId) return "/sessions/new";
  const params = new URLSearchParams({ caseId: last.caseId });
  if (last.studyGroupId) params.set("groupId", last.studyGroupId);
  return `/sessions/new?${params.toString()}`;
}

export function hasAiAnalysis(s: SessionBriefJson) {
  return Boolean(s.outcome?.aiAnalysis?.trim());
}

export function hasTeacherGrade(s: SessionBriefJson) {
  return Boolean(
    s.outcome?.teacherGrade?.trim() || s.outcome?.finalizedAt,
  );
}

export function needsDebrief(s: SessionBriefJson) {
  return s.status === "COMPLETED" && (!hasAiAnalysis(s) || !hasTeacherGrade(s));
}

export function isInProgress(s: SessionBriefJson) {
  return s.status === "IN_PROGRESS";
}

export function isGraded(s: SessionBriefJson) {
  return s.status === "COMPLETED" && hasTeacherGrade(s);
}

export function debriefLabel(s: SessionBriefJson) {
  if (s.status !== "COMPLETED") return null;
  if (!hasAiAnalysis(s) && !hasTeacherGrade(s)) return "Нужен разбор";
  if (!hasAiAnalysis(s)) return "Нет ИИ";
  if (!hasTeacherGrade(s)) return "Нет оценки";
  return "Готово";
}

export function sessionActionLabel(s: SessionBriefJson) {
  if (isInProgress(s)) return "Продолжить";
  if (needsDebrief(s)) return "Разобрать";
  return "Открыть";
}

export function sessionActionClass(s: SessionBriefJson) {
  if (isInProgress(s)) return "ui-btn-primary";
  if (needsDebrief(s)) return "ui-btn-mark";
  if (isGraded(s)) return "ui-btn-gilt";
  return "ui-btn-secondary";
}

export function caseIsReady(c: CaseListItem) {
  return (c.stageCount ?? 0) > 0;
}

export function caseNeedsWork(c: CaseListItem) {
  return (c.stageCount ?? 0) === 0 || !c.teacherKey?.trim();
}

export function caseStatusLabel(c: CaseListItem) {
  if ((c.stageCount ?? 0) === 0) return "черновик";
  if (c._count.sessions > 0) return "были занятия";
  return "готов";
}
