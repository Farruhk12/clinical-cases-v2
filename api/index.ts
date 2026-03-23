/**
 * Serverless-точка Vercel: исходник в git, без отдельного esbuild-шага.
 * Иначе /api/* отдаётся как SPA → React Router: «No routes matched "/api/health"».
 */
import { createApiApp } from "../server/createApiApp";

export default createApiApp({ vercelPathRewrite: true });
