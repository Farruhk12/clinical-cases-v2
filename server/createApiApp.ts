import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { corsMiddleware } from "./cors";
import { registerApi } from "./registerApi";

/** Только REST API — для Vercel Serverless и локального `server/index.ts`. */
export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));
  app.use(cookieParser());
  app.use(corsMiddleware());
  registerApi(app);
  return app;
}
