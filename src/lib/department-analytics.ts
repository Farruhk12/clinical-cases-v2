import { getSql } from "./db";

export type DepartmentSummaryRow = {
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

export type StudyGroupStatsRow = {
  studyGroupId: string;
  studyGroupName: string;
  facultyName: string;
  courseLevelName: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  /** Среднее по полю averageScore в aiPreliminaryScores (0–100), только по сессиям с валидным числом */
  avgAiScore: number | null;
  sessionsWithAiScore: number;
  /** Средний балл преподавателя 0–100 (только числовые teacherGrade) */
  avgTeacherScore: number | null;
  sessionsWithTeacherNumericScore: number;
  /** Уникальные оценки преподавателя; числа как «NN/100» */
  teacherGradesSummary: string | null;
  /** Только текст комментариев преподавателя, разделитель • (оценка в отдельной колонке) */
  teacherEvaluationsText: string | null;
};

export type CaseStatsRow = {
  caseId: string;
  caseTitle: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  avgAiScore: number | null;
  sessionsWithAiScore: number;
  avgTeacherScore: number | null;
  sessionsWithTeacherNumericScore: number;
  teacherGradesSummary: string | null;
  teacherEvaluationsText: string | null;
};

/** Сводка по всем кафедрам (для администратора). */
export async function fetchAllDepartmentsSummary(): Promise<DepartmentSummaryRow[]> {
  const pool = getSql();
  const rows = await pool<DepartmentSummaryRow[]>`
    SELECT
      d.id AS "departmentId",
      d.name AS "departmentName",
      COUNT(DISTINCT cs.id)::int AS "sessionsTotal",
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'COMPLETED')::int AS "sessionsCompleted",
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'IN_PROGRESS')::int AS "sessionsInProgress",
      COUNT(DISTINCT cs."studyGroupId") FILTER (WHERE cs.id IS NOT NULL)::int AS "uniqueStudyGroups",
      COUNT(DISTINCT c.id)::int AS "casesTotal",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.status = 'COMPLETED' AND o.id IS NOT NULL
      )::int AS "sessionsWithOutcome",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.status = 'COMPLETED'
          AND o."teacherGrade" IS NOT NULL
          AND TRIM(o."teacherGrade") <> ''
      )::int AS "sessionsWithTeacherGrade",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE o."aiAnalysis" IS NOT NULL AND TRIM(o."aiAnalysis") <> ''
      )::int AS "sessionsWithAiAnalysis"
    FROM "Department" d
    LEFT JOIN "Case" c ON c."departmentId" = d.id
    LEFT JOIN "CaseSession" cs ON cs."caseId" = c.id
    LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
    GROUP BY d.id, d.name
    ORDER BY d.name ASC
  `;
  return rows;
}

/** Сводка по одной кафедре (те же поля, одна строка). */
export async function fetchDepartmentSummary(
  departmentId: string,
): Promise<DepartmentSummaryRow | null> {
  const pool = getSql();
  const rows = await pool<DepartmentSummaryRow[]>`
    SELECT
      d.id AS "departmentId",
      d.name AS "departmentName",
      COUNT(DISTINCT cs.id)::int AS "sessionsTotal",
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'COMPLETED')::int AS "sessionsCompleted",
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'IN_PROGRESS')::int AS "sessionsInProgress",
      COUNT(DISTINCT cs."studyGroupId") FILTER (WHERE cs.id IS NOT NULL)::int AS "uniqueStudyGroups",
      COUNT(DISTINCT c.id)::int AS "casesTotal",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.status = 'COMPLETED' AND o.id IS NOT NULL
      )::int AS "sessionsWithOutcome",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.status = 'COMPLETED'
          AND o."teacherGrade" IS NOT NULL
          AND TRIM(o."teacherGrade") <> ''
      )::int AS "sessionsWithTeacherGrade",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE o."aiAnalysis" IS NOT NULL AND TRIM(o."aiAnalysis") <> ''
      )::int AS "sessionsWithAiAnalysis"
    FROM "Department" d
    LEFT JOIN "Case" c ON c."departmentId" = d.id
    LEFT JOIN "CaseSession" cs ON cs."caseId" = c.id
    LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
    WHERE d.id = ${departmentId}
    GROUP BY d.id, d.name
  `;
  return rows[0] ?? null;
}

export async function fetchStudyGroupStatsForDepartment(
  departmentId: string,
): Promise<StudyGroupStatsRow[]> {
  const pool = getSql();
  return pool<StudyGroupStatsRow[]>`
    SELECT
      sg.id AS "studyGroupId",
      sg.name AS "studyGroupName",
      f.name AS "facultyName",
      cl.name AS "courseLevelName",
      COUNT(cs.id)::int AS "sessionsTotal",
      COUNT(cs.id) FILTER (WHERE cs.status = 'COMPLETED')::int AS "sessionsCompleted",
      COUNT(cs.id) FILTER (WHERE cs.status = 'IN_PROGRESS')::int AS "sessionsInProgress",
      (
        ROUND(
          AVG(
            (o."aiPreliminaryScores"->>'averageScore')::double precision
          ) FILTER (
            WHERE o."aiPreliminaryScores" IS NOT NULL
              AND jsonb_typeof(o."aiPreliminaryScores") = 'object'
              AND (o."aiPreliminaryScores"->>'averageScore') IS NOT NULL
              AND (o."aiPreliminaryScores"->>'averageScore') ~ '^[0-9]+(\\.[0-9]*)?$'
          )
        )
      )::int AS "avgAiScore",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE o."aiPreliminaryScores" IS NOT NULL
          AND jsonb_typeof(o."aiPreliminaryScores") = 'object'
          AND (o."aiPreliminaryScores"->>'averageScore') IS NOT NULL
          AND (o."aiPreliminaryScores"->>'averageScore') ~ '^[0-9]+(\\.[0-9]*)?$'
      )::int AS "sessionsWithAiScore",
      (
        ROUND(
          AVG(TRIM(o."teacherGrade")::double precision) FILTER (
            WHERE NULLIF(TRIM(o."teacherGrade"), '') IS NOT NULL
              AND TRIM(o."teacherGrade") ~ '^[0-9]+(\\.[0-9]*)?$'
              AND TRIM(o."teacherGrade")::numeric >= 0
              AND TRIM(o."teacherGrade")::numeric <= 100
          )
        )
      )::int AS "avgTeacherScore",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE NULLIF(TRIM(o."teacherGrade"), '') IS NOT NULL
          AND TRIM(o."teacherGrade") ~ '^[0-9]+(\\.[0-9]*)?$'
          AND TRIM(o."teacherGrade")::numeric >= 0
          AND TRIM(o."teacherGrade")::numeric <= 100
      )::int AS "sessionsWithTeacherNumericScore",
      NULLIF(
        ARRAY_TO_STRING(
          ARRAY_AGG(
            DISTINCT (
              CASE
                WHEN NULLIF(TRIM(o."teacherGrade"), '') IS NOT NULL
                  AND TRIM(o."teacherGrade") ~ '^[0-9]+(\\.[0-9]*)?$'
                  AND TRIM(o."teacherGrade")::numeric >= 0
                  AND TRIM(o."teacherGrade")::numeric <= 100
                THEN ROUND(TRIM(o."teacherGrade")::numeric)::text || '/100'
                ELSE NULLIF(TRIM(o."teacherGrade"), '')
              END
            )
          ) FILTER (
            WHERE o."teacherGrade" IS NOT NULL AND TRIM(o."teacherGrade") <> ''
          ),
          ', '
        ),
        ''
      ) AS "teacherGradesSummary",
      NULLIF(
        STRING_AGG(
          LEFT(TRIM(o."teacherComment"), 400),
          ' • '
          ORDER BY cs."completedAt" DESC NULLS LAST
        ) FILTER (
          WHERE o."teacherComment" IS NOT NULL AND TRIM(o."teacherComment") <> ''
        ),
        ''
      ) AS "teacherEvaluationsText"
    FROM "CaseSession" cs
    INNER JOIN "Case" c ON c.id = cs."caseId"
    INNER JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
    INNER JOIN "Faculty" f ON f.id = sg."facultyId"
    INNER JOIN "CourseLevel" cl ON cl.id = sg."courseLevelId"
    LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
    WHERE c."departmentId" = ${departmentId}
    GROUP BY sg.id, sg.name, f.name, cl.name
    ORDER BY sg.name ASC
  `;
}

export async function fetchCaseStatsForDepartment(
  departmentId: string,
): Promise<CaseStatsRow[]> {
  const pool = getSql();
  return pool<CaseStatsRow[]>`
    SELECT
      c.id AS "caseId",
      c.title AS "caseTitle",
      COUNT(cs.id)::int AS "sessionsTotal",
      COUNT(cs.id) FILTER (WHERE cs.status = 'COMPLETED')::int AS "sessionsCompleted",
      COUNT(cs.id) FILTER (WHERE cs.status = 'IN_PROGRESS')::int AS "sessionsInProgress",
      (
        ROUND(
          AVG(
            (o."aiPreliminaryScores"->>'averageScore')::double precision
          ) FILTER (
            WHERE o."aiPreliminaryScores" IS NOT NULL
              AND jsonb_typeof(o."aiPreliminaryScores") = 'object'
              AND (o."aiPreliminaryScores"->>'averageScore') IS NOT NULL
              AND (o."aiPreliminaryScores"->>'averageScore') ~ '^[0-9]+(\\.[0-9]*)?$'
          )
        )
      )::int AS "avgAiScore",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE o."aiPreliminaryScores" IS NOT NULL
          AND jsonb_typeof(o."aiPreliminaryScores") = 'object'
          AND (o."aiPreliminaryScores"->>'averageScore') IS NOT NULL
          AND (o."aiPreliminaryScores"->>'averageScore') ~ '^[0-9]+(\\.[0-9]*)?$'
      )::int AS "sessionsWithAiScore",
      (
        ROUND(
          AVG(TRIM(o."teacherGrade")::double precision) FILTER (
            WHERE NULLIF(TRIM(o."teacherGrade"), '') IS NOT NULL
              AND TRIM(o."teacherGrade") ~ '^[0-9]+(\\.[0-9]*)?$'
              AND TRIM(o."teacherGrade")::numeric >= 0
              AND TRIM(o."teacherGrade")::numeric <= 100
          )
        )
      )::int AS "avgTeacherScore",
      COUNT(DISTINCT cs.id) FILTER (
        WHERE NULLIF(TRIM(o."teacherGrade"), '') IS NOT NULL
          AND TRIM(o."teacherGrade") ~ '^[0-9]+(\\.[0-9]*)?$'
          AND TRIM(o."teacherGrade")::numeric >= 0
          AND TRIM(o."teacherGrade")::numeric <= 100
      )::int AS "sessionsWithTeacherNumericScore",
      NULLIF(
        ARRAY_TO_STRING(
          ARRAY_AGG(
            DISTINCT (
              CASE
                WHEN NULLIF(TRIM(o."teacherGrade"), '') IS NOT NULL
                  AND TRIM(o."teacherGrade") ~ '^[0-9]+(\\.[0-9]*)?$'
                  AND TRIM(o."teacherGrade")::numeric >= 0
                  AND TRIM(o."teacherGrade")::numeric <= 100
                THEN ROUND(TRIM(o."teacherGrade")::numeric)::text || '/100'
                ELSE NULLIF(TRIM(o."teacherGrade"), '')
              END
            )
          ) FILTER (
            WHERE o."teacherGrade" IS NOT NULL AND TRIM(o."teacherGrade") <> ''
          ),
          ', '
        ),
        ''
      ) AS "teacherGradesSummary",
      NULLIF(
        STRING_AGG(
          LEFT(TRIM(o."teacherComment"), 400),
          ' • '
          ORDER BY cs."completedAt" DESC NULLS LAST
        ) FILTER (
          WHERE o."teacherComment" IS NOT NULL AND TRIM(o."teacherComment") <> ''
        ),
        ''
      ) AS "teacherEvaluationsText"
    FROM "Case" c
    LEFT JOIN "CaseSession" cs ON cs."caseId" = c.id
    LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
    WHERE c."departmentId" = ${departmentId}
    GROUP BY c.id, c.title
    ORDER BY c.title ASC
  `;
}
