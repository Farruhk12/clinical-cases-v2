import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getSql } from "../src/lib/db";
import { requireUser, sendAuth, errorResponse } from "../src/lib/api-auth";
import { routeParam } from "./param";
import {
  computeAiCost,
  costMarkupMultiplier,
  priceInputPerMillion,
  priceOutputPerMillion,
} from "../src/lib/ai-cost";

const loginSchema = z
  .string()
  .min(1)
  .max(128)
  .transform((s) => s.trim());

const createUserSchema = z.object({
  login: loginSchema,
  password: z.string().min(6),
  name: z.string().min(1).nullable().optional(),
  role: z.enum(["ADMIN", "TEACHER"]),
  departmentId: z.string().nullable().optional(),
});

const patchUserSchema = z.object({
  login: z
    .string()
    .min(1)
    .max(128)
    .transform((s) => s.trim())
    .optional(),
  password: z.string().min(6).optional(),
  name: z.string().nullable().optional(),
  role: z.enum(["ADMIN", "TEACHER"]).optional(),
  departmentId: z.string().nullable().optional(),
});

export function registerAdminRoutes(app: Express) {
  /* ───── список пользователей ───── */
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    if (a.session.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const sql = getSql();
    const rows = await sql<
      {
        id: string;
        login: string;
        name: string | null;
        role: string;
        departmentId: string | null;
        departmentName: string | null;
      }[]
    >`
      SELECT u.id, u.login, u.name, u.role, u."departmentId",
             d.name AS "departmentName"
      FROM "User" u
      LEFT JOIN "Department" d ON d.id = u."departmentId"
      ORDER BY u.login
    `;
    res.json({ users: rows });
  });

  /* ───── создание пользователя ───── */
  app.post("/api/admin/users", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    if (a.session.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    let body: z.infer<typeof createUserSchema>;
    try {
      body = createUserSchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }
    const id = randomUUID();
    const hash = await bcrypt.hash(body.password, 10);
    const sql = getSql();
    try {
      await sql`
        INSERT INTO "User" (id, login, "passwordHash", name, role, "departmentId")
        VALUES (${id}, ${body.login}, ${hash}, ${body.name?.trim() ?? null}, ${body.role}, ${body.departmentId ?? null})
      `;
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "23505"
      ) {
        return errorResponse(
          res,
          "Пользователь с таким логином уже существует",
          409,
        );
      }
      throw e;
    }
    res.json({
      user: {
        id,
        login: body.login,
        name: body.name?.trim() ?? null,
        role: body.role,
        departmentId: body.departmentId ?? null,
      },
    });
  });

  /* ───── редактирование пользователя ───── */
  app.patch("/api/admin/users/:id", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    if (a.session.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userId = routeParam(req.params.id);
    if (!userId) return errorResponse(res, "Некорректный id", 400);

    let body: z.infer<typeof patchUserSchema>;
    try {
      body = patchUserSchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }

    const sql = getSql();
    const existing = (
      await sql<
        {
          id: string;
          login: string;
          passwordHash: string;
          name: string | null;
          role: string;
          departmentId: string | null;
        }[]
      >`SELECT id, login, "passwordHash", name, role, "departmentId" FROM "User" WHERE id = ${userId}`
    )[0];
    if (!existing) return errorResponse(res, "Пользователь не найден", 404);

    const login = body.login ?? existing.login;
    const name = body.name !== undefined ? (body.name?.trim() ?? null) : existing.name;
    const role = body.role ?? existing.role;
    const departmentId =
      body.departmentId !== undefined ? body.departmentId : existing.departmentId;
    const passwordHash = body.password
      ? await bcrypt.hash(body.password, 10)
      : existing.passwordHash;

    try {
      await sql`
        UPDATE "User"
        SET login = ${login},
            "passwordHash" = ${passwordHash},
            name = ${name},
            role = ${role},
            "departmentId" = ${departmentId}
        WHERE id = ${userId}
      `;
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "23505"
      ) {
        return errorResponse(
          res,
          "Пользователь с таким логином уже существует",
          409,
        );
      }
      throw e;
    }
    res.json({
      user: { id: userId, login, name, role, departmentId },
    });
  });

  /* ───── удаление пользователя ───── */
  app.delete("/api/admin/users/:id", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    if (a.session.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userId = routeParam(req.params.id);
    if (!userId) return errorResponse(res, "Некорректный id", 400);
    if (a.session.user.id === userId) {
      return errorResponse(res, "Нельзя удалить собственный аккаунт", 400);
    }

    const sql = getSql();
    const existing = (
      await sql<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId}`
    )[0];
    if (!existing) return errorResponse(res, "Пользователь не найден", 404);

    const sessions = (
      await sql<[{ c: number }]>`
        SELECT COUNT(*)::int AS c FROM "CaseSession" WHERE "leaderUserId" = ${userId}
      `
    )[0];
    if (sessions.c > 0) {
      return errorResponse(
        res,
        "Нельзя удалить пользователя — он является ведущим в сессиях",
        409,
      );
    }

    await sql`DELETE FROM "StudyGroupMember" WHERE "userId" = ${userId}`;
    await sql`DELETE FROM "User" WHERE id = ${userId}`;
    res.json({ ok: true });
  });

  /* ───── расходы на ИИ (Настройки → Расходы на ИИ) ───── */
  app.get("/api/admin/ai-usage", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    if (a.session.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const sql = getSql();

    const totalsRows = await sql<
      { promptTokens: number; completionTokens: number; callCount: number }[]
    >`
      SELECT
        COALESCE(SUM("promptTokens"), 0)::int AS "promptTokens",
        COALESCE(SUM("completionTokens"), 0)::int AS "completionTokens",
        COUNT(*)::int AS "callCount"
      FROM "AiUsageLog"
    `;
    const totals = totalsRows[0] ?? { promptTokens: 0, completionTokens: 0, callCount: 0 };

    const byCaseRows = await sql<
      {
        caseId: string;
        caseTitle: string;
        promptTokens: number;
        completionTokens: number;
        callCount: number;
        sessionCount: number;
      }[]
    >`
      SELECT
        c.id AS "caseId",
        c.title AS "caseTitle",
        COALESCE(SUM(u."promptTokens"), 0)::int AS "promptTokens",
        COALESCE(SUM(u."completionTokens"), 0)::int AS "completionTokens",
        COUNT(u.id)::int AS "callCount",
        COUNT(DISTINCT u."caseSessionId")::int AS "sessionCount"
      FROM "AiUsageLog" u
      JOIN "CaseSession" cs ON cs.id = u."caseSessionId"
      JOIN "Case" c ON c.id = cs."caseId"
      GROUP BY c.id, c.title
      ORDER BY SUM(u."promptTokens" + u."completionTokens") DESC
    `;

    const bySessionRows = await sql<
      {
        caseSessionId: string;
        caseTitle: string;
        studyGroupName: string;
        startedAt: Date;
        promptTokens: number;
        completionTokens: number;
        callCount: number;
      }[]
    >`
      SELECT
        cs.id AS "caseSessionId",
        c.title AS "caseTitle",
        sg.name AS "studyGroupName",
        cs."startedAt",
        COALESCE(SUM(u."promptTokens"), 0)::int AS "promptTokens",
        COALESCE(SUM(u."completionTokens"), 0)::int AS "completionTokens",
        COUNT(u.id)::int AS "callCount"
      FROM "AiUsageLog" u
      JOIN "CaseSession" cs ON cs.id = u."caseSessionId"
      JOIN "Case" c ON c.id = cs."caseId"
      JOIN "StudyGroup" sg ON sg.id = cs."studyGroupId"
      GROUP BY cs.id, c.title, sg.name, cs."startedAt"
      ORDER BY cs."startedAt" DESC
      LIMIT 50
    `;

    res.json({
      pricing: {
        inputPerMillionUsd: priceInputPerMillion(),
        outputPerMillionUsd: priceOutputPerMillion(),
        markupMultiplier: costMarkupMultiplier(),
      },
      totals: {
        ...totals,
        ...computeAiCost(totals),
      },
      byCase: byCaseRows.map((r) => ({
        ...r,
        ...computeAiCost(r),
      })),
      bySession: bySessionRows.map((r) => ({
        ...r,
        startedAt: r.startedAt,
        ...computeAiCost(r),
      })),
    });
  });
}
