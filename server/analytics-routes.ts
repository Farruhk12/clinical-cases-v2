import type { Express, Request, Response } from "express";
import { requireUser, sendAuth, errorResponse } from "../src/lib/api-auth";
import { isStaff } from "../src/lib/authz";
import {
  fetchAllDepartmentsSummary,
  fetchCaseStatsForDepartment,
  fetchDepartmentSummary,
  fetchStudyGroupStatsForDepartment,
} from "../src/lib/department-analytics";
import {
  fetchAnalyticsSessionDetail,
  fetchTeacherAnalytics,
} from "../src/lib/teacher-analytics";
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

  app.get("/api/analytics/teacher", async (req: Request, res: Response) => {
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
    const groupId =
      typeof req.query.groupId === "string" ? req.query.groupId.trim() : "";
    const caseId =
      typeof req.query.caseId === "string" ? req.query.caseId.trim() : "";

    let departmentId = session.user.departmentId;
    if (session.user.role === "ADMIN") {
      departmentId = qDept || departmentId;
    }
    if (!departmentId) {
      return errorResponse(res, "Укажите кафедру", 400);
    }
    if (session.user.role === "TEACHER" && session.user.departmentId !== departmentId) {
      return errorResponse(res, "Нет доступа", 403);
    }

    const payload = await fetchTeacherAnalytics({
      departmentId,
      groupId: groupId || undefined,
      caseId: caseId || undefined,
    });
    if (!payload) return errorResponse(res, "Кафедра не найдена", 404);
    res.json(payload);
  });

  app.get(
    "/api/analytics/sessions/:sessionId",
    async (req: Request, res: Response) => {
      const a = await requireUser(req);
      if (sendAuth(res, a)) return;
      const { session } = a;
      if (!isStaff(session.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const sessionId =
        typeof req.params.sessionId === "string" ? req.params.sessionId : "";
      if (!sessionId) return errorResponse(res, "Некорректный id", 400);
      const detail = await fetchAnalyticsSessionDetail(
        sessionId,
        session.user.departmentId,
        session.user.role === "ADMIN",
      );
      if (!detail) return errorResponse(res, "Занятие не найдено", 404);
      res.json(detail);
    },
  );
}
