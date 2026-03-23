/**
 * Vercel Serverless: один обработчик для всего /api/* (rewrite → /api?path=…).
 * Исходный .ts в репозитории — стандартный путь Vercel, без отдельного esbuild.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../server/createApiApp";

const app = createApiApp({ vercelPathRewrite: true });

export default function handler(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  app.handle(req as never, res as never);
}
