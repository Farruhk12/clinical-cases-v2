import { asTransactionSql, getSql } from "./db";
import { randomUUID } from "crypto";

export type DraftItem = { text: string; lineageId?: string };

type ActiveSessionStage = {
  session: {
    id: string;
    status: string;
    currentStageOrder: number;
    caseId: string;
  };
  currentStageId: string;
};

async function loadActiveSessionStage(
  sessionId: string,
): Promise<ActiveSessionStage> {
  const pool = getSql();
  const rows = await pool<
    {
      id: string;
      status: string;
      currentStageOrder: number;
      caseId: string;
      currentStageId: string | null;
    }[]
  >`
    SELECT
      cs.id,
      cs.status,
      cs."currentStageOrder",
      cs."caseId",
      st.id AS "currentStageId"
    FROM "CaseSession" cs
    LEFT JOIN "CaseStage" st
      ON st."caseId" = cs."caseId"
     AND st."order" = cs."currentStageOrder"
    WHERE cs.id = ${sessionId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("SESSION_NOT_FOUND");
  if (row.status !== "IN_PROGRESS") throw new Error("SESSION_CLOSED");
  if (!row.currentStageId) throw new Error("STAGE_NOT_FOUND");
  return {
    session: {
      id: row.id,
      status: row.status,
      currentStageOrder: row.currentStageOrder,
      caseId: row.caseId,
    },
    currentStageId: row.currentStageId,
  };
}

export async function updateSessionDraft(
  sessionId: string,
  items: { hypotheses: DraftItem[]; questions: DraftItem[] },
) {
  const pool = getSql();
  const { session, currentStageId } = await loadActiveSessionStage(sessionId);

  const subRows = await pool<{ id: string; submittedAt: Date | null }[]>`
    SELECT id, "submittedAt" FROM "StageSubmission"
    WHERE "caseSessionId" = ${session.id} AND "caseStageId" = ${currentStageId}
    LIMIT 1
  `;
  const submission = subRows[0];
  if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
  if (submission.submittedAt) throw new Error("STAGE_ALREADY_SUBMITTED");

  await pool.begin(async (txn) => {
    const sql = asTransactionSql(pool, txn);
    await sql`DELETE FROM "Hypothesis" WHERE "stageSubmissionId" = ${submission.id}`;
    await sql`DELETE FROM "StudentQuestion" WHERE "stageSubmissionId" = ${submission.id}`;
    for (let i = 0; i < items.hypotheses.length; i++) {
      const h = items.hypotheses[i];
      await sql`
        INSERT INTO "Hypothesis" (id, "stageSubmissionId", text, "lineageId", sort)
        VALUES (${randomUUID()}, ${submission.id}, ${h.text}, ${h.lineageId ?? randomUUID()}, ${i})
      `;
    }
    for (let i = 0; i < items.questions.length; i++) {
      const q = items.questions[i];
      await sql`
        INSERT INTO "StudentQuestion" (id, "stageSubmissionId", text, "lineageId", sort)
        VALUES (${randomUUID()}, ${submission.id}, ${q.text}, ${q.lineageId ?? randomUUID()}, ${i})
      `;
    }
  });

  return { ok: true as const };
}

export async function advanceSession(sessionId: string) {
  const pool = getSql();
  const { session, currentStageId } = await loadActiveSessionStage(sessionId);

  const now = new Date();

  const subRows = await pool<
    { id: string; submittedAt: Date | null }[]
  >`
    SELECT id, "submittedAt" FROM "StageSubmission"
    WHERE "caseSessionId" = ${session.id} AND "caseStageId" = ${currentStageId}
    LIMIT 1
  `;
  const currentSubmission = subRows[0];
  if (!currentSubmission) throw new Error("SUBMISSION_NOT_FOUND");
  if (currentSubmission.submittedAt) throw new Error("STAGE_ALREADY_SUBMITTED");

  const hypRows = await pool<
    { id: string; text: string; lineageId: string; sort: number }[]
  >`
    SELECT id, text, "lineageId", sort FROM "Hypothesis"
    WHERE "stageSubmissionId" = ${currentSubmission.id} ORDER BY sort
  `;
  const qRows = await pool<
    { id: string; text: string; lineageId: string; sort: number }[]
  >`
    SELECT id, text, "lineageId", sort FROM "StudentQuestion"
    WHERE "stageSubmissionId" = ${currentSubmission.id} ORDER BY sort
  `;

  const [nextStage] = await pool<{ id: string; order: number }[]>`
    SELECT id, "order"
    FROM "CaseStage"
    WHERE "caseId" = ${session.caseId} AND "order" > ${session.currentStageOrder}
    ORDER BY "order" ASC
    LIMIT 1
  `;

  await pool`UPDATE "StageSubmission" SET "submittedAt" = ${now} WHERE id = ${currentSubmission.id}`;

  if (!nextStage) {
    await pool`
      UPDATE "CaseSession" SET status = 'COMPLETED', "completedAt" = ${now} WHERE id = ${session.id}
    `;
    const oid = randomUUID();
    await pool`
      INSERT INTO "SessionOutcome" (id, "caseSessionId")
      VALUES (${oid}, ${session.id})
      ON CONFLICT ("caseSessionId") DO NOTHING
    `;
    return { completed: true as const };
  }

  await pool`
    UPDATE "CaseSession" SET "currentStageOrder" = ${nextStage.order} WHERE id = ${session.id}
  `;

  const newSubId = randomUUID();
  await pool.begin(async (txn) => {
    const sql = asTransactionSql(pool, txn);
    await sql`
      INSERT INTO "StageSubmission" (id, "caseSessionId", "caseStageId", "openedAt")
      VALUES (${newSubId}, ${session.id}, ${nextStage.id}, ${now})
    `;
    for (let i = 0; i < hypRows.length; i++) {
      const h = hypRows[i];
      await sql`
        INSERT INTO "Hypothesis" (id, "stageSubmissionId", text, "lineageId", sort)
        VALUES (${randomUUID()}, ${newSubId}, ${h.text}, ${h.lineageId}, ${i})
      `;
    }
    for (let i = 0; i < qRows.length; i++) {
      const q = qRows[i];
      await sql`
        INSERT INTO "StudentQuestion" (id, "stageSubmissionId", text, "lineageId", sort)
        VALUES (${randomUUID()}, ${newSubId}, ${q.text}, ${q.lineageId}, ${i})
      `;
    }
  });

  return { completed: false as const, nextStageOrder: nextStage.order };
}

export async function forceCompleteSession(sessionId: string) {
  const pool = getSql();
  const { session, currentStageId } = await loadActiveSessionStage(sessionId);

  const now = new Date();

  const subRows = await pool<{ id: string; submittedAt: Date | null }[]>`
    SELECT id, "submittedAt" FROM "StageSubmission"
    WHERE "caseSessionId" = ${session.id} AND "caseStageId" = ${currentStageId}
    LIMIT 1
  `;
  const currentSubmission = subRows[0];
  if (!currentSubmission) throw new Error("SUBMISSION_NOT_FOUND");
  if (!currentSubmission.submittedAt) {
    await pool`
      UPDATE "StageSubmission" SET "submittedAt" = ${now} WHERE id = ${currentSubmission.id}
    `;
  }

  await pool`
    UPDATE "CaseSession" SET status = 'COMPLETED', "completedAt" = ${now} WHERE id = ${session.id}
  `;
  const oid = randomUUID();
  await pool`
    INSERT INTO "SessionOutcome" (id, "caseSessionId")
    VALUES (${oid}, ${session.id})
    ON CONFLICT ("caseSessionId") DO NOTHING
  `;

  return { completed: true as const };
}

function sessionGroupKey(caseId: string, studyGroupId: string) {
  return `${caseId}:${studyGroupId}`;
}

/**
 * Среди нескольких IN_PROGRESS на один кейс+группу оставляет занятие
 * с более поздним этапом (при равенстве — более позднее startedAt),
 * остальные закрывает. Старые дубли больше не висят «в процессе».
 */
export async function closeStaleDuplicateInProgressSessions(): Promise<{
  closedIds: string[];
  keptIds: string[];
}> {
  const pool = getSql();
  const rows = await pool<
    {
      id: string;
      caseId: string;
      studyGroupId: string;
      currentStageOrder: number;
      startedAt: Date;
    }[]
  >`
    SELECT id, "caseId", "studyGroupId", "currentStageOrder", "startedAt"
    FROM "CaseSession"
    WHERE status = 'IN_PROGRESS'
    ORDER BY "currentStageOrder" DESC, "startedAt" DESC
  `;

  const seen = new Set<string>();
  const keptIds: string[] = [];
  const closeIds: string[] = [];
  for (const row of rows) {
    const key = sessionGroupKey(row.caseId, row.studyGroupId);
    if (!seen.has(key)) {
      seen.add(key);
      keptIds.push(row.id);
    } else {
      closeIds.push(row.id);
    }
  }

  for (const id of closeIds) {
    try {
      await forceCompleteSession(id);
    } catch {
      const now = new Date();
      await pool`
        UPDATE "CaseSession"
        SET status = 'COMPLETED', "completedAt" = ${now}
        WHERE id = ${id} AND status = 'IN_PROGRESS'
      `;
      const oid = randomUUID();
      await pool`
        INSERT INTO "SessionOutcome" (id, "caseSessionId")
        VALUES (${oid}, ${id})
        ON CONFLICT ("caseSessionId") DO NOTHING
      `;
    }
  }

  return { closedIds: closeIds, keptIds };
}
