import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import postgres from "postgres";
import { getSql, asTransactionSql } from "../src/lib/db";
import {
  requireUser,
  sendAuth,
  errorResponse,
  mapSessionError,
} from "../src/lib/api-auth";
import { isStaff, canManageCase } from "../src/lib/authz";
import { loadCaseDetail } from "../src/lib/case-detail";
import { fetchSessionsList } from "../src/lib/session-list";
import {
  loadCaseSessionDetail,
  loadCaseSessionForPatch,
} from "../src/lib/session-detail";
import { mergeAiPreliminaryScoresFromDb } from "../src/lib/session-outcome-scores";
import {
  advanceSession,
  forceCompleteSession,
  updateSessionDraft,
} from "../src/lib/session-logic";
import type { AppSession } from "../src/types/session";
import { chatCompletion } from "../src/lib/llm";
import {
  enforceStrictStageScores,
  normalizeScores,
  parseAiAnalysisResponse,
  parsePreliminaryScoresLoose,
  recoverAiAnalysisFromLooseJson,
  unwrapAnalysisMarkdownIfJsonWrapped,
} from "../src/lib/session-ai-scores";
import { routeParam } from "./param";
import { serializeSessionBriefForJson } from "../src/lib/session-brief-json";
import { toJsonIsoUtc } from "../src/lib/to-json-iso-utc";

const SESSION_ANALYZE_VERSION = "session-analysis-v4";

function canDriveSession(
  cs: { status: string; leaderUserId: string; case: { departmentId: string } },
  session: AppSession,
) {
  if (cs.status !== "IN_PROGRESS") return false;
  if (cs.leaderUserId === session.user.id) return true;
  if (session.user.role === "ADMIN") return true;
  if (
    session.user.role === "TEACHER" &&
    canManageCase(session, cs.case.departmentId)
  ) {
    return true;
  }
  return false;
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveDraft"),
    hypotheses: z.array(
      z.object({ text: z.string(), lineageId: z.string().optional() }),
    ),
    questions: z.array(
      z.object({ text: z.string(), lineageId: z.string().optional() }),
    ),
  }),
  z.object({
    action: z.literal("advance"),
    hypotheses: z
      .array(z.object({ text: z.string(), lineageId: z.string().optional() }))
      .optional(),
    questions: z
      .array(z.object({ text: z.string(), lineageId: z.string().optional() }))
      .optional(),
  }),
  z.object({ action: z.literal("forceComplete") }),
  z.object({
    action: z.literal("setLeader"),
    leaderUserId: z.string(),
  }),
]);

const createSessionBodySchema = z
  .object({
    caseId: z.string(),
    leaderUserId: z.string(),
    studyGroupId: z.string().optional(),
    studyGroupName: z.string().optional(),
    facultyId: z.string().optional(),
    courseLevelId: z.string().optional(),
  })
  .superRefine((b, ctx) => {
    const legacy = Boolean(b.studyGroupId?.trim());
    const manual =
      Boolean(b.studyGroupName?.trim()) &&
      Boolean(b.facultyId?.trim()) &&
      Boolean(b.courseLevelId?.trim());
    if (legacy === manual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          legacy && manual
            ? "Укажите либо studyGroupId, либо название группы с факультетом и курсом"
            : "Укажите группу: id существующей или название + факультет + курс",
        path: ["studyGroupId"],
      });
    }
  });

const outcomePatchSchema = z.object({
  teacherGrade: z.string().optional(),
  teacherComment: z.string().optional(),
  finalize: z.boolean().optional(),
});

async function buildSessionPayload(
  cs: Awaited<ReturnType<typeof loadCaseSessionDetail>>,
  session: AppSession,
) {
  if (!cs) return null;
  const pool = getSql();
  const canEdit = canDriveSession(cs, session);
  const canEditSessionSettings =
    cs.status === "IN_PROGRESS" &&
    (session.user.role === "ADMIN" ||
      (session.user.role === "TEACHER" &&
        canManageCase(session, cs.case.departmentId)) ||
      cs.leaderUserId === session.user.id);
  const groupMembers = cs.studyGroup.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    login: m.user.login,
  }));
  const currentStage = cs.case.stages.find(
    (s) => s.order === cs.currentStageOrder,
  );
  const currentSubmission =
    currentStage &&
    cs.submissions.find(
      (sub) => sub.caseStageId === currentStage.id && !sub.submittedAt,
    );
  if (currentSubmission && !currentSubmission.openedAt) {
    await pool`
      UPDATE "StageSubmission" SET "openedAt" = ${new Date()} WHERE id = ${currentSubmission.id}
    `;
    currentSubmission.openedAt = new Date();
  }
  const showTeacherKey =
    session.user.role === "ADMIN" || session.user.role === "TEACHER";
  const stripCase = (c: (typeof cs)["case"]) => {
    if (showTeacherKey) return c;
    const { teacherKey, ...rest } = c;
    void teacherKey;
    return rest;
  };
  const completed = cs.status === "COMPLETED";
  const stagesForContent = completed
    ? cs.case.stages
    : currentStage
      ? [currentStage]
      : [];
  const visibleStages = stagesForContent.map((st) => ({
    ...st,
    blocks: st.blocks.map((b) => ({
      ...b,
      rawText: b.rawText,
      formattedContent: b.formattedContent,
    })),
  }));
  const timelineSubmissions = [...cs.submissions]
    .filter(
      (s) => s.submittedAt || (!completed && s.id === currentSubmission?.id),
    )
    .sort((a, b) => a.stage.order - b.stage.order);
  const outcomeWithScores = await mergeAiPreliminaryScoresFromDb(cs.outcome);
  return {
    session: {
      id: cs.id,
      status: cs.status,
      currentStageOrder: cs.currentStageOrder,
      startedAt: toJsonIsoUtc(cs.startedAt),
      completedAt: toJsonIsoUtc(cs.completedAt),
      caseVersionSnapshot: cs.caseVersionSnapshot,
      case: stripCase(cs.case),
      studyGroup: {
        id: cs.studyGroup.id,
        name: cs.studyGroup.name,
        faculty: cs.studyGroup.faculty,
        courseLevel: cs.studyGroup.courseLevel,
      },
      leader: cs.leader,
      outcome: outcomeWithScores
        ? {
            ...outcomeWithScores,
            finalizedAt: toJsonIsoUtc(outcomeWithScores.finalizedAt),
          }
        : null,
    },
    groupMembers,
    canEditSessionSettings,
    currentStage: currentStage
      ? { ...currentStage, blocks: currentStage.blocks }
      : null,
    visibleStages,
    draft: currentSubmission
      ? {
          submissionId: currentSubmission.id,
          hypotheses: currentSubmission.hypotheses,
          questions: currentSubmission.questions,
        }
      : null,
    timeline: timelineSubmissions.map((sub) => ({
      stageOrder: sub.stage.order,
      stageTitle: sub.stage.title,
      submittedAt: toJsonIsoUtc(sub.submittedAt),
      openedAt: toJsonIsoUtc(sub.openedAt),
      hypotheses: sub.hypotheses,
      questions: sub.questions,
    })),
    canEdit,
    analytics: timelineSubmissions.map((sub) => ({
      stageOrder: sub.stage.order,
      openedAt: toJsonIsoUtc(sub.openedAt),
      submittedAt: toJsonIsoUtc(sub.submittedAt),
    })),
  };
}

export function registerSessionRoutes(app: Express) {
  app.get("/api/sessions", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    const caseId =
      typeof req.query.caseId === "string" ? req.query.caseId : undefined;
    const sessions = await fetchSessionsList({
      role: session.user.role,
      userId: session.user.id,
      departmentId: session.user.departmentId,
      caseId,
    });
    res.json({ sessions: sessions.map(serializeSessionBriefForJson) });
  });

  app.post("/api/sessions", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    let body: z.infer<typeof createSessionBodySchema>;
    try {
      body = createSessionBodySchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }
    const medicalCase = await loadCaseDetail(body.caseId);
    if (!medicalCase) return errorResponse(res, "Кейс не найден", 404);
    if (!isStaff(session.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (session.user.role === "TEACHER") {
      if (!canManageCase(session, medicalCase.departmentId)) {
        return errorResponse(res, "Нет доступа к кейсу", 403);
      }
    }
    const allowedFaculty = new Set(
      medicalCase.caseFaculties.map((x) => x.facultyId),
    );
    const allowedCourse = new Set(
      medicalCase.caseCourseLevels.map((x) => x.courseLevelId),
    );
    const pool = getSql();
    let studyGroupId: string;
    if (body.studyGroupId?.trim()) {
      const groupRows = await pool<
        { id: string; facultyId: string; courseLevelId: string }[]
      >`SELECT id, "facultyId", "courseLevelId" FROM "StudyGroup" WHERE id = ${body.studyGroupId.trim()}`;
      const group = groupRows[0];
      if (!group) return errorResponse(res, "Группа не найдена", 404);
      if (
        !allowedFaculty.has(group.facultyId) ||
        !allowedCourse.has(group.courseLevelId)
      ) {
        return errorResponse(
          res,
          "Группа не подходит: факультет и курс должны входить в списки, заданные для кейса",
          400,
        );
      }
      studyGroupId = group.id;
    } else {
      const name = body.studyGroupName!.trim();
      const facultyId = body.facultyId!.trim();
      const courseLevelId = body.courseLevelId!.trim();
      if (!allowedFaculty.has(facultyId) || !allowedCourse.has(courseLevelId)) {
        return errorResponse(
          res,
          "Факультет и курс должны входить в списки, заданные для этого кейса",
          400,
        );
      }
      const existing = await pool<{ id: string }[]>`
        SELECT id FROM "StudyGroup"
        WHERE TRIM(name) = ${name}
          AND "facultyId" = ${facultyId}
          AND "courseLevelId" = ${courseLevelId}
        LIMIT 1
      `;
      if (existing[0]) {
        studyGroupId = existing[0].id;
      } else {
        studyGroupId = randomUUID();
        await pool`
          INSERT INTO "StudyGroup" (id, name, "facultyId", "courseLevelId")
          VALUES (${studyGroupId}, ${name}, ${facultyId}, ${courseLevelId})
        `;
      }
    }
    const leaderRows = await pool<
      { id: string; role: string; departmentId: string | null }[]
    >`
      SELECT id, role, "departmentId" FROM "User" WHERE id = ${body.leaderUserId} LIMIT 1
    `;
    const leaderUser = leaderRows[0];
    if (!leaderUser) return errorResponse(res, "Пользователь не найден", 400);
    if (leaderUser.role !== "ADMIN" && leaderUser.role !== "TEACHER") {
      return errorResponse(res, "Ведущим может быть только админ или преподаватель", 400);
    }
    if (leaderUser.role === "TEACHER") {
      if (!leaderUser.departmentId) {
        return errorResponse(
          res,
          "У выбранного преподавателя не указана кафедра",
          400,
        );
      }
      if (leaderUser.departmentId !== medicalCase.departmentId) {
        return errorResponse(
          res,
          "Ведущий должен быть из кафедры этого кейса (или администратором)",
          400,
        );
      }
    }
    const firstStage = medicalCase.stages[0];
    if (!firstStage) return errorResponse(res, "У кейса нет этапов", 400);
    const sessionId = randomUUID();
    const poolConn = getSql();
    await poolConn.begin(async (txn) => {
      const sql = asTransactionSql(poolConn, txn);
      await sql`
        INSERT INTO "CaseSession" (
          id, "caseId", "studyGroupId", "leaderUserId", status, "currentStageOrder", "caseVersionSnapshot"
        )
        VALUES (
          ${sessionId},
          ${medicalCase.id},
          ${studyGroupId},
          ${body.leaderUserId},
          'IN_PROGRESS',
          ${firstStage.order},
          ${medicalCase.caseVersion}
        )
      `;
      await sql`
        INSERT INTO "StageSubmission" (id, "caseSessionId", "caseStageId", "openedAt")
        VALUES (${randomUUID()}, ${sessionId}, ${firstStage.id}, ${new Date()})
      `;
    });
    const sessOut = await poolConn<
      {
        id: string;
        caseId: string;
        studyGroupId: string;
        leaderUserId: string;
        status: string;
        currentStageOrder: number;
        caseVersionSnapshot: number;
        startedAt: Date;
        completedAt: Date | null;
      }[]
    >`
      SELECT id, "caseId", "studyGroupId", "leaderUserId", status, "currentStageOrder",
        "caseVersionSnapshot", "startedAt", "completedAt"
      FROM "CaseSession" WHERE id = ${sessionId}
    `;
    const created = sessOut[0];
    res.json({
      session: {
        ...created,
        startedAt: toJsonIsoUtc(created.startedAt),
        completedAt: toJsonIsoUtc(created.completedAt),
      },
    });
  });

  app.get("/api/sessions/:sessionId", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    const sessionId = routeParam(req.params.sessionId);
    if (!sessionId) return errorResponse(res, "Некорректный id сессии", 400);
    const cs = await loadCaseSessionDetail(sessionId);
    if (!cs) return errorResponse(res, "Сессия не найдена", 404);
    if (session.user.role === "TEACHER") {
      if (!canManageCase(session, cs.case.departmentId)) {
        return errorResponse(res, "Нет доступа", 403);
      }
    }
    const payload = await buildSessionPayload(cs, session);
    res.json(payload);
  });

  app.patch("/api/sessions/:sessionId", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    const sessionId = routeParam(req.params.sessionId);
    if (!sessionId) return errorResponse(res, "Некорректный id сессии", 400);
    let body: z.infer<typeof patchSchema>;
    try {
      body = patchSchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }
    const cs = await loadCaseSessionForPatch(sessionId);
    if (!cs) return errorResponse(res, "Сессия не найдена", 404);
    if (
      session.user.role === "TEACHER" &&
      !canManageCase(session, cs.case.departmentId)
    ) {
      return errorResponse(res, "Нет доступа", 403);
    }
    const pool = getSql();
    if (body.action === "setLeader") {
      if (cs.status !== "IN_PROGRESS") {
        return errorResponse(res, "Нельзя менять ведущего у завершённой сессии", 409);
      }
      const canSetLeader =
        session.user.role === "ADMIN" ||
        (session.user.role === "TEACHER" &&
          canManageCase(session, cs.case.departmentId)) ||
        cs.leaderUserId === session.user.id;
      if (!canSetLeader) {
        return errorResponse(res, "Нет права менять ведущего", 403);
      }
      const nextLeaderRows = await pool<
        { id: string; role: string; departmentId: string | null }[]
      >`
        SELECT id, role, "departmentId" FROM "User" WHERE id = ${body.leaderUserId} LIMIT 1
      `;
      const nextLeader = nextLeaderRows[0];
      if (!nextLeader) {
        return errorResponse(res, "Пользователь не найден", 400);
      }
      if (nextLeader.role !== "ADMIN" && nextLeader.role !== "TEACHER") {
        return errorResponse(res, "Ведущим может быть только админ или преподаватель", 400);
      }
      if (nextLeader.role === "TEACHER") {
        if (!nextLeader.departmentId) {
          return errorResponse(res, "У выбранного преподавателя не указана кафедра", 400);
        }
        if (nextLeader.departmentId !== cs.case.departmentId) {
          return errorResponse(
            res,
            "Ведущий должен быть из кафедры этого кейса (или администратором)",
            400,
          );
        }
      }
      await pool`
        UPDATE "CaseSession" SET "leaderUserId" = ${body.leaderUserId} WHERE id = ${sessionId}
      `;
      return res.json({ ok: true });
    }
    const csDrive = {
      status: cs.status,
      leaderUserId: cs.leaderUserId,
      case: cs.case,
    };
    if (!canDriveSession(csDrive, session)) {
      return errorResponse(
        res,
        "Вести сессию может назначенный ведущий, преподаватель кафедры кейса или администратор",
        403,
      );
    }
    if (body.action === "saveDraft") {
      try {
        await updateSessionDraft(sessionId, {
          hypotheses: body.hypotheses,
          questions: body.questions,
        });
      } catch (e: unknown) {
        const code = e instanceof Error ? e.message : "UNKNOWN";
        mapSessionError(code, res);
        return;
      }
      return res.json({ ok: true });
    }
    if (body.action === "advance") {
      try {
        // Если клиент передал черновик — сохраняем до advance одним запросом
        if (body.hypotheses !== undefined || body.questions !== undefined) {
          await updateSessionDraft(sessionId, {
            hypotheses: body.hypotheses ?? [],
            questions: body.questions ?? [],
          });
        }
        await advanceSession(sessionId);
        // Грузим обновлённую сессию и сразу отдаём полный payload —
        // клиент не делает лишний GET
        const cs = await loadCaseSessionDetail(sessionId);
        if (!cs) return errorResponse(res, "Сессия не найдена", 404);
        const payload = await buildSessionPayload(cs, session);
        return res.json({ ...payload, _advanced: true });
      } catch (e: unknown) {
        const code = e instanceof Error ? e.message : "UNKNOWN";
        mapSessionError(code, res);
        return;
      }
    }
    if (body.action === "forceComplete") {
      try {
        const result = await forceCompleteSession(sessionId);
        return res.json(result);
      } catch (e: unknown) {
        const code = e instanceof Error ? e.message : "UNKNOWN";
        mapSessionError(code, res);
        return;
      }
    }
    return errorResponse(res, "Неизвестное действие", 400);
  });

  app.get(
    "/api/sessions/:sessionId/export",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const { session } = a;
      const sessionId = routeParam(req.params.sessionId);
      if (!sessionId) return errorResponse(res, "Некорректный id сессии", 400);
      const cs = await loadCaseSessionDetail(sessionId);
      if (!cs) return errorResponse(res, "Сессия не найдена", 404);
      if (isStaff(session.user.role)) {
        if (
          session.user.role === "TEACHER" &&
          !canManageCase(session, cs.case.departmentId)
        ) {
          return errorResponse(res, "Нет доступа", 403);
        }
      } else {
        return errorResponse(res, "Только для преподавателя или администратора", 403);
      }
      const lines: string[] = [];
      lines.push(`Кейс: ${cs.case.title}`);
      lines.push(
        `Группа: ${cs.studyGroup.name} | ${cs.studyGroup.faculty.name} | ${cs.studyGroup.courseLevel.name}`,
      );
      lines.push(`Ведущий: ${cs.leader.name ?? ""} (${cs.leader.login})`);
      lines.push(`Снимок версии кейса: ${cs.caseVersionSnapshot}`);
      lines.push(`Начало: ${cs.startedAt.toISOString()}`);
      if (cs.completedAt) lines.push(`Завершение: ${cs.completedAt.toISOString()}`);
      lines.push("");
      for (const sub of [...cs.submissions].sort(
        (a, b) => a.stage.order - b.stage.order,
      )) {
        lines.push(`--- Этап ${sub.stage.order}: ${sub.stage.title} ---`);
        if (sub.openedAt) lines.push(`Открыт: ${sub.openedAt.toISOString()}`);
        if (sub.submittedAt) lines.push(`Сабмит: ${sub.submittedAt.toISOString()}`);
        lines.push("Гипотезы:");
        sub.hypotheses.forEach((h, i) => lines.push(`  ${i + 1}. ${h.text}`));
        lines.push("Вопросы:");
        sub.questions.forEach((q, i) => lines.push(`  ${i + 1}. ${q.text}`));
        lines.push("");
      }
      const preParsed = parsePreliminaryScoresLoose(
        cs.outcome?.aiPreliminaryScores ?? null,
      );
      if (preParsed) {
        lines.push("--- Предварительные оценки (ИИ, /100) ---");
        for (const s of preParsed.stageScores) {
          const title = s.stageTitle ? ` (${s.stageTitle})` : "";
          lines.push(`Этап ${s.stageOrder}${title}: ${s.score}`);
        }
        lines.push(`Среднее: ${preParsed.averageScore}`);
        lines.push("");
      }
      if (cs.outcome?.aiAnalysis) {
        lines.push("--- ИИ-анализ ---");
        lines.push(cs.outcome.aiAnalysis);
        lines.push("");
      }
      if (cs.outcome?.teacherGrade || cs.outcome?.teacherComment) {
        lines.push("--- Оценка преподавателя ---");
        if (cs.outcome.teacherGrade) lines.push(`Оценка: ${cs.outcome.teacherGrade}`);
        if (cs.outcome.teacherComment)
          lines.push(`Комментарий: ${cs.outcome.teacherComment}`);
      }
      const text = lines.join("\n");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="session-${sessionId}.txt"`,
      );
      res.send(text);
    },
  );

  app.patch(
    "/api/sessions/:sessionId/outcome",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const { session } = a;
      const sessionId = routeParam(req.params.sessionId);
      if (!sessionId) return errorResponse(res, "Некорректный id сессии", 400);
      if (!isStaff(session.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      let body: z.infer<typeof outcomePatchSchema>;
      try {
        body = outcomePatchSchema.parse(req.body);
      } catch {
        return errorResponse(res, "Некорректные данные", 400);
      }
      const pool = getSql();
      const sessRows = await pool<{ id: string; status: string; caseId: string }[]>`
        SELECT cs.id, cs.status, cs."caseId" FROM "CaseSession" cs WHERE cs.id = ${sessionId}
      `;
      const csRow = sessRows[0];
      if (!csRow) return errorResponse(res, "Сессия не найдена", 404);
      const [c] = await pool<{ departmentId: string }[]>`
        SELECT "departmentId" FROM "Case" WHERE id = ${csRow.caseId}
      `;
      if (!c) return errorResponse(res, "Кейс не найден", 404);
      if (!canManageCase(session, c.departmentId)) {
        return errorResponse(res, "Нет доступа", 403);
      }
      if (csRow.status !== "COMPLETED") {
        return errorResponse(res, "Сессия ещё не завершена", 409);
      }
      const existing = await pool<
        {
          id: string;
          teacherGrade: string | null;
          teacherComment: string | null;
          finalizedAt: Date | null;
        }[]
      >`
        SELECT id, "teacherGrade", "teacherComment", "finalizedAt"
        FROM "SessionOutcome" WHERE "caseSessionId" = ${csRow.id}
      `;
      const prev = existing[0];
      const teacherGrade =
        body.teacherGrade !== undefined ? body.teacherGrade : prev?.teacherGrade ?? null;
      const teacherComment =
        body.teacherComment !== undefined
          ? body.teacherComment
          : prev?.teacherComment ?? null;
      const finalizedAt =
        body.finalize === true ? new Date() : (prev?.finalizedAt ?? null);
      if (prev) {
        await pool`
          UPDATE "SessionOutcome"
          SET "teacherGrade" = ${teacherGrade},
              "teacherComment" = ${teacherComment},
              "finalizedAt" = ${finalizedAt}
          WHERE id = ${prev.id}
        `;
      } else {
        await pool`
          INSERT INTO "SessionOutcome" (id, "caseSessionId", "teacherGrade", "teacherComment", "finalizedAt")
          VALUES (${randomUUID()}, ${csRow.id}, ${teacherGrade}, ${teacherComment}, ${finalizedAt})
        `;
      }
      const [outcomeRow] = await pool<
        {
          id: string;
          caseSessionId: string;
          aiAnalysis: string | null;
          aiModel: string | null;
          aiPromptVersion: string | null;
          aiPreliminaryScores: unknown;
          teacherGrade: string | null;
          teacherComment: string | null;
          finalizedAt: Date | null;
        }[]
      >`SELECT * FROM "SessionOutcome" WHERE "caseSessionId" = ${csRow.id}`;
      if (!outcomeRow) {
        return errorResponse(res, "Не удалось прочитать итог сессии", 500);
      }
      res.json({
        outcome: {
          ...outcomeRow,
          finalizedAt: toJsonIsoUtc(outcomeRow.finalizedAt),
        },
      });
    },
  );

  app.post(
    "/api/sessions/:sessionId/analyze",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const { session } = a;
      const sessionId = routeParam(req.params.sessionId);
      if (!sessionId) return errorResponse(res, "Некорректный id сессии", 400);
      const cs = await loadCaseSessionDetail(sessionId);
      if (!cs) return errorResponse(res, "Сессия не найдена", 404);
      if (cs.status !== "COMPLETED") {
        return errorResponse(res, "Анализ доступен после завершения сессии", 409);
      }
      if (!isStaff(session.user.role)) {
        return errorResponse(res, "Нет доступа", 403);
      }
      if (
        session.user.role === "TEACHER" &&
        !canManageCase(session, cs.case.departmentId)
      ) {
        return errorResponse(res, "Нет доступа", 403);
      }
      const sortedSubs = [...cs.submissions].sort(
        (a, b) => a.stage.order - b.stage.order,
      );
      const lines: string[] = [];
      for (const sub of sortedSubs) {
        lines.push(`Этап ${sub.stage.order}: ${sub.stage.title}`);
        lines.push(
          "Гипотезы: " +
            (sub.hypotheses.length
              ? sub.hypotheses.map((h) => h.text).join(" | ")
              : "—"),
        );
        lines.push(
          "Вопросы: " +
            (sub.questions.length
              ? sub.questions.map((q) => q.text).join(" | ")
              : "—"),
        );
        lines.push("");
      }
      const teacherKey =
        session.user.role === "ADMIN" || session.user.role === "TEACHER"
          ? (cs.case.teacherKey ?? "")
          : "";
      const stageCount = sortedSubs.length;
      const stageStats = sortedSubs.map((sub) => ({
        stageOrder: sub.stage.order,
        hypothesisCount: sub.hypotheses.filter((h) => h.text.trim().length > 0)
          .length,
        questionCount: sub.questions.filter((q) => q.text.trim().length > 0)
          .length,
      }));
      const llm = await chatCompletion(
        [
          {
            role: "system",
            content: `Ты методист медицинского образования. Проанализируй ход работы по клиническому кейсу.

В тексте анализа (analysisMarkdown) по-прежнему поощряй широту предварительных гипотез как полезную привычку обучения — но не смягчай цифры оценок.

ОЦЕНКИ score (0–100) — ЖЁСТКО, без снисхождения. Ориентиры (если данных мало — ставь нижнюю границу диапазона):
- Нет ни одной непустой гипотезы И нет ни одного непустого вопроса на этапе → **score = 0**. Не придумывай «зачёт за намерение».
- Только 1–2 короткие гипотезы, вопросов нет → обычно **5–20**, не выше **25**.
- Есть гипотезы (3+), но вопросов нет → обычно не выше **35–45** без сильной аргументации в данных.
- Нет гипотез, но есть вопросы → обычно **15–30**.
- И гипотезы (несколько, осмысленные), и вопросы, логика видна → можно **50–70**.
- **70+** только при реально плотной, связной работе этапа.
- **85+** почти не используй — резерв для выдающейся работы.

averageScore — среднее арифметическое score по этапам, округлённое до целого.

Поле analysisMarkdown — развёрнутый текст на русском в Markdown:
- Для каждого этапа — раздел ## «Этап N: …» (название как во входных данных).
- Внутри этапа три подраздела ### в порядке: Положительные качества | Отрицательные качества | Рекомендации (маркированные списки; если пусто — строка «—»).
- Названия гипотез из данных выделяй **жирным**.
- В конце опционально ## Общие замечания с теми же тремя ###.
- В тексте analysisMarkdown можно кратко упомянуть баллы этапов, но основные числа должны быть в stageScores и averageScore.

Ответ строго один JSON-объект (без текста вокруг) вида:
{"analysisMarkdown":"…","stageScores":[{"stageOrder":1,"stageTitle":"кратко","score":75},…],"averageScore":73}
stageScores.length должно быть ${stageCount} (по числу этапов во входе). stageTitle — короткая подпись этапа.

Не выставляй итоговую оценку вместо преподавателя — только предварительные баллы в полях score. Будь сдержан и требователен к цифрам.
Версия промпта: ${SESSION_ANALYZE_VERSION}.`,
          },
          {
            role: "user",
            content: `Данные по этапам:\n${lines.join("\n")}\n\nЭталон преподавателя (если есть): ${teacherKey || "не предоставлен"}`,
          },
        ],
        true,
      );
      let analysis: string;
      let model: string | null = null;
      let scoresPayload: ReturnType<typeof normalizeScores> | null = null;
      if (llm.ok && llm.text) {
        const parsed = parseAiAnalysisResponse(llm.text);
        if (parsed.ok) {
          analysis = parsed.data.analysisMarkdown.trim();
          scoresPayload = normalizeScores(parsed.data);
          if (scoresPayload.stageScores.length !== stageCount && stageCount > 0) {
            scoresPayload = null;
          } else if (scoresPayload !== null) {
            scoresPayload = enforceStrictStageScores(scoresPayload, stageStats);
          }
        } else {
          const loose = recoverAiAnalysisFromLooseJson(llm.text);
          if (loose) {
            analysis = loose.analysisMarkdown;
            if (
              loose.scores &&
              (stageCount === 0 ||
                loose.scores.stageScores.length === stageCount)
            ) {
              scoresPayload = enforceStrictStageScores(loose.scores, stageStats);
            }
          } else {
            analysis = llm.text.trim();
          }
        }
        model = llm.model ?? null;
      } else if (!llm.ok && llm.missingKey) {
        analysis =
          "## Локальный режим\n\nНе заданы GEMINI_API_KEY и OPENAI_API_KEY. Ниже сырые данные для ручного разбора:\n\n" +
          lines.join("\n");
        model = "offline";
      } else {
        analysis =
          "Не удалось получить ответ модели. Данные сессии:\n\n" + lines.join("\n");
        model = "error";
      }
      analysis = unwrapAnalysisMarkdownIfJsonWrapped(analysis);
      const pool = getSql();
      const scoresParam =
        scoresPayload !== null
          ? pool.json(scoresPayload as postgres.JSONValue)
          : null;
      await pool`
        INSERT INTO "SessionOutcome" (
          id, "caseSessionId", "aiAnalysis", "aiModel", "aiPromptVersion", "aiPreliminaryScores"
        )
        VALUES (
          ${randomUUID()},
          ${cs.id},
          ${analysis},
          ${model},
          ${SESSION_ANALYZE_VERSION},
          ${scoresParam}
        )
        ON CONFLICT ("caseSessionId") DO UPDATE SET
          "aiAnalysis" = EXCLUDED."aiAnalysis",
          "aiModel" = EXCLUDED."aiModel",
          "aiPromptVersion" = EXCLUDED."aiPromptVersion",
          "aiPreliminaryScores" = EXCLUDED."aiPreliminaryScores"
      `;
      const outcomeRows = await pool<
        {
          id: string;
          caseSessionId: string;
          aiAnalysis: string | null;
          aiModel: string | null;
          aiPromptVersion: string | null;
          aiPreliminaryScores: unknown;
          teacherGrade: string | null;
          teacherComment: string | null;
          finalizedAt: Date | null;
        }[]
      >`SELECT * FROM "SessionOutcome" WHERE "caseSessionId" = ${cs.id}`;
      const row = outcomeRows[0];
      res.json({
        outcome: row
          ? { ...row, finalizedAt: toJsonIsoUtc(row.finalizedAt) }
          : null,
      });
    },
  );
}
