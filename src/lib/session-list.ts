import { getSql } from "./db";
import type { Role } from "../types/db";
import {
  type CaseSessionBrief,
  type SessionOutcomeRow,
} from "./session-detail";
import { closeStaleDuplicateInProgressSessions } from "./session-logic";

type SessionListRow = {
  id: string;
  caseId: string;
  studyGroupId: string;
  leaderUserId: string;
  status: CaseSessionBrief["status"];
  currentStageOrder: number;
  totalStages: number;
  caseVersionSnapshot: number;
  startedAt: Date;
  completedAt: Date | null;
  caseTitle: string;
  caseDepartmentId: string;
  casePublished: boolean;
  caseTeacherKey: string | null;
  studyGroupName: string;
  facultyId: string;
  facultyName: string;
  courseLevelId: string;
  courseLevelName: string;
  courseLevelSort: number;
  leaderName: string | null;
  leaderLogin: string;
  outcomeId: string | null;
  outcomeCaseSessionId: string | null;
  aiAnalysis: string | null;
  aiModel: string | null;
  aiPromptVersion: string | null;
  aiPreliminaryScores: unknown;
  teacherGrade: string | null;
  teacherComment: string | null;
  finalizedAt: Date | null;
};

const sessionListSelect = `
  SELECT
    cs.id,
    cs."caseId",
    cs."studyGroupId",
    cs."leaderUserId",
    cs.status,
    cs."currentStageOrder",
    (
      SELECT COUNT(*)::int FROM "CaseStage" st WHERE st."caseId" = c.id
    ) AS "totalStages",
    cs."caseVersionSnapshot",
    cs."startedAt",
    cs."completedAt",
    c.title AS "caseTitle",
    c."departmentId" AS "caseDepartmentId",
    c.published AS "casePublished",
    c."teacherKey" AS "caseTeacherKey",
    sg.name AS "studyGroupName",
    f.id AS "facultyId",
    f.name AS "facultyName",
    cl.id AS "courseLevelId",
    cl.name AS "courseLevelName",
    cl.sort AS "courseLevelSort",
    u.name AS "leaderName",
    u.login AS "leaderLogin",
    o.id AS "outcomeId",
    o."caseSessionId" AS "outcomeCaseSessionId",
    o."aiAnalysis",
    o."aiModel",
    o."aiPromptVersion",
    o."aiPreliminaryScores",
    o."teacherGrade",
    o."teacherComment",
    o."finalizedAt"
  FROM "CaseSession" cs
  JOIN "Case" c ON c.id = cs."caseId"
  JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
  JOIN "Faculty" f ON f.id = sg."facultyId"
  JOIN "CourseLevel" cl ON cl.id = sg."courseLevelId"
  JOIN "User" u ON u.id = cs."leaderUserId"
  LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
`;

function mapSessionListRow(row: SessionListRow): CaseSessionBrief {
  const outcome: SessionOutcomeRow | null = row.outcomeId
    ? {
        id: row.outcomeId,
        caseSessionId: row.outcomeCaseSessionId ?? row.id,
        aiAnalysis: row.aiAnalysis,
        aiModel: row.aiModel,
        aiPromptVersion: row.aiPromptVersion,
        aiPreliminaryScores: row.aiPreliminaryScores,
        teacherGrade: row.teacherGrade,
        teacherComment: row.teacherComment,
        finalizedAt: row.finalizedAt,
      }
    : null;

  return {
    id: row.id,
    caseId: row.caseId,
    studyGroupId: row.studyGroupId,
    leaderUserId: row.leaderUserId,
    status: row.status,
    currentStageOrder: row.currentStageOrder,
    totalStages: row.totalStages,
    caseVersionSnapshot: row.caseVersionSnapshot,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    case: {
      id: row.caseId,
      title: row.caseTitle,
      departmentId: row.caseDepartmentId,
      published: row.casePublished,
      teacherKey: row.caseTeacherKey,
    },
    studyGroup: {
      id: row.studyGroupId,
      name: row.studyGroupName,
      faculty: { id: row.facultyId, name: row.facultyName },
      courseLevel: {
        id: row.courseLevelId,
        name: row.courseLevelName,
        sort: row.courseLevelSort,
      },
    },
    leader: {
      id: row.leaderUserId,
      name: row.leaderName,
      login: row.leaderLogin,
    },
    outcome,
  };
}

export async function fetchSessionsList(opts: {
  role: Role;
  userId: string;
  departmentId?: string | null;
  caseId?: string;
  limit?: number;
}): Promise<CaseSessionBrief[]> {
  const pool = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const caseId = opts.caseId;

  let rows: SessionListRow[];
  if (opts.role === "ADMIN") {
    rows = await pool.unsafe<SessionListRow[]>(
      `${sessionListSelect}
       WHERE ($1::text IS NULL OR cs."caseId" = $1)
       ORDER BY cs."startedAt" DESC
       LIMIT $2`,
      [caseId ?? null, limit],
    );
  } else if (opts.role === "TEACHER") {
    const dept = opts.departmentId;
    if (!dept) return [];
    rows = await pool.unsafe<SessionListRow[]>(
      `${sessionListSelect}
       WHERE c."departmentId" = $1
         AND ($2::text IS NULL OR cs."caseId" = $2)
       ORDER BY cs."startedAt" DESC
       LIMIT $3`,
      [dept, caseId ?? null, limit],
    );
  } else {
    return [];
  }

  return hideAbandonedOpenSiblings(rows.map(mapSessionListRow));
}

/** Пока идёт занятие, не показывать брошенный дубль той же группы в «ждут разбора». */
function hideAbandonedOpenSiblings(sessions: CaseSessionBrief[]) {
  const openKeys = new Set(
    sessions
      .filter((s) => s.status === "IN_PROGRESS")
      .map((s) => `${s.caseId}:${s.studyGroupId}`),
  );
  return sessions.filter((s) => {
    if (s.status !== "COMPLETED") return true;
    if (!openKeys.has(`${s.caseId}:${s.studyGroupId}`)) return true;
    return Boolean(s.outcome?.teacherGrade?.trim() || s.outcome?.finalizedAt);
  });
}

export async function sweepDuplicateOpenSessions() {
  return closeStaleDuplicateInProgressSessions();
}
