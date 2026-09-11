import type { Express } from "express";
import { registerSessionRoutes } from "./session-routes";
import { registerJoinRoutes } from "./join-routes";
import { registerMiscRoutes } from "./misc-routes";
import { registerAdminRoutes } from "./admin-routes";
import { registerAnalyticsRoutes } from "./analytics-routes";

export function registerRestRoutes(app: Express) {
  registerSessionRoutes(app);
  registerJoinRoutes(app);
  registerMiscRoutes(app);
  registerAdminRoutes(app);
  registerAnalyticsRoutes(app);
}
