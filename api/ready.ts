import type { IncomingMessage, ServerResponse } from "node:http";

/** Минимальная проверка: если в браузере видите JSON — serverless на Vercel живы. */
export default function ready(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, route: "api/ready" }));
}
