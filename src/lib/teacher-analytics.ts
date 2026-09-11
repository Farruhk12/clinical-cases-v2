import { getSql } from "./db";
import { groupGuestStudents } from "./guest-student-scores";
import { toJsonIsoUtc } from "./to-json-iso-utc";
import type {
  AnalyticsSessionDetail,
  AnalyticsSessionStage,
  AnalyticsSessionStudent,
  GradeBucket,
  TeacherAnalyticsKpis,
  TeacherAnalyticsPayload,
  TeacherSessionRow,
  TeacherStageRow,
  TeacherStudentRow,
} from "./teacher-analytics-types";

type SessionDbRow = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: Date;
  completedAt: Date | null;
  caseId: string;
  caseTitle: string;
  studyGroupId: string;
  groupName: string;
  teacherGrade: string | null;
  aiScoreRaw: string | null;
};

type CountRow = { caseSessionId: string; n: number };

type GuestIdeaDb = {
  id: string;
  caseSessionId: string;
  caseStageId: string;
  guestKey: string;
  displayName: string;
  kind: "HYPOTHESIS" | "QUESTION";
  text: string;
  createdAt: Date;
  takenAt: Date | null;
  stageOrder: number;
  stageTitle: string;
};

type StageDb = {
  caseSessionId: string;
  caseId: string;
  caseTitle: string;
  stageOrder: number;
  stageTitle: string;
  openedAt: Date | null;
  submittedAt: Date | null;
  officialHypos: number;
  officialQuestions: number;
};

function parseScore(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

/** Дольше 8 часов — занятие забыли закрыть, в среднее не берём. */
const MAX_LESSON_MIN = 8 * 60;

function minutesBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min > MAX_LESSON_MIN) return null;
  return min;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function bucketLabel(score: number): GradeBucket["label"] {
  if (score < 41) return "0–40";
  if (score < 61) return "41–60";
  if (score < 81) return "61–80";
  return "81–100";
}

function emptyBuckets(): GradeBucket[] {
  return ["0–40", "41–60", "61–80", "81–100"].map((label) => ({
    label,
    teacher: 0,
    ai: 0,
    student: 0,
  }));
}

export async function fetchTeacherAnalytics(opts: {
  departmentId: string;
  groupId?: string;
  caseId?: string;
}): Promise<TeacherAnalyticsPayload | null> {
  const pool = getSql();
  const dept = await pool<{ id: string; name: string }[]>`
    SELECT id, name FROM "Department" WHERE id = ${opts.departmentId} LIMIT 1
  `;
  const department = dept[0];
  if (!department) return null;

  const groupFilter = opts.groupId?.trim() || null;
  const caseFilter = opts.caseId?.trim() || null;

  const [sessions, allGroups, allCases, casesTotal] = await Promise.all([
    pool<SessionDbRow[]>`
      SELECT
        cs.id,
        cs.status,
        cs."startedAt",
        cs."completedAt",
        c.id AS "caseId",
        c.title AS "caseTitle",
        sg.id AS "studyGroupId",
        sg.name AS "groupName",
        o."teacherGrade",
        o."aiPreliminaryScores"->>'averageScore' AS "aiScoreRaw"
      FROM "CaseSession" cs
      JOIN "Case" c ON c.id = cs."caseId"
      JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
      LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
      WHERE c."departmentId" = ${opts.departmentId}
        AND (${groupFilter}::text IS NULL OR cs."studyGroupId" = ${groupFilter})
        AND (${caseFilter}::text IS NULL OR cs."caseId" = ${caseFilter})
      ORDER BY cs."startedAt" DESC
    `,
    pool<{ id: string; label: string }[]>`
      SELECT DISTINCT sg.id, sg.name AS label
      FROM "CaseSession" cs
      JOIN "Case" c ON c.id = cs."caseId"
      JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
      WHERE c."departmentId" = ${opts.departmentId}
      ORDER BY sg.name ASC
    `,
    pool<{ id: string; label: string }[]>`
      SELECT c.id, c.title AS label
      FROM "Case" c
      WHERE c."departmentId" = ${opts.departmentId}
      ORDER BY c.title ASC
    `,
    pool<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM "Case" c
      WHERE c."departmentId" = ${opts.departmentId}
    `,
  ]);

  const ids = sessions.map((s) => s.id);
  const hypoMap = new Map<string, number>();
  const qMap = new Map<string, number>();
  const ideasBySession = new Map<string, GuestIdeaDb[]>();
  const stagesBySession = new Map<string, StageDb[]>();

  if (ids.length > 0) {
    const [hypos, questions, ideas, stages] = await Promise.all([
      pool<CountRow[]>`
        SELECT s."caseSessionId", COUNT(*)::int AS n
        FROM "Hypothesis" h
        JOIN "StageSubmission" s ON s.id = h."stageSubmissionId"
        WHERE s."caseSessionId" = ANY(${pool.array(ids)})
          AND NULLIF(TRIM(h.text), '') IS NOT NULL
        GROUP BY s."caseSessionId"
      `,
      pool<CountRow[]>`
        SELECT s."caseSessionId", COUNT(*)::int AS n
        FROM "StudentQuestion" q
        JOIN "StageSubmission" s ON s.id = q."stageSubmissionId"
        WHERE s."caseSessionId" = ANY(${pool.array(ids)})
          AND NULLIF(TRIM(q.text), '') IS NOT NULL
        GROUP BY s."caseSessionId"
      `,
      pool<GuestIdeaDb[]>`
        SELECT
          gi.id, gi."caseSessionId", gi."caseStageId", gi."guestKey",
          gi."displayName", gi.kind, gi.text, gi."createdAt", gi."takenAt",
          st."order" AS "stageOrder", st.title AS "stageTitle"
        FROM "SessionGuestIdea" gi
        JOIN "CaseStage" st ON st.id = gi."caseStageId"
        WHERE gi."caseSessionId" = ANY(${pool.array(ids)})
        ORDER BY gi."createdAt" ASC
      `,
      pool<StageDb[]>`
        SELECT
          ss."caseSessionId",
          st."caseId",
          c.title AS "caseTitle",
          st."order" AS "stageOrder",
          st.title AS "stageTitle",
          ss."openedAt",
          ss."submittedAt",
          (
            SELECT COUNT(*)::int
            FROM "Hypothesis" h
            WHERE h."stageSubmissionId" = ss.id
              AND NULLIF(TRIM(h.text), '') IS NOT NULL
          ) AS "officialHypos",
          (
            SELECT COUNT(*)::int
            FROM "StudentQuestion" q
            WHERE q."stageSubmissionId" = ss.id
              AND NULLIF(TRIM(q.text), '') IS NOT NULL
          ) AS "officialQuestions"
        FROM "StageSubmission" ss
        JOIN "CaseStage" st ON st.id = ss."caseStageId"
        JOIN "Case" c ON c.id = st."caseId"
        WHERE ss."caseSessionId" = ANY(${pool.array(ids)})
        ORDER BY st."order" ASC
      `,
    ]);
    for (const row of hypos) hypoMap.set(row.caseSessionId, row.n);
    for (const row of questions) qMap.set(row.caseSessionId, row.n);
    for (const idea of ideas) {
      const list = ideasBySession.get(idea.caseSessionId) ?? [];
      list.push(idea);
      ideasBySession.set(idea.caseSessionId, list);
    }
    for (const stage of stages) {
      const list = stagesBySession.get(stage.caseSessionId) ?? [];
      list.push(stage);
      stagesBySession.set(stage.caseSessionId, list);
    }
  }

  const sessionRows: TeacherSessionRow[] = sessions.map((s) => {
    const ideas = ideasBySession.get(s.id) ?? [];
    const students = groupGuestStudents(
      ideas.map((i) => ({
        guestKey: i.guestKey,
        displayName: i.displayName,
        kind: i.kind,
        text: i.text,
        takenAt: i.takenAt ? i.takenAt.toISOString() : null,
        caseStageId: i.caseStageId,
        stageOrder: i.stageOrder,
      })),
    );
    const durationMin =
      s.status === "COMPLETED"
        ? minutesBetween(s.startedAt, s.completedAt)
        : minutesBetween(s.startedAt, new Date());
    return {
      id: s.id,
      status: s.status,
      startedAt: toJsonIsoUtc(s.startedAt) ?? s.startedAt.toISOString(),
      completedAt: toJsonIsoUtc(s.completedAt) ?? null,
      durationMin,
      caseId: s.caseId,
      caseTitle: s.caseTitle,
      studyGroupId: s.studyGroupId,
      groupName: s.groupName,
      teacherGrade: parseScore(s.teacherGrade),
      aiScore: parseScore(s.aiScoreRaw),
      officialHypos: hypoMap.get(s.id) ?? 0,
      officialQuestions: qMap.get(s.id) ?? 0,
      guestStudents: students.length,
      guestIdeas: ideas.length,
      takenIdeas: ideas.filter((i) => i.takenAt).length,
      avgStudentScore: avg(students.map((st) => st.score)),
    };
  });

  const studentsByName = new Map<
    string,
    {
      displayName: string;
      scores: number[];
      sessions: Set<string>;
      hypothesisCount: number;
      questionCount: number;
      takenCount: number;
      lastSessionAt: string | null;
      lastCaseTitle: string | null;
    }
  >();

  for (const session of sessionRows) {
    const ideas = ideasBySession.get(session.id) ?? [];
    const grouped = groupGuestStudents(
      ideas.map((i) => ({
        guestKey: i.guestKey,
        displayName: i.displayName,
        kind: i.kind,
        text: i.text,
        takenAt: i.takenAt ? i.takenAt.toISOString() : null,
        caseStageId: i.caseStageId,
        stageOrder: i.stageOrder,
      })),
    );
    for (const student of grouped) {
      const key = student.displayName.trim().toLowerCase();
      const bucket = studentsByName.get(key) ?? {
        displayName: student.displayName,
        scores: [],
        sessions: new Set<string>(),
        hypothesisCount: 0,
        questionCount: 0,
        takenCount: 0,
        lastSessionAt: null,
        lastCaseTitle: null,
      };
      bucket.scores.push(student.score);
      bucket.sessions.add(session.id);
      bucket.hypothesisCount += student.hypothesisCount;
      bucket.questionCount += student.questionCount;
      bucket.takenCount += student.takenCount;
      if (
        !bucket.lastSessionAt ||
        session.startedAt > bucket.lastSessionAt
      ) {
        bucket.lastSessionAt = session.startedAt;
        bucket.lastCaseTitle = session.caseTitle;
      }
      studentsByName.set(key, bucket);
    }
  }

  const students: TeacherStudentRow[] = [...studentsByName.values()]
    .map((b) => ({
      displayName: b.displayName,
      sessionCount: b.sessions.size,
      hypothesisCount: b.hypothesisCount,
      questionCount: b.questionCount,
      takenCount: b.takenCount,
      avgScore: avg(b.scores) ?? 0,
      lastSessionAt: b.lastSessionAt,
      lastCaseTitle: b.lastCaseTitle,
    }))
    .sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return a.displayName.localeCompare(b.displayName, "ru");
    });

  const stageAcc = new Map<
    string,
    {
      caseId: string;
      caseTitle: string;
      stageOrder: number;
      stageTitle: string;
      durations: number[];
      hypos: number[];
      questions: number[];
      guestIdeas: number;
      takenIdeas: number;
      sessions: Set<string>;
    }
  >();

  for (const session of sessionRows) {
    const ideas = ideasBySession.get(session.id) ?? [];
    for (const stage of stagesBySession.get(session.id) ?? []) {
      const key = `${stage.caseId}:${stage.stageOrder}`;
      const acc = stageAcc.get(key) ?? {
        caseId: stage.caseId,
        caseTitle: stage.caseTitle,
        stageOrder: stage.stageOrder,
        stageTitle: stage.stageTitle,
        durations: [],
        hypos: [],
        questions: [],
        guestIdeas: 0,
        takenIdeas: 0,
        sessions: new Set<string>(),
      };
      acc.sessions.add(session.id);
      const dur = minutesBetween(stage.openedAt, stage.submittedAt);
      if (dur != null) acc.durations.push(dur);
      acc.hypos.push(stage.officialHypos);
      acc.questions.push(stage.officialQuestions);
      const stageIdeas = ideas.filter((i) => i.stageOrder === stage.stageOrder);
      acc.guestIdeas += stageIdeas.length;
      acc.takenIdeas += stageIdeas.filter((i) => i.takenAt).length;
      stageAcc.set(key, acc);
    }
  }

  const stages: TeacherStageRow[] = [...stageAcc.values()]
    .map((s) => ({
      caseId: s.caseId,
      caseTitle: s.caseTitle,
      stageOrder: s.stageOrder,
      stageTitle: s.stageTitle,
      sessions: s.sessions.size,
      avgDurationMin: avg(s.durations),
      avgOfficialHypos: avg(s.hypos) ?? 0,
      avgOfficialQuestions: avg(s.questions) ?? 0,
      guestIdeas: s.guestIdeas,
      takenIdeas: s.takenIdeas,
    }))
    .sort((a, b) => {
      const t = a.caseTitle.localeCompare(b.caseTitle, "ru");
      if (t !== 0) return t;
      return a.stageOrder - b.stageOrder;
    });

  const gradeBuckets = emptyBuckets();
  const bump = (kind: "teacher" | "ai" | "student", score: number | null) => {
    if (score == null) return;
    const row = gradeBuckets.find((b) => b.label === bucketLabel(score));
    if (row) row[kind] += 1;
  };
  for (const s of sessionRows) {
    bump("teacher", s.teacherGrade);
    bump("ai", s.aiScore);
    bump("student", s.avgStudentScore);
  }

  const completed = sessionRows.filter((s) => s.status === "COMPLETED");
  const kpis: TeacherAnalyticsKpis = {
    departmentId: department.id,
    departmentName: department.name,
    sessionsTotal: sessionRows.length,
    sessionsCompleted: completed.length,
    sessionsInProgress: sessionRows.filter((s) => s.status === "IN_PROGRESS")
      .length,
    needGrade: completed.filter((s) => s.teacherGrade == null).length,
    uniqueStudyGroups: new Set(sessionRows.map((s) => s.studyGroupId)).size,
    casesTotal: casesTotal[0]?.n ?? allCases.length,
    sessionsWithTeacherGrade: sessionRows.filter((s) => s.teacherGrade != null)
      .length,
    sessionsWithAiAnalysis: sessionRows.filter((s) => s.aiScore != null).length,
    avgTeacherScore: avg(
      sessionRows.flatMap((s) => (s.teacherGrade != null ? [s.teacherGrade] : [])),
    ),
    avgAiScore: avg(
      sessionRows.flatMap((s) => (s.aiScore != null ? [s.aiScore] : [])),
    ),
    guestStudents: students.length,
    guestIdeas: sessionRows.reduce((n, s) => n + s.guestIdeas, 0),
    takenIdeas: sessionRows.reduce((n, s) => n + s.takenIdeas, 0),
    avgStudentScore: avg(students.map((s) => s.avgScore)),
    avgDurationMin: avg(
      completed.flatMap((s) => (s.durationMin != null ? [s.durationMin] : [])),
    ),
  };

  return {
    kpis,
    filters: { groups: allGroups, cases: allCases },
    sessions: sessionRows,
    students,
    stages,
    gradeBuckets,
  };
}

export async function fetchAnalyticsSessionDetail(
  sessionId: string,
  departmentId: string | null,
  isAdmin: boolean,
): Promise<AnalyticsSessionDetail | null> {
  const pool = getSql();
  const rows = await pool<
    (SessionDbRow & { departmentId: string })[]
  >`
    SELECT
      cs.id,
      cs.status,
      cs."startedAt",
      cs."completedAt",
      c.id AS "caseId",
      c.title AS "caseTitle",
      c."departmentId",
      sg.id AS "studyGroupId",
      sg.name AS "groupName",
      o."teacherGrade",
      o."aiPreliminaryScores"->>'averageScore' AS "aiScoreRaw"
    FROM "CaseSession" cs
    JOIN "Case" c ON c.id = cs."caseId"
    JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
    LEFT JOIN "SessionOutcome" o ON o."caseSessionId" = cs.id
    WHERE cs.id = ${sessionId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (!isAdmin && row.departmentId !== departmentId) return null;

  const [hypo, question, ideas] = await Promise.all([
    pool<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM "Hypothesis" h
      JOIN "StageSubmission" s ON s.id = h."stageSubmissionId"
      WHERE s."caseSessionId" = ${sessionId}
        AND NULLIF(TRIM(h.text), '') IS NOT NULL
    `,
    pool<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM "StudentQuestion" q
      JOIN "StageSubmission" s ON s.id = q."stageSubmissionId"
      WHERE s."caseSessionId" = ${sessionId}
        AND NULLIF(TRIM(q.text), '') IS NOT NULL
    `,
    pool<GuestIdeaDb[]>`
      SELECT
        gi.id, gi."caseSessionId", gi."caseStageId", gi."guestKey",
        gi."displayName", gi.kind, gi.text, gi."createdAt", gi."takenAt",
        st."order" AS "stageOrder", st.title AS "stageTitle"
      FROM "SessionGuestIdea" gi
      JOIN "CaseStage" st ON st.id = gi."caseStageId"
      WHERE gi."caseSessionId" = ${sessionId}
    `,
  ]);

  const students = groupGuestStudents(
    ideas.map((i) => ({
      guestKey: i.guestKey,
      displayName: i.displayName,
      kind: i.kind,
      text: i.text,
      takenAt: i.takenAt ? i.takenAt.toISOString() : null,
      caseStageId: i.caseStageId,
      stageOrder: i.stageOrder,
    })),
  );

  const session: TeacherSessionRow = {
    id: row.id,
    status: row.status,
    startedAt: toJsonIsoUtc(row.startedAt) ?? row.startedAt.toISOString(),
    completedAt: toJsonIsoUtc(row.completedAt) ?? null,
    durationMin:
      row.status === "COMPLETED"
        ? minutesBetween(row.startedAt, row.completedAt)
        : minutesBetween(row.startedAt, new Date()),
    caseId: row.caseId,
    caseTitle: row.caseTitle,
    studyGroupId: row.studyGroupId,
    groupName: row.groupName,
    teacherGrade: parseScore(row.teacherGrade),
    aiScore: parseScore(row.aiScoreRaw),
    officialHypos: hypo[0]?.n ?? 0,
    officialQuestions: question[0]?.n ?? 0,
    guestStudents: students.length,
    guestIdeas: ideas.length,
    takenIdeas: ideas.filter((i) => i.takenAt).length,
    avgStudentScore: avg(students.map((s) => s.score)),
  };

  return loadSessionDetail(session);
}

async function loadSessionDetail(
  session: TeacherSessionRow,
): Promise<AnalyticsSessionDetail> {
  const pool = getSql();
  const [ideas, stages] = await Promise.all([
    pool<GuestIdeaDb[]>`
      SELECT
        gi.id, gi."caseSessionId", gi."caseStageId", gi."guestKey",
        gi."displayName", gi.kind, gi.text, gi."createdAt", gi."takenAt",
        st."order" AS "stageOrder", st.title AS "stageTitle"
      FROM "SessionGuestIdea" gi
      JOIN "CaseStage" st ON st.id = gi."caseStageId"
      WHERE gi."caseSessionId" = ${session.id}
      ORDER BY gi."createdAt" ASC
    `,
    pool<StageDb[]>`
      SELECT
        ss."caseSessionId",
        st."caseId",
        c.title AS "caseTitle",
        st."order" AS "stageOrder",
        st.title AS "stageTitle",
        ss."openedAt",
        ss."submittedAt",
        (
          SELECT COUNT(*)::int
          FROM "Hypothesis" h
          WHERE h."stageSubmissionId" = ss.id
            AND NULLIF(TRIM(h.text), '') IS NOT NULL
        ) AS "officialHypos",
        (
          SELECT COUNT(*)::int
          FROM "StudentQuestion" q
          WHERE q."stageSubmissionId" = ss.id
            AND NULLIF(TRIM(q.text), '') IS NOT NULL
        ) AS "officialQuestions"
      FROM "StageSubmission" ss
      JOIN "CaseStage" st ON st.id = ss."caseStageId"
      JOIN "Case" c ON c.id = st."caseId"
      WHERE ss."caseSessionId" = ${session.id}
      ORDER BY st."order" ASC
    `,
  ]);

  const students: AnalyticsSessionStudent[] = groupGuestStudents(
    ideas.map((i) => ({
      guestKey: i.guestKey,
      displayName: i.displayName,
      kind: i.kind,
      text: i.text,
      takenAt: i.takenAt ? i.takenAt.toISOString() : null,
      caseStageId: i.caseStageId,
      stageOrder: i.stageOrder,
    })),
  ).map((s) => ({
    guestKey: s.guestKey,
    displayName: s.displayName,
    score: s.score,
    hypothesisCount: s.hypothesisCount,
    questionCount: s.questionCount,
    takenCount: s.takenCount,
    ideas: s.ideas.map((idea) => {
      const src = ideas.find(
        (row) =>
          row.text === idea.text &&
          row.kind === idea.kind &&
          row.guestKey === s.guestKey,
      );
      return {
        kind: idea.kind,
        text: idea.text,
        takenAt: idea.takenAt,
        stageOrder: src?.stageOrder ?? idea.stageOrder,
        stageTitle: src?.stageTitle,
      };
    }),
  }));

  const stageRows: AnalyticsSessionStage[] = stages.map((st) => {
    const stageIdeas = ideas.filter((i) => i.stageOrder === st.stageOrder);
    return {
      stageOrder: st.stageOrder,
      stageTitle: st.stageTitle,
      openedAt: toJsonIsoUtc(st.openedAt) ?? null,
      submittedAt: toJsonIsoUtc(st.submittedAt) ?? null,
      durationMin: minutesBetween(st.openedAt, st.submittedAt),
      officialHypos: st.officialHypos,
      officialQuestions: st.officialQuestions,
      guestIdeas: stageIdeas.length,
      takenIdeas: stageIdeas.filter((i) => i.takenAt).length,
    };
  });

  return { session, students, stages: stageRows };
}
