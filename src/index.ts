/**
 * Точка входа Express на Vercel (Fluid / backend): тот же API, что локально.
 * Статика и SPA — из `dist` через outputDirectory + rewrites в vercel.json.
 */
import { createApiApp } from "../server/createApiApp";

export default createApiApp();
