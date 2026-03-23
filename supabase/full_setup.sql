-- Скопируй весь файл → Supabase → SQL Editor → Run. Повторно — безопасно (CREATE IF NOT EXISTS, INSERT с ON CONFLICT).
-- Чтобы полностью обнулить данные и заново залить демо: сначала clear_all_data.sql, потом снова этот файл.
-- Демо-логин: teacher / admin — пароль demo1234.
CREATE SCHEMA IF NOT EXISTS "public";

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BlockType" AS ENUM ('PLAIN', 'PATIENT_SPEECH', 'DOCTOR_NOTES', 'NARRATOR', 'IMAGE_URL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Faculty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CourseLevel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CourseLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "departmentId" TEXT,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "courseLevelId" TEXT NOT NULL,
    CONSTRAINT "StudyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudyGroupMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "StudyGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Case" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "teacherKey" TEXT,
    "caseVersion" INTEGER NOT NULL DEFAULT 1,
    "departmentId" TEXT NOT NULL,
    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CaseFaculty" (
    "caseId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    CONSTRAINT "CaseFaculty_pkey" PRIMARY KEY ("caseId","facultyId")
);

CREATE TABLE IF NOT EXISTS "CaseCourseLevel" (
    "caseId" TEXT NOT NULL,
    "courseLevelId" TEXT NOT NULL,
    CONSTRAINT "CaseCourseLevel_pkey" PRIMARY KEY ("caseId","courseLevelId")
);

CREATE TABLE IF NOT EXISTS "CaseStage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "isFinalReveal" BOOLEAN NOT NULL DEFAULT false,
    "learningGoals" TEXT,
    CONSTRAINT "CaseStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StageBlock" (
    "id" TEXT NOT NULL,
    "caseStageId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "blockType" "BlockType" NOT NULL DEFAULT 'PLAIN',
    "rawText" TEXT,
    "formattedContent" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    CONSTRAINT "StageBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CaseSession" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "studyGroupId" TEXT NOT NULL,
    "leaderUserId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStageOrder" INTEGER NOT NULL,
    "caseVersionSnapshot" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    CONSTRAINT "CaseSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StageSubmission" (
    "id" TEXT NOT NULL,
    "caseSessionId" TEXT NOT NULL,
    "caseStageId" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "openedAt" TIMESTAMPTZ(3),
    CONSTRAINT "StageSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Hypothesis" (
    "id" TEXT NOT NULL,
    "stageSubmissionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudentQuestion" (
    "id" TEXT NOT NULL,
    "stageSubmissionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StudentQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionOutcome" (
    "id" TEXT NOT NULL,
    "caseSessionId" TEXT NOT NULL,
    "aiAnalysis" TEXT,
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "aiPreliminaryScores" JSONB,
    "teacherGrade" TEXT,
    "teacherComment" TEXT,
    "finalizedAt" TIMESTAMPTZ(3),
    CONSTRAINT "SessionOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_login_key" ON "User"("login");
CREATE UNIQUE INDEX IF NOT EXISTS "StudyGroupMember_userId_groupId_key" ON "StudyGroupMember"("userId", "groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "CaseStage_caseId_order_key" ON "CaseStage"("caseId", "order");
CREATE UNIQUE INDEX IF NOT EXISTS "StageBlock_caseStageId_order_key" ON "StageBlock"("caseStageId", "order");
CREATE INDEX IF NOT EXISTS "CaseSession_caseId_idx" ON "CaseSession"("caseId");
CREATE INDEX IF NOT EXISTS "CaseSession_studyGroupId_idx" ON "CaseSession"("studyGroupId");
CREATE UNIQUE INDEX IF NOT EXISTS "StageSubmission_caseSessionId_caseStageId_key" ON "StageSubmission"("caseSessionId", "caseStageId");
CREATE INDEX IF NOT EXISTS "Hypothesis_lineageId_idx" ON "Hypothesis"("lineageId");
CREATE INDEX IF NOT EXISTS "StudentQuestion_lineageId_idx" ON "StudentQuestion"("lineageId");
CREATE UNIQUE INDEX IF NOT EXISTS "SessionOutcome_caseSessionId_key" ON "SessionOutcome"("caseSessionId");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudyGroup" ADD CONSTRAINT "StudyGroup_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudyGroup" ADD CONSTRAINT "StudyGroup_courseLevelId_fkey" FOREIGN KEY ("courseLevelId") REFERENCES "CourseLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudyGroupMember" ADD CONSTRAINT "StudyGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudyGroupMember" ADD CONSTRAINT "StudyGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Case" ADD CONSTRAINT "Case_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseFaculty" ADD CONSTRAINT "CaseFaculty_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseFaculty" ADD CONSTRAINT "CaseFaculty_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseCourseLevel" ADD CONSTRAINT "CaseCourseLevel_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseCourseLevel" ADD CONSTRAINT "CaseCourseLevel_courseLevelId_fkey" FOREIGN KEY ("courseLevelId") REFERENCES "CourseLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseStage" ADD CONSTRAINT "CaseStage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StageBlock" ADD CONSTRAINT "StageBlock_caseStageId_fkey" FOREIGN KEY ("caseStageId") REFERENCES "CaseStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseSession" ADD CONSTRAINT "CaseSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseSession" ADD CONSTRAINT "CaseSession_studyGroupId_fkey" FOREIGN KEY ("studyGroupId") REFERENCES "StudyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CaseSession" ADD CONSTRAINT "CaseSession_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StageSubmission" ADD CONSTRAINT "StageSubmission_caseSessionId_fkey" FOREIGN KEY ("caseSessionId") REFERENCES "CaseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StageSubmission" ADD CONSTRAINT "StageSubmission_caseStageId_fkey" FOREIGN KEY ("caseStageId") REFERENCES "CaseStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_stageSubmissionId_fkey" FOREIGN KEY ("stageSubmissionId") REFERENCES "StageSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudentQuestion" ADD CONSTRAINT "StudentQuestion_stageSubmissionId_fkey" FOREIGN KEY ("stageSubmissionId") REFERENCES "StageSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SessionOutcome" ADD CONSTRAINT "SessionOutcome_caseSessionId_fkey" FOREIGN KEY ("caseSessionId") REFERENCES "CaseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Демо-пользователи (bcrypt, пароль demo1234)
INSERT INTO "Department" (id, name) VALUES ('seed-dept', 'Кафедра терапии')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "Faculty" (id, name) VALUES ('seed-fac', 'Лечебное дело')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "CourseLevel" (id, name, sort) VALUES ('seed-course', '4 курс', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "User" (id, login, "passwordHash", name, role, "departmentId") VALUES
(gen_random_uuid()::text, 'admin', '$2a$10$B0DnXwNrYCgXGoV5A.dMKeoco1yaTWaMJIgG5TNM4fHUAEhb8OgrO', 'Администратор', 'ADMIN', 'seed-dept'),
(gen_random_uuid()::text, 'teacher', '$2a$10$B0DnXwNrYCgXGoV5A.dMKeoco1yaTWaMJIgG5TNM4fHUAEhb8OgrO', 'Преподаватель Иванова', 'TEACHER', 'seed-dept')
ON CONFLICT (login) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  "departmentId" = EXCLUDED."departmentId";
