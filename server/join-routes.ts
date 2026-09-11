import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSql } from "../src/lib/db";
import { errorResponse, requireUser, sendAuth } from "../src/lib/api-auth";
import { canManageCase } from "../src/lib/authz";
import { ensureSessionJoinToken, isJoinToken } from "../src/lib/join-token";
import {
  GUEST_IDEA_KINDS,
  insertGuestIdea,
  isGuestKey,
  loadGuestIdeasForSession,
  markGuestIdeaTaken,
  normalizeGuestName,
  normalizeGuestText,
  serializeGuestIdea,
} from "../src/lib/session-guest-ideas";
import { routeParam } from "./param";
import type { BlockType } from "../src/types/db";

const ideaBodySchema = z.object({
  guestKey: z.string(),
  displayName: z.string(),
  kind: z.enum(GUEST_IDEA_KINDS),
  text: z.string(),
});

type JoinSessionRow = {
  id: string;
  status: string;
  currentStageOrder: number;
  caseTitle: string;
  groupName: string;
  facultyName: string;
  stageId: string | null;
  stageTitle: string | null;
  totalStages: number;
};

async function loadJoinSession(token: string): Promise<JoinSessionRow | null> {
  const pool = getSql();
  const rows = await pool<JoinSessionRow[]>`
    SELECT
      cs.id,
      cs.status,
      cs."currentStageOrder",
      c.title AS "caseTitle",
      sg.name AS "groupName",
      f.name AS "facultyName",
      st.id AS "stageId",
      st.title AS "stageTitle",
      (SELECT COUNT(*)::int FROM "CaseStage" WHERE "caseId" = c.id) AS "totalStages"
    FROM "CaseSession" cs
    JOIN "Case" c ON c.id = cs."caseId"
    JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
    JOIN "Faculty" f ON f.id = sg."facultyId"
    LEFT JOIN "CaseStage" st
      ON st."caseId" = cs."caseId" AND st."order" = cs."currentStageOrder"
    WHERE cs."joinToken" = ${token}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadStageBlocks(stageId: string) {
  const pool = getSql();
  return pool<
    {
      id: string;
      blockType: BlockType;
      rawText: string | null;
      formattedContent: string | null;
      imageUrl: string | null;
      imageAlt: string | null;
    }[]
  >`
    SELECT id, "blockType", "rawText", "formattedContent", "imageUrl", "imageAlt"
    FROM "StageBlock"
    WHERE "caseStageId" = ${stageId}
    ORDER BY "order" ASC
  `;
}

function guestKeyFromQuery(req: Request): string | null {
  const raw = req.query.guestKey;
  if (typeof raw !== "string" || !isGuestKey(raw)) return null;
  return raw;
}

export function registerJoinRoutes(app: Express) {
  app.get("/api/join/:token", async (req: Request, res: Response) => {
    const token = routeParam(req.params.token);
    if (!token || !isJoinToken(token)) {
      return errorResponse(res, "Ссылка недействительна", 400);
    }
    const cs = await loadJoinSession(token);
    if (!cs) return errorResponse(res, "Занятие не найдено", 404);
    const guestKey = guestKeyFromQuery(req);
    const blocks = cs.stageId ? await loadStageBlocks(cs.stageId) : [];
    const ownIdeas =
      cs.stageId && guestKey
        ? await loadGuestIdeasForSession(cs.id, {
            stageId: cs.stageId,
            guestKey,
          })
        : [];
    res.json({
      status: cs.status,
      caseTitle: cs.caseTitle,
      groupName: cs.groupName,
      facultyName: cs.facultyName,
      currentStageOrder: cs.currentStageOrder,
      totalStages: cs.totalStages,
      currentStage:
        cs.stageId && cs.stageTitle
          ? {
              id: cs.stageId,
              order: cs.currentStageOrder,
              title: cs.stageTitle,
              blocks,
            }
          : null,
      ownIdeas: ownIdeas.map(serializeGuestIdea),
    });
  });

  app.post("/api/join/:token/ideas", async (req: Request, res: Response) => {
    const token = routeParam(req.params.token);
    if (!token || !isJoinToken(token)) {
      return errorResponse(res, "Ссылка недействительна", 400);
    }
    let body: z.infer<typeof ideaBodySchema>;
    try {
      body = ideaBodySchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }
    if (!isGuestKey(body.guestKey)) {
      return errorResponse(res, "Некорректный ключ гостя", 400);
    }
    const displayName = normalizeGuestName(body.displayName);
    if (!displayName) {
      return errorResponse(res, "Укажите имя — от 2 до 60 символов", 400);
    }
    const text = normalizeGuestText(body.text);
    if (!text) {
      return errorResponse(res, "Текст слишком короткий или длинный", 400);
    }
    const cs = await loadJoinSession(token);
    if (!cs) return errorResponse(res, "Занятие не найдено", 404);
    if (cs.status !== "IN_PROGRESS") {
      return errorResponse(res, "Занятие уже завершено", 409);
    }
    if (!cs.stageId) return errorResponse(res, "Этап недоступен", 400);
    try {
      const row = await insertGuestIdea({
        sessionId: cs.id,
        stageId: cs.stageId,
        guestKey: body.guestKey,
        displayName,
        kind: body.kind,
        text,
      });
      res.status(201).json({ idea: serializeGuestIdea(row) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "GUEST_STAGE_LIMIT") {
        return errorResponse(
          res,
          "На этом этапе уже достаточно ваших идей",
          429,
        );
      }
      if (msg === "GUEST_SESSION_LIMIT") {
        return errorResponse(res, "Лимит идей на это занятие исчерпан", 429);
      }
      throw err;
    }
  });

  app.get(
    "/api/sessions/:sessionId/guest-ideas",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const sessionId = routeParam(req.params.sessionId);
      if (!sessionId) return errorResponse(res, "Некорректный id сессии", 400);
      const pool = getSql();
      const rows = await pool<
        { id: string; departmentId: string; status: string }[]
      >`
        SELECT cs.id, c."departmentId", cs.status
        FROM "CaseSession" cs
        JOIN "Case" c ON c.id = cs."caseId"
        WHERE cs.id = ${sessionId}
        LIMIT 1
      `;
      const cs = rows[0];
      if (!cs) return errorResponse(res, "Сессия не найдена", 404);
      if (
        a.session.user.role === "TEACHER" &&
        !canManageCase(a.session, cs.departmentId)
      ) {
        return errorResponse(res, "Нет доступа", 403);
      }
      const joinToken = await ensureSessionJoinToken(sessionId);
      const ideas = await loadGuestIdeasForSession(sessionId);
      res.json({
        joinToken,
        ideas: ideas.map((row) => serializeGuestIdea(row)),
      });
    },
  );

  app.patch(
    "/api/sessions/:sessionId/guest-ideas/:ideaId",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const sessionId = routeParam(req.params.sessionId);
      const ideaId = routeParam(req.params.ideaId);
      if (!sessionId || !ideaId) {
        return errorResponse(res, "Некорректный id", 400);
      }
      const action = req.body?.action;
      if (action !== "take") {
        return errorResponse(res, "Некорректные данные", 400);
      }
      const pool = getSql();
      const rows = await pool<{ departmentId: string }[]>`
        SELECT c."departmentId"
        FROM "CaseSession" cs
        JOIN "Case" c ON c.id = cs."caseId"
        WHERE cs.id = ${sessionId}
        LIMIT 1
      `;
      const cs = rows[0];
      if (!cs) return errorResponse(res, "Сессия не найдена", 404);
      if (
        a.session.user.role === "TEACHER" &&
        !canManageCase(a.session, cs.departmentId)
      ) {
        return errorResponse(res, "Нет доступа", 403);
      }
      const idea = await markGuestIdeaTaken(sessionId, ideaId);
      if (!idea) return errorResponse(res, "Идея не найдена", 404);
      res.json({ idea: serializeGuestIdea(idea) });
    },
  );
}
