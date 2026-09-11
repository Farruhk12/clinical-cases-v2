-- Индексы под фактические паттерны фильтрации (см. src/lib/session-list.ts, server/session-routes.ts).
-- Идемпотентно: повторный запуск безопасен.

-- "У этой группы уже идёт занятие по этому кейсу" (server/session-routes.ts) —
-- частичный индекс: активных сессий всегда мало, полный индекс по всей истории избыточен.
CREATE INDEX IF NOT EXISTS "CaseSession_active_case_group_idx"
  ON "CaseSession"("caseId", "studyGroupId")
  WHERE status = 'IN_PROGRESS';

-- Список занятий преподавателя фильтруется по кафедре кейса (src/lib/session-list.ts).
CREATE INDEX IF NOT EXISTS "Case_departmentId_idx" ON "Case"("departmentId");

-- Список занятий сортируется по дате начала (ORDER BY cs."startedAt" DESC).
CREATE INDEX IF NOT EXISTS "CaseSession_startedAt_idx" ON "CaseSession"("startedAt" DESC);
