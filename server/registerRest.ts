import type { Express } from "express";
import { registerSessionRoutes } from "./session-routes";
import { registerMiscRoutes } from "./misc-routes";
import { registerAdminRoutes } from "./admin-routes";
import { registerAnalyticsRoutes } from "./analytics-routes";

export function registerRestRoutes(app: Express) {
  registerSessionRoutes(app);
  registerMiscRoutes(app);
  registerAdminRoutes(app);
  registerAnalyticsRoutes(app);
}
