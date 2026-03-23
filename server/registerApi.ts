import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { fetchCaseListForRole } from "../src/lib/case-list";
import { loadCaseDetail } from "../src/lib/case-detail";
import { buildCasePptxBuffer } from "../src/lib/case-export-pptx";
import { asTransactionSql, getSql } from "../src/lib/db";
import { requireUser, sendAuth, errorResponse } from "../src/lib/api-auth";
import { isStaff, canManageCase } from "../src/lib/authz";
import { createSessionToken } from "../src/lib/session-token";
import { clearSessionCookie, setSessionCookie } from "./session-cookie";
import type { Role } from "../src/types/db";
import { routeParam } from "./param";
import { registerRestRoutes } from "./registerRest";

function authErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Ошибка сервера";
  const m = err.message;
  if (m.includes("DATABASE_URL")) {
    return "Сервер: в .env не задан DATABASE_URL (строка Postgres из Supabase).";
  }
  if (m.includes("AUTH_SECRET")) {
    return "Сервер: в .env не задан AUTH_SECRET (случайная длинная строка).";
  }
  if (
    /getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|no address/i.test(m)
  ) {
    return (
      "Не удаётся достучаться до Postgres (DNS/сеть). У хоста db.*.supabase.co часто только IPv6 — " +
      "на Windows без IPv6 бывает ошибка вроде getaddrinfo ENOENT. " +
      "Возьми в Supabase: Project Settings → Database → Connection string → режим «Session pooler» или «Transaction» " +
      "(порт 6543, другой хост pooler), подставь пароль и вставь URI в DATABASE_URL."
    );
  }
  if (process.env.NODE_ENV !== "production") {
    return m;
  }
  return "Ошибка сервера";
}

export function registerApi(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const login = req.body?.login;
      const password = req.body?.password;
      if (!login || !password) {
        return errorResponse(res, "Нужны логин и пароль", 400);
      }
      const sql = getSql();
      const rows = await sql<
        {
          id: string;
          login: string;
          passwordHash: string;
          name: string | null;
          role: string;
          departmentId: string | null;
        }[]
      >`
      SELECT id, login, "passwordHash", name, role, "departmentId"
      FROM "User" WHERE login = ${String(login).trim()} LIMIT 1
    `;
      const user = rows[0];
      if (!user) {
        return errorResponse(res, "Неверный логин или пароль", 401);
      }
      const ok = await bcrypt.compare(String(password), user.passwordHash);
      if (!ok) {
        return errorResponse(res, "Неверный логин или пароль", 401);
      }
      if (user.role !== "ADMIN" && user.role !== "TEACHER") {
        return errorResponse(
          res,
          "Вход только для администраторов и преподавателей",
          403,
        );
      }
      const token = await createSessionToken({
        sub: user.id,
        login: user.login,
        name: user.name,
        role: user.role as Role,
        departmentId: user.departmentId,
      });
      setSessionCookie(res, token);
      res.json({ ok: true });
    } catch (err) {
      console.error("[api/auth/login]", err);
      return errorResponse(res, authErrorMessage(err), 500);
    }
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const a = await requireUser(req);
      if (!a.ok) {
        return res.json({ user: null });
      }
      const u = a.session.user;
      res.json({
        user: {
          id: u.id,
          login: u.login,
          name: u.name,
          role: u.role,
          departmentId: u.departmentId,
        },
      });
    } catch (err) {
      console.error("[api/auth/session]", err);
      return errorResponse(res, authErrorMessage(err), 500);
    }
  });

  registerCasesRoutes(app);
  registerRestRoutes(app);
}

function registerCasesRoutes(app: Express) {
  const createSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    departmentId: z.string(),
    facultyIds: z.array(z.string()).min(1),
    courseLevelIds: z.array(z.string()).min(1),
    published: z.boolean().optional(),
    teacherKey: z.string().optional(),
  });

  app.get("/api/cases", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    if (session.user.role === "TEACHER" && !session.user.departmentId) {
      return errorResponse(res, "У преподавателя не указана кафедра", 400);
    }
    const cases = await fetchCaseListForRole(
      session.user.role,
      session.user.departmentId,
    );
    res.json({ cases });
  });

  app.post("/api/cases", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    if (!isStaff(session.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    let body: z.infer<typeof createSchema>;
    try {
      body = createSchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }
    if (session.user.role === "TEACHER") {
      if (body.departmentId !== session.user.departmentId) {
        return errorResponse(res, "Кафедра не совпадает с вашей", 403);
      }
    }
    const id = randomUUID();
    const published = body.published ?? false;
    const description = body.description ?? null;
    const teacherKey = body.teacherKey ?? null;
    const uniqFac = [...new Set(body.facultyIds)];
    const uniqCourse = [...new Set(body.courseLevelIds)];
    const pool = getSql();
    await pool.begin(async (txn) => {
      const sql = asTransactionSql(pool, txn);
      await sql`
        INSERT INTO "Case" (id, title, description, published, "teacherKey", "caseVersion", "departmentId")
        VALUES (${id}, ${body.title}, ${description}, ${published}, ${teacherKey}, 1, ${body.departmentId})
      `;
      for (const facultyId of uniqFac) {
        await sql`
          INSERT INTO "CaseFaculty" ("caseId", "facultyId") VALUES (${id}, ${facultyId})
        `;
      }
      for (const courseLevelId of uniqCourse) {
        await sql`
          INSERT INTO "CaseCourseLevel" ("caseId", "courseLevelId") VALUES (${id}, ${courseLevelId})
        `;
      }
    });
    const rows = await pool<
      {
        id: string;
        title: string;
        description: string | null;
        published: boolean;
        teacherKey: string | null;
        caseVersion: number;
        departmentId: string;
      }[]
    >`SELECT id, title, description, published, "teacherKey", "caseVersion", "departmentId" FROM "Case" WHERE id = ${id}`;
    res.json({ case: rows[0] });
  });

  const blockTypes = z.enum([
    "PLAIN",
    "PATIENT_SPEECH",
    "DOCTOR_NOTES",
    "NARRATOR",
    "IMAGE_URL",
  ]);
  const blockSchema = z.object({
    id: z.string().optional(),
    order: z.number().int().min(0),
    blockType: blockTypes,
    rawText: z.string().nullable().optional(),
    formattedContent: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    imageAlt: z.string().nullable().optional(),
  });
  const stageSchema = z.object({
    id: z.string().optional(),
    order: z.number().int().min(1),
    title: z.string().min(1),
    isFinalReveal: z.boolean().optional(),
    learningGoals: z.string().nullable().optional(),
    blocks: z.array(blockSchema),
  });
  const patchSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    published: z.boolean().optional(),
    teacherKey: z.string().nullable().optional(),
    departmentId: z.string().optional(),
    facultyIds: z.array(z.string()).min(1).optional(),
    courseLevelIds: z.array(z.string()).min(1).optional(),
    stages: z.array(stageSchema).optional(),
  });

  function stripTeacherKey<T extends { teacherKey?: string | null }>(
    obj: T,
    show: boolean,
  ): Omit<T, "teacherKey"> & { teacherKey?: string | null } {
    if (show) return obj;
    const { teacherKey, ...rest } = obj;
    void teacherKey;
    return rest;
  }

  app.get("/api/cases/:caseId", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    const caseId = routeParam(req.params.caseId);
    if (!caseId) return errorResponse(res, "Некорректный id кейса", 400);
    const medicalCase = await loadCaseDetail(caseId);
    if (!medicalCase) return errorResponse(res, "Кейс не найден", 404);
    if (session.user.role === "TEACHER") {
      if (!canManageCase(session, medicalCase.departmentId)) {
        return errorResponse(res, "Нет доступа к кейсу", 403);
      }
    }
    const showTeacherKey =
      session.user.role === "ADMIN" || session.user.role === "TEACHER";
    const pool = getSql();
    const cntRows = await pool<[{ c: number }]>`
      SELECT COUNT(*)::int AS c FROM "CaseSession" WHERE "caseId" = ${caseId}
    `;
    const sessionCount = cntRows[0]?.c ?? 0;
    res.json({
      case: stripTeacherKey(medicalCase, showTeacherKey),
      sessionCount,
    });
  });

  app.get(
    "/api/cases/:caseId/export/pptx",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const { session } = a;
      const caseId = routeParam(req.params.caseId);
      if (!caseId) return errorResponse(res, "Некорректный id кейса", 400);
      const medicalCase = await loadCaseDetail(caseId);
      if (!medicalCase) return errorResponse(res, "Кейс не найден", 404);
      if (session.user.role === "TEACHER") {
        if (!canManageCase(session, medicalCase.departmentId)) {
          return errorResponse(res, "Нет доступа к кейсу", 403);
        }
      }
      try {
        const buffer = await buildCasePptxBuffer(medicalCase);
        const utfName = `${medicalCase.title.trim() || "case"}.pptx`;
        const asciiName = `case-${caseId.slice(0, 8)}.pptx`;
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utfName)}`,
        );
        res.send(buffer);
      } catch (err) {
        console.error("export/pptx", err);
        const hint =
          process.env.NODE_ENV !== "production" && err instanceof Error
            ? `: ${err.message}`
            : "";
        return errorResponse(
          res,
          `Не удалось сформировать презентацию${hint}`,
          500,
        );
      }
    },
  );

  app.patch("/api/cases/:caseId", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    const caseId = routeParam(req.params.caseId);
    if (!caseId) return errorResponse(res, "Некорректный id кейса", 400);
    if (!isStaff(session.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    let body: z.infer<typeof patchSchema>;
    try {
      body = patchSchema.parse(req.body);
    } catch {
      return errorResponse(res, "Некорректные данные", 400);
    }
    const pool = getSql();
    const existingRows = await pool<
      {
        id: string;
        departmentId: string;
        title: string;
        description: string | null;
        published: boolean;
        teacherKey: string | null;
        caseVersion: number;
      }[]
    >`
      SELECT id, "departmentId", title, description, published, "teacherKey", "caseVersion"
      FROM "Case" WHERE id = ${caseId}
    `;
    const existingCase = existingRows[0];
    if (!existingCase) return errorResponse(res, "Кейс не найден", 404);
    if (!canManageCase(session, existingCase.departmentId)) {
      return errorResponse(res, "Нет доступа", 403);
    }
    const stageRows = await pool<{ id: string }[]>`
      SELECT id FROM "CaseStage" WHERE "caseId" = ${caseId}
    `;
    const existingStageIds = new Set(stageRows.map((s) => s.id));
    const ids = [...existingStageIds];
    const blockRows =
      ids.length === 0
        ? []
        : await pool<{ id: string; caseStageId: string }[]>`
            SELECT id, "caseStageId" FROM "StageBlock" WHERE "caseStageId" IN ${pool(ids)}
          `;
    const blocksByStage = new Map<string, { id: string }[]>();
    for (const b of blockRows) {
      const list = blocksByStage.get(b.caseStageId) ?? [];
      list.push({ id: b.id });
      blocksByStage.set(b.caseStageId, list);
    }
    const existing = {
      ...existingCase,
      stages: stageRows.map((s) => ({
        id: s.id,
        blocks: blocksByStage.get(s.id) ?? [],
      })),
    };
    if (
      session.user.role === "TEACHER" &&
      body.departmentId !== undefined &&
      body.departmentId !== session.user.departmentId
    ) {
      return errorResponse(res, "Кафедра не совпадает с вашей", 403);
    }
    const sessionCountRows = await pool<[{ count: string }]>`
      SELECT COUNT(*)::text as count FROM "CaseSession" WHERE "caseId" = ${caseId}
    `;
    const sessionCount = Number(sessionCountRows[0]?.count ?? 0);
    const wantsScopeChange =
      body.departmentId !== undefined ||
      body.facultyIds !== undefined ||
      body.courseLevelIds !== undefined;
    if (sessionCount > 0 && wantsScopeChange) {
      return errorResponse(
        res,
        "Нельзя менять кафедру, факультеты или курсы при наличии сессий",
        409,
      );
    }
    if (body.stages && sessionCount > 0) {
      const existingIds = new Set(existing.stages.map((s) => s.id));
      for (const st of body.stages) {
        if (!st.id || !existingIds.has(st.id)) {
          return errorResponse(
            res,
            "Нельзя менять структуру этапов: уже есть сессии прохождения",
            409,
          );
        }
      }
      if (body.stages.length !== existing.stages.length) {
        return errorResponse(
          res,
          "Нельзя менять число этапов при наличии сессий",
          409,
        );
      }
    }
    const shouldBumpVersion =
      !!body.stages ||
      body.title !== undefined ||
      body.departmentId !== undefined ||
      body.facultyIds !== undefined ||
      body.courseLevelIds !== undefined;
    const hasMetaPatch =
      body.title !== undefined ||
      body.description !== undefined ||
      body.published !== undefined ||
      body.teacherKey !== undefined ||
      body.departmentId !== undefined ||
      body.facultyIds !== undefined ||
      body.courseLevelIds !== undefined;
    if (!hasMetaPatch && !body.stages) {
      return errorResponse(res, "Нет полей для обновления", 400);
    }
    const title = body.title ?? existingCase.title;
    const description =
      body.description !== undefined
        ? body.description
        : existingCase.description;
    const published =
      body.published !== undefined ? body.published : existingCase.published;
    const teacherKey =
      body.teacherKey !== undefined
        ? body.teacherKey
        : existingCase.teacherKey;
    const departmentId =
      body.departmentId !== undefined
        ? body.departmentId
        : existingCase.departmentId;
    try {
      await pool.begin(async (txn) => {
        const sql = asTransactionSql(pool, txn);
        if (hasMetaPatch) {
          await sql`
            UPDATE "Case"
            SET
              title = ${title},
              description = ${description},
              published = ${published},
              "teacherKey" = ${teacherKey},
              "departmentId" = ${departmentId},
              "caseVersion" = "caseVersion" + ${shouldBumpVersion ? 1 : 0}
            WHERE id = ${caseId}
          `;
        } else if (shouldBumpVersion) {
          await sql`
            UPDATE "Case" SET "caseVersion" = "caseVersion" + 1 WHERE id = ${caseId}
          `;
        }
        if (body.facultyIds !== undefined) {
          await sql`DELETE FROM "CaseFaculty" WHERE "caseId" = ${caseId}`;
          const uniq = [...new Set(body.facultyIds)];
          for (const facultyId of uniq) {
            await sql`
              INSERT INTO "CaseFaculty" ("caseId", "facultyId") VALUES (${caseId}, ${facultyId})
            `;
          }
        }
        if (body.courseLevelIds !== undefined) {
          await sql`DELETE FROM "CaseCourseLevel" WHERE "caseId" = ${caseId}`;
          const uniq = [...new Set(body.courseLevelIds)];
          for (const courseLevelId of uniq) {
            await sql`
              INSERT INTO "CaseCourseLevel" ("caseId", "courseLevelId") VALUES (${caseId}, ${courseLevelId})
            `;
          }
        }
        if (!body.stages) return;
        if (sessionCount === 0) {
          await sql`DELETE FROM "CaseStage" WHERE "caseId" = ${caseId}`;
          const sorted = [...body.stages].sort((a, b) => a.order - b.order);
          for (const st of sorted) {
            const stageId = randomUUID();
            await sql`
              INSERT INTO "CaseStage" (id, "caseId", "order", title, "isFinalReveal", "learningGoals")
              VALUES (${stageId}, ${caseId}, ${st.order}, ${st.title}, ${st.isFinalReveal ?? false}, ${st.learningGoals ?? null})
            `;
            for (const b of st.blocks) {
              await sql`
                INSERT INTO "StageBlock" (id, "caseStageId", "order", "blockType", "rawText", "formattedContent", "imageUrl", "imageAlt")
                VALUES (${randomUUID()}, ${stageId}, ${b.order}, ${b.blockType}, ${b.rawText ?? null}, ${b.formattedContent ?? null}, ${b.imageUrl?.trim() || null}, ${b.imageAlt ?? null})
              `;
            }
          }
          return;
        }
        for (const st of body.stages) {
          const stageId = st.id!;
          await sql`
            UPDATE "CaseStage"
            SET "order" = ${st.order}, title = ${st.title}, "isFinalReveal" = ${st.isFinalReveal ?? false}, "learningGoals" = ${st.learningGoals ?? null}
            WHERE id = ${stageId}
          `;
          const dbBlocks =
            existing.stages.find((x) => x.id === stageId)?.blocks ?? [];
          if (st.blocks.length !== dbBlocks.length) {
            throw new Error("BLOCK_COUNT_MISMATCH");
          }
          const seen = new Set<string>();
          for (const b of st.blocks) {
            if (!b.id) throw new Error("BLOCK_ID_REQUIRED");
            if (seen.has(b.id)) throw new Error("DUPLICATE_BLOCK_ID");
            seen.add(b.id);
            const match = dbBlocks.find((db) => db.id === b.id);
            if (!match) throw new Error("UNKNOWN_BLOCK");
            await sql`
              UPDATE "StageBlock"
              SET "order" = ${b.order}, "blockType" = ${b.blockType}, "rawText" = ${b.rawText ?? null}, "formattedContent" = ${b.formattedContent ?? null}, "imageUrl" = ${b.imageUrl?.trim() || null}, "imageAlt" = ${b.imageAlt ?? null}
              WHERE id = ${b.id}
            `;
          }
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (
        msg === "BLOCK_COUNT_MISMATCH" ||
        msg === "BLOCK_ID_REQUIRED" ||
        msg === "DUPLICATE_BLOCK_ID" ||
        msg === "UNKNOWN_BLOCK"
      ) {
        return errorResponse(
          res,
          "Некорректная структура блоков для кейса с активными сессиями",
          400,
        );
      }
      throw e;
    }
    const updated = await loadCaseDetail(caseId);
    const showTeacherKey =
      session.user.role === "ADMIN" || session.user.role === "TEACHER";
    res.json({
      case: updated ? stripTeacherKey(updated, showTeacherKey) : updated,
    });
  });

  app.delete("/api/cases/:caseId", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    const caseId = routeParam(req.params.caseId);
    if (!caseId) return errorResponse(res, "Некорректный id кейса", 400);
    if (!isStaff(session.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const pool = getSql();
    const rows = await pool<{ departmentId: string }[]>`
      SELECT "departmentId" FROM "Case" WHERE id = ${caseId}
    `;
    const existing = rows[0];
    if (!existing) return errorResponse(res, "Кейс не найден", 404);
    if (!canManageCase(session, existing.departmentId)) {
      return errorResponse(res, "Нет доступа", 403);
    }
    const cntRows = await pool<[{ count: string }]>`
      SELECT COUNT(*)::text as count FROM "CaseSession" WHERE "caseId" = ${caseId}
    `;
    const sc = Number(cntRows[0]?.count ?? 0);
    if (sc > 0) {
      return errorResponse(
        res,
        "Нельзя удалить кейс с существующими сессиями",
        409,
      );
    }
    await pool`DELETE FROM "Case" WHERE id = ${caseId}`;
    res.json({ ok: true });
  });

  app.delete(
    "/api/cases/:caseId/sessions",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const { session } = a;
      const caseId = routeParam(req.params.caseId);
      if (!caseId) return errorResponse(res, "Некорректный id кейса", 400);
      if (!isStaff(session.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const pool = getSql();
      const rows = await pool<{ departmentId: string }[]>`
        SELECT "departmentId" FROM "Case" WHERE id = ${caseId}
      `;
      const medicalCase = rows[0];
      if (!medicalCase) return errorResponse(res, "Кейс не найден", 404);
      if (!canManageCase(session, medicalCase.departmentId)) {
        return errorResponse(res, "Нет доступа", 403);
      }
      const cntRows = await pool<[{ c: number | null }]>`
        SELECT COUNT(*)::int AS c FROM "CaseSession" WHERE "caseId" = ${caseId}
      `;
      const count = cntRows[0]?.c ?? 0;
      await pool`DELETE FROM "CaseSession" WHERE "caseId" = ${caseId}`;
      res.json({ ok: true, deleted: count });
    },
  );
}
