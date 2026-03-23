import type { Response } from "express";
import { SESSION_COOKIE_NAME } from "../src/lib/session-token";

/** Режим «фронт и API на разных origin» — нужен CORS_ORIGIN и SameSite=None. */
export function isCrossOriginApi(): boolean {
  return Boolean(process.env.CORS_ORIGIN?.trim());
}

function sessionCookieAttrs() {
  const cross = isCrossOriginApi();
  return {
    httpOnly: true as const,
    sameSite: cross ? ("none" as const) : ("lax" as const),
    path: "/" as const,
    secure: cross ? true : process.env.NODE_ENV === "production",
  };
}

const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000;

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieAttrs(),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieAttrs());
}
