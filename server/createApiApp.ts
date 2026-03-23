import type { Request, Response } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import { getSql } from "../src/lib/db";
import { corsMiddleware } from "./cors";
import { registerApi } from "./registerApi";

export type CreateApiAppOptions = {
  /** Vercel: rewrite шлёт запрос на /api?path=… — восстанавливаем реальный путь до роутов. */
  vercelPathRewrite?: boolean;
};

/** Только REST API — для Vercel (`api/index.js` из `_entry.ts`) и локального `server/index.ts`. */
export function createApiApp(options?: CreateApiAppOptions) {
  const app = express();

  if (options?.vercelPathRewrite) {
    app.use((req: Request, res: Response, next) => {
      const raw = req.query.path;
      if (typeof raw !== "string" || raw.length === 0) {
        next();
        return;
      }
      if (raw.includes("..")) {
        res.status(400).json({ error: "Bad path" });
        return;
      }
      let tail: string;
      try {
        tail = decodeURIComponent(raw).replace(/^\/+/, "");
      } catch {
        res.status(400).json({ error: "Bad path" });
        return;
      }
      const q = { ...req.query } as Record<string, unknown>;
      delete q.path;
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) search.append(k, String(item));
        } else {
          search.set(k, String(v));
        }
      }
      const qstr = search.toString();
      req.url = "/api/" + tail + (qstr ? "?" + qstr : "");
      next();
    });
  }

  app.use(express.json({ limit: "4mb" }));
  app.use(cookieParser());
  app.use(corsMiddleware());

  app.get("/api/health", (_req, res) => {
    void (async () => {
      try {
        const sql = getSql();
        await sql`SELECT 1 AS x`;
        res.json({ ok: true, db: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error";
        console.error("[api/health] DB check failed:", msg);
        res.status(503).json({
          ok: false,
          db: false,
          error: msg,
          hint: /getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/i.test(msg)
            ? "DATABASE_URL не может подключиться. Используйте pooler строку из Supabase (порт 6543)."
            : /DATABASE_URL/i.test(msg)
              ? "Переменная DATABASE_URL не задана в Vercel Environment Variables."
              : undefined,
        });
      }
    })();
  });

  registerApi(app);
  return app;
}
