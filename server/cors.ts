import type { RequestHandler } from "express";

export function getCorsAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsMiddleware(): RequestHandler {
  const allowed = getCorsAllowedOrigins();
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.append("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
      );
      const reqHdr = req.headers["access-control-request-headers"];
      res.setHeader(
        "Access-Control-Allow-Headers",
        typeof reqHdr === "string" && reqHdr.length > 0
          ? reqHdr
          : "Content-Type",
      );
      res.setHeader("Access-Control-Max-Age", "86400");
      res.status(204).end();
      return;
    }
    next();
  };
}
