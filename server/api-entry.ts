/**
 * Точка входа для Vercel Serverless Function.
 * esbuild собирает этот файл в api/index.js.
 *
 * Vercel вызывает обработчик как Node (req, res), не как Lambda event.
 */
import { createApiApp } from "./createApiApp";

export default createApiApp({ vercelPathRewrite: true });
