import type { Express, Request, Response } from "express";
import { requireUser, sendAuth, errorResponse } from "../src/lib/api-auth";
import { isStaff } from "../src/lib/authz";
import {
  fetchAllDepartmentsSummary,
  fetchCaseStatsForDepartment,
  fetchDepartmentSummary,
  fetchStudyGroupStatsForDepartment,
} from "../src/lib/department-analytics";
import { getSql } from "../src/lib/db";

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/analytics/departments", async (req: Request, res: Response) => {
    const a = await requireUser(req);
    if (sendAuth(res, a)) return;
    const { session } = a;
    if (!isStaff(session.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const qDept =
      typeof req.query.departmentId === "string"
        ? req.query.departmentId.trim()
        : "";

    if (session.user.role === "TEACHER") {
      const dept = session.user.departmentId;
      if (!dept) {
        return errorResponse(res, "У преподавателя не указана кафедра", 400);
      }
      const summary = await fetchDepartmentSummary(dept);
      if (!summary) {
        return errorResponse(res, "Кафедра не найдена", 404);
      }
      const [byStudyGroup, byCase] = await Promise.all([
        fetchStudyGroupStatsForDepartment(dept),
        fetchCaseStatsForDepartment(dept),
      ]);
      return res.json({
        scope: "department" as const,
        departments: [summary],
        byStudyGroup,
        byCase,
      });
    }

    // ADMIN
    if (!qDept) {
      const departments = await fetchAllDepartmentsSummary();
      return res.json({
        scope: "all" as const,
        departments,
        byStudyGroup: [],
        byCase: [],
      });
    }

    const pool = getSql();
    const exists = await pool<{ id: string }[]>`
      SELECT id FROM "Department" WHERE id = ${qDept} LIMIT 1
    `;
    if (!exists[0]) {
      return errorResponse(res, "Кафедра не найдена", 404);
    }
    const summary = await fetchDepartmentSummary(qDept);
    const [byStudyGroup, byCase] = await Promise.all([
      fetchStudyGroupStatsForDepartment(qDept),
      fetchCaseStatsForDepartment(qDept),
    ]);
    return res.json({
      scope: "department" as const,
      departments: summary ? [summary] : [],
      byStudyGroup,
      byCase,
    });
  });
}
