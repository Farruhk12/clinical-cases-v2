/**
 * Vercel Serverless: явный вызов app.handle (надёжнее, чем default export приложения).
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
