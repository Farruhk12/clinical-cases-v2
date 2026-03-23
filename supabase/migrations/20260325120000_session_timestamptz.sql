-- TIMESTAMP без TZ интерпретируется клиентами по-разному; фиксируем моменты времени как timestamptz.
-- Предполагаем, что ранее записанные значения соответствовали UTC (как при вставке через Node Date).
ALTER TABLE "CaseSession"
  ALTER COLUMN "startedAt" TYPE TIMESTAMPTZ(3) USING "startedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "completedAt" TYPE TIMESTAMPTZ(3) USING ("completedAt" AT TIME ZONE 'UTC');

ALTER TABLE "StageSubmission"
  ALTER COLUMN "submittedAt" TYPE TIMESTAMPTZ(3) USING ("submittedAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "openedAt" TYPE TIMESTAMPTZ(3) USING ("openedAt" AT TIME ZONE 'UTC');

ALTER TABLE "SessionOutcome"
  ALTER COLUMN "finalizedAt" TYPE TIMESTAMPTZ(3) USING ("finalizedAt" AT TIME ZONE 'UTC');
