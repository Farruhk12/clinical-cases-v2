import { randomUUID } from "crypto";
import { getSql } from "./db";

export const GUEST_IDEA_KINDS = ["HYPOTHESIS", "QUESTION"] as const;
export type GuestIdeaKind = (typeof GUEST_IDEA_KINDS)[number];

export type GuestIdeaRow = {
  id: string;
  caseSessionId: string;
  caseStageId: string;
  guestKey: string;
  displayName: string;
  kind: GuestIdeaKind;
  text: string;
  createdAt: Date;
  takenAt: Date | null;
};

export type GuestIdeaJson = {
  id: string;
  caseStageId: string;
  guestKey: string;
  displayName: string;
  kind: GuestIdeaKind;
  text: string;
  createdAt: string;
  takenAt: string | null;
  stageOrder?: number;
  stageTitle?: string;
};

const MAX_NAME = 60;
const MAX_TEXT = 280;
const MAX_OPEN_PER_GUEST_STAGE = 8;
const MAX_PER_GUEST_SESSION = 30;

export function normalizeGuestName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_NAME) return null;
  return name;
}

export function normalizeGuestText(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 1 || text.length > MAX_TEXT) return null;
  return text;
}

export function isGuestKey(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function serializeGuestIdea(
  row: GuestIdeaRow,
  stage?: { order: number; title: string } | null,
): GuestIdeaJson {
  return {
    id: row.id,
    caseStageId: row.caseStageId,
    guestKey: row.guestKey,
    displayName: row.displayName,
    kind: row.kind,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    takenAt: row.takenAt ? row.takenAt.toISOString() : null,
    ...(stage
      ? { stageOrder: stage.order, stageTitle: stage.title }
      : {}),
  };
}

export async function loadGuestIdeasForSession(
  sessionId: string,
  opts?: { stageId?: string; guestKey?: string },
): Promise<GuestIdeaRow[]> {
  const pool = getSql();
  if (opts?.stageId && opts.guestKey) {
    return pool<GuestIdeaRow[]>`
      SELECT id, "caseSessionId", "caseStageId", "guestKey", "displayName",
        kind, text, "createdAt", "takenAt"
      FROM "SessionGuestIdea"
      WHERE "caseSessionId" = ${sessionId}
        AND "caseStageId" = ${opts.stageId}
        AND "guestKey" = ${opts.guestKey}
      ORDER BY "createdAt" ASC
    `;
  }
  if (opts?.stageId) {
    return pool<GuestIdeaRow[]>`
      SELECT id, "caseSessionId", "caseStageId", "guestKey", "displayName",
        kind, text, "createdAt", "takenAt"
      FROM "SessionGuestIdea"
      WHERE "caseSessionId" = ${sessionId}
        AND "caseStageId" = ${opts.stageId}
      ORDER BY "createdAt" ASC
    `;
  }
  return pool<GuestIdeaRow[]>`
    SELECT id, "caseSessionId", "caseStageId", "guestKey", "displayName",
      kind, text, "createdAt", "takenAt"
    FROM "SessionGuestIdea"
    WHERE "caseSessionId" = ${sessionId}
    ORDER BY "createdAt" ASC
  `;
}

export async function insertGuestIdea(input: {
  sessionId: string;
  stageId: string;
  guestKey: string;
  displayName: string;
  kind: GuestIdeaKind;
  text: string;
}): Promise<GuestIdeaRow> {
  const pool = getSql();
  const counts = await pool<
    { stageOpen: number; sessionTotal: number }[]
  >`
    SELECT
      COUNT(*) FILTER (
        WHERE "caseStageId" = ${input.stageId} AND "takenAt" IS NULL
      )::int AS "stageOpen",
      COUNT(*)::int AS "sessionTotal"
    FROM "SessionGuestIdea"
    WHERE "caseSessionId" = ${input.sessionId}
      AND "guestKey" = ${input.guestKey}
  `;
  const stageOpen = counts[0]?.stageOpen ?? 0;
  const sessionTotal = counts[0]?.sessionTotal ?? 0;
  if (stageOpen >= MAX_OPEN_PER_GUEST_STAGE) {
    throw new Error("GUEST_STAGE_LIMIT");
  }
  if (sessionTotal >= MAX_PER_GUEST_SESSION) {
    throw new Error("GUEST_SESSION_LIMIT");
  }

  const id = randomUUID();
  const rows = await pool<GuestIdeaRow[]>`
    INSERT INTO "SessionGuestIdea" (
      id, "caseSessionId", "caseStageId", "guestKey", "displayName", kind, text
    )
    VALUES (
      ${id}, ${input.sessionId}, ${input.stageId}, ${input.guestKey},
      ${input.displayName}, ${input.kind}, ${input.text}
    )
    RETURNING id, "caseSessionId", "caseStageId", "guestKey", "displayName",
      kind, text, "createdAt", "takenAt"
  `;
  const row = rows[0];
  if (!row) throw new Error("GUEST_INSERT_FAILED");
  return row;
}

export async function markGuestIdeaTaken(
  sessionId: string,
  ideaId: string,
): Promise<GuestIdeaRow | null> {
  const pool = getSql();
  const rows = await pool<GuestIdeaRow[]>`
    UPDATE "SessionGuestIdea"
    SET "takenAt" = COALESCE("takenAt", ${new Date()})
    WHERE id = ${ideaId} AND "caseSessionId" = ${sessionId}
    RETURNING id, "caseSessionId", "caseStageId", "guestKey", "displayName",
      kind, text, "createdAt", "takenAt"
  `;
  return rows[0] ?? null;
}
