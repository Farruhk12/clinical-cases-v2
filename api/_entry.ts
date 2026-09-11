/**
 * Исходник для esbuild → api/index.js на Vercel (вся server/ + src/ внутри бандла).
 * Префикс _ — Vercel не создаёт для этого файла отдельную serverless-функцию.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../server/createApiApp";

type ExpressHandle = {
  handle: (req: IncomingMessage, res: ServerResponse) => void;
};

const app = createApiApp({ vercelPathRewrite: true }) as unknown as ExpressHandle;

export default function handler(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  app.handle(req, res);
}
