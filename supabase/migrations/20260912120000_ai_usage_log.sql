-- Журнал вызовов ИИ (реальные токены из ответа DeepSeek) — основа для раздела
-- "Настройки → Расходы на ИИ". Идемпотентно: повторный запуск безопасен.

CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id" TEXT NOT NULL,
    "caseSessionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiUsageLog_caseSessionId_idx" ON "AiUsageLog"("caseSessionId");
CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_caseSessionId_fkey"
    FOREIGN KEY ("caseSessionId") REFERENCES "CaseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
