import { getSql } from "./db";
import type { Role } from "../types/db";

type FacultyRef = { id: string; name: string };
type CourseRef = { id: string; name: string; sort: number };

export type CaseListItem = {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  teacherKey: string | null;
  caseVersion: number;
  departmentId: string;
  caseFaculties: {
    caseId: string;
    facultyId: string;
    faculty: FacultyRef;
  }[];
  caseCourseLevels: {
    caseId: string;
    courseLevelId: string;
    courseLevel: CourseRef;
  }[];
  _count: { sessions: number };
  stageCount: number;
};

type CaseListRow = {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  teacherKey: string | null;
  caseVersion: number;
  departmentId: string;
  caseFaculties: unknown;
  caseCourseLevels: unknown;
  sessionCount: number;
  stageCount: number;
};

function mapRow(r: CaseListRow): CaseListItem {
  const caseFaculties = Array.isArray(r.caseFaculties)
    ? (r.caseFaculties as CaseListItem["caseFaculties"])
    : [];
  const caseCourseLevels = Array.isArray(r.caseCourseLevels)
    ? (r.caseCourseLevels as CaseListItem["caseCourseLevels"])
    : [];
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    published: r.published,
    teacherKey: r.teacherKey,
    caseVersion: r.caseVersion,
    departmentId: r.departmentId,
    caseFaculties,
    caseCourseLevels,
    _count: { sessions: r.sessionCount },
    stageCount: r.stageCount,
  };
}

const caseListSelect = `
  c.id,
  c.title,
  c.description,
  c.published,
  c."teacherKey",
  c."caseVersion",
  c."departmentId",
  (
    SELECT COALESCE(json_agg(json_build_object(
      'caseId', cf."caseId",
      'facultyId', cf."facultyId",
      'faculty', json_build_object('id', f.id, 'name', f.name)
    )), '[]'::json)
    FROM "CaseFaculty" cf
    JOIN "Faculty" f ON f.id = cf."facultyId"
    WHERE cf."caseId" = c.id
  ) AS "caseFaculties",
  (
    SELECT COALESCE(json_agg(json_build_object(
      'caseId', ccl."caseId",
      'courseLevelId', ccl."courseLevelId",
      'courseLevel', json_build_object('id', cl.id, 'name', cl.name, 'sort', cl.sort)
    )), '[]'::json)
    FROM "CaseCourseLevel" ccl
    JOIN "CourseLevel" cl ON cl.id = ccl."courseLevelId"
    WHERE ccl."caseId" = c.id
  ) AS "caseCourseLevels",
  (SELECT COUNT(*)::int FROM "CaseSession" cs WHERE cs."caseId" = c.id) AS "sessionCount",
  (SELECT COUNT(*)::int FROM "CaseStage" st WHERE st."caseId" = c.id) AS "stageCount"
`;

export async function fetchCaseListForRole(
  role: Role,
  departmentId: string | null | undefined,
): Promise<CaseListItem[]> {
  const sql = getSql();
  let rows: CaseListRow[];
  if (role === "ADMIN") {
    rows = await sql.unsafe(
      `SELECT ${caseListSelect} FROM "Case" c ORDER BY c.title ASC`,
    );
  } else if (role === "TEACHER") {
    if (!departmentId) return [];
    rows = await sql.unsafe(
      `SELECT ${caseListSelect} FROM "Case" c WHERE c."departmentId" = $1 ORDER BY c.title ASC`,
      [departmentId],
    );
  } else {
    return [];
  }
  return rows.map(mapRow);
}
