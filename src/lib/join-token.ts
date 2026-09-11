import { randomBytes } from "crypto";
import { getSql } from "./db";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export function newJoinToken(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function isJoinToken(value: string): boolean {
  return /^[abcdefghijkmnopqrstuvwxyz23456789]{8}$/.test(value);
}

/** Выдаёт токен занятия; для старых сессий создаёт при первом запросе. */
export async function ensureSessionJoinToken(sessionId: string): Promise<string> {
  const pool = getSql();
  const existing = await pool<{ joinToken: string | null }[]>`
    SELECT "joinToken" FROM "CaseSession" WHERE id = ${sessionId} LIMIT 1
  `;
  const current = existing[0]?.joinToken;
  if (current) return current;

  for (let i = 0; i < 6; i++) {
    const token = newJoinToken();
    const updated = await pool<{ joinToken: string }[]>`
      UPDATE "CaseSession"
      SET "joinToken" = ${token}
      WHERE id = ${sessionId} AND "joinToken" IS NULL
      RETURNING "joinToken"
    `;
    if (updated[0]?.joinToken) return updated[0].joinToken;
    const again = await pool<{ joinToken: string | null }[]>`
      SELECT "joinToken" FROM "CaseSession" WHERE id = ${sessionId} LIMIT 1
    `;
    if (again[0]?.joinToken) return again[0].joinToken;
  }
  throw new Error("JOIN_TOKEN_FAILED");
}
