-- QR-вход студентов без аккаунта: токен занятия + идеи гостей.
ALTER TABLE "CaseSession" ADD COLUMN IF NOT EXISTS "joinToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CaseSession_joinToken_key"
  ON "CaseSession"("joinToken");

CREATE TABLE IF NOT EXISTS "SessionGuestIdea" (
    "id" TEXT NOT NULL,
    "caseSessionId" TEXT NOT NULL,
    "caseStageId" TEXT NOT NULL,
    "guestKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenAt" TIMESTAMPTZ(3),
    CONSTRAINT "SessionGuestIdea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SessionGuestIdea_session_stage_idx"
  ON "SessionGuestIdea"("caseSessionId", "caseStageId", "createdAt");

CREATE INDEX IF NOT EXISTS "SessionGuestIdea_guestKey_idx"
  ON "SessionGuestIdea"("guestKey");

DO $$ BEGIN
  ALTER TABLE "SessionGuestIdea" ADD CONSTRAINT "SessionGuestIdea_caseSessionId_fkey"
    FOREIGN KEY ("caseSessionId") REFERENCES "CaseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SessionGuestIdea" ADD CONSTRAINT "SessionGuestIdea_caseStageId_fkey"
    FOREIGN KEY ("caseStageId") REFERENCES "CaseStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
