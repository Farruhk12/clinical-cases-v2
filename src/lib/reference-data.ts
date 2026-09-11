import { getSql } from "./db";

export async function fetchReferenceData(opts: {
  role: string;
  departmentId?: string | null;
}) {
  const pool = getSql();
  const departments =
    opts.role === "ADMIN"
      ? await pool<{ id: string; name: string }[]>`
          SELECT id, name FROM "Department" ORDER BY name ASC
        `
      : opts.departmentId
        ? await pool<{ id: string; name: string }[]>`
            SELECT id, name FROM "Department" WHERE id = ${opts.departmentId}
          `
        : [];
  const faculties = await pool<{ id: string; name: string }[]>`
    SELECT id, name FROM "Faculty" ORDER BY name ASC
  `;
  const courseLevels = await pool<{ id: string; name: string; sort: number }[]>`
    SELECT id, name, sort FROM "CourseLevel" ORDER BY sort ASC
  `;
  return { departments, faculties, courseLevels };
}

export type LeaderCandidateUser = {
  id: string;
  name: string | null;
  login: string;
  role: string;
  departmentId: string | null;
};

export async function fetchLeaderCandidates(opts: {
  role: string;
  departmentId: string | null;
}): Promise<LeaderCandidateUser[]> {
  const pool = getSql();
  if (opts.role === "ADMIN") {
    return pool<LeaderCandidateUser[]>`
      SELECT id, name, login, role, "departmentId" FROM "User"
      WHERE role IN ('ADMIN', 'TEACHER')
      ORDER BY login ASC
    `;
  }
  if (opts.role === "TEACHER") {
    if (!opts.departmentId) {
      return pool<LeaderCandidateUser[]>`
        SELECT id, name, login, role, "departmentId" FROM "User" WHERE role = 'ADMIN' ORDER BY login ASC
      `;
    }
    return pool<LeaderCandidateUser[]>`
      SELECT id, name, login, role, "departmentId" FROM "User"
      WHERE role = 'ADMIN' OR (role = 'TEACHER' AND "departmentId" = ${opts.departmentId})
      ORDER BY login ASC
    `;
  }
  return [];
}

export async function fetchStaffPickListForDepartment(
  departmentId: string,
): Promise<LeaderCandidateUser[]> {
  const pool = getSql();
  return pool<LeaderCandidateUser[]>`
    SELECT id, name, login, role, "departmentId" FROM "User"
    WHERE role IN ('ADMIN', 'TEACHER')
    AND (role = 'ADMIN' OR "departmentId" = ${departmentId})
    ORDER BY login ASC
  `;
}

export async function fetchStudyGroupsEnriched() {
  const pool = getSql();
  const rows = await pool<
    {
      id: string;
      name: string;
      facultyId: string;
      courseLevelId: string;
      facultyName: string;
      courseLevelName: string;
      courseLevelSort: number;
    }[]
  >`
    SELECT g.id, g.name, g."facultyId", g."courseLevelId",
      f.name AS "facultyName", cl.name AS "courseLevelName", cl.sort AS "courseLevelSort"
    FROM "StudyGroup" g
    JOIN "Faculty" f ON f.id = g."facultyId"
    JOIN "CourseLevel" cl ON cl.id = g."courseLevelId"
    ORDER BY g.name ASC
  `;
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    facultyId: g.facultyId,
    courseLevelId: g.courseLevelId,
    faculty: { id: g.facultyId, name: g.facultyName },
    courseLevel: { id: g.courseLevelId, name: g.courseLevelName, sort: g.courseLevelSort },
    members: [] as {
      userId: string;
      user: { id: string; name: string | null; login: string };
    }[],
  }));
}
