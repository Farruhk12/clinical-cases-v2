import { getSql } from "./db";
import type { CaseDetail } from "../types/case-detail";
import type { BlockType } from "../types/db";

export type { CaseDetail };

export async function loadCaseDetail(caseId: string): Promise<CaseDetail | null> {
  const sql = getSql();
  const caseRows = await sql<
    {
      id: string;
      title: string;
      description: string | null;
      published: boolean;
      teacherKey: string | null;
      caseVersion: number;
      departmentId: string;
    }[]
  >`SELECT id, title, description, published, "teacherKey", "caseVersion", "departmentId" FROM "Case" WHERE id = ${caseId}`;
  const c = caseRows[0];
  if (!c) return null;

  const deptRows = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM "Department" WHERE id = ${c.departmentId}
  `;
  const department = deptRows[0];
  if (!department) return null;

  const caseFaculties = await sql<
    {
      caseId: string;
      facultyId: string;
      faculty: { id: string; name: string };
    }[]
  >`
    SELECT cf."caseId", cf."facultyId",
      json_build_object('id', f.id, 'name', f.name) as faculty
    FROM "CaseFaculty" cf
    JOIN "Faculty" f ON f.id = cf."facultyId"
    WHERE cf."caseId" = ${caseId}
  `;

  const caseCourseLevels = await sql<
    {
      caseId: string;
      courseLevelId: string;
      courseLevel: { id: string; name: string; sort: number };
    }[]
  >`
    SELECT ccl."caseId", ccl."courseLevelId",
      json_build_object('id', cl.id, 'name', cl.name, 'sort', cl.sort) as "courseLevel"
    FROM "CaseCourseLevel" ccl
    JOIN "CourseLevel" cl ON cl.id = ccl."courseLevelId"
    WHERE ccl."caseId" = ${caseId}
  `;

  const stages = await sql<
    {
      id: string;
      caseId: string;
      order: number;
      title: string;
      isFinalReveal: boolean;
      learningGoals: string | null;
    }[]
  >`
    SELECT id, "caseId", "order", title, "isFinalReveal", "learningGoals"
    FROM "CaseStage"
    WHERE "caseId" = ${caseId}
    ORDER BY "order" ASC
  `;

  type BlockRow = {
    id: string;
    caseStageId: string;
    order: number;
    blockType: BlockType;
    rawText: string | null;
    formattedContent: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
  };
  const stageIds = stages.map((s) => s.id);
  const allBlocks: BlockRow[] = stageIds.length
    ? await sql<BlockRow[]>`
        SELECT id, "caseStageId", "order", "blockType", "rawText", "formattedContent", "imageUrl", "imageAlt"
        FROM "StageBlock"
        WHERE "caseStageId" = ANY(${sql.array(stageIds)})
        ORDER BY "order" ASC
      `
    : [];
  const blocksByStage = new Map<string, BlockRow[]>();
  for (const b of allBlocks) {
    const arr = blocksByStage.get(b.caseStageId) ?? [];
    arr.push(b);
    blocksByStage.set(b.caseStageId, arr);
  }
  const stagesWithBlocks = stages.map((st) => ({
    ...st,
    blocks: blocksByStage.get(st.id) ?? [],
  }));

  return {
    ...c,
    department,
    caseFaculties,
    caseCourseLevels,
    stages: stagesWithBlocks,
  };
}
