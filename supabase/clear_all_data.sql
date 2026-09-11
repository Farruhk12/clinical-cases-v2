-- Очистка всех данных приложения (схема не трогается).
-- Порядок: Supabase → SQL Editor → Run.
-- Затем снова выполни весь файл full_setup.sql (строки с INSERT в конце восстановят демо-пользователей и справочники).

TRUNCATE TABLE
  "Hypothesis",
  "StudentQuestion",
  "SessionGuestIdea",
  "SessionOutcome",
  "StageSubmission",
  "CaseSession",
  "StageBlock",
  "CaseStage",
  "CaseFaculty",
  "CaseCourseLevel",
  "Case",
  "StudyGroupMember",
  "StudyGroup",
  "User",
  "CourseLevel",
  "Faculty",
  "Department"
CASCADE;
