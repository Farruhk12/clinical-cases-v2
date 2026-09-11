import type { CaseDetail } from "~types/case-detail";
import type { BlockType } from "~types/db";

type Department = { id: string; name: string };
type Faculty = { id: string; name: string };
type CourseLevel = { id: string; name: string; sort: number };
type Case = CaseDetail;
type CaseStage = CaseDetail["stages"][number];
type StageBlock = CaseStage["blocks"][number];
import { BlockView } from "@/components/block-view";
import { PageLoader } from "@/components/PageLoader";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { apiFetch } from "@/lib/api-fetch";
import { downloadCasePptx } from "@/lib/downloadCasePptx";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

type AiPreviewState = {
  stageId: string;
  blockId: string;
  blockType: BlockType;
  formattedContent: string;
  rawText: string | null;
  hint: string | null;
};

type StageWithBlocks = CaseStage & { blocks: StageBlock[] };

type CaseFacultyRow = { facultyId: string; faculty: Faculty };
type CaseCourseRow = { courseLevelId: string; courseLevel: CourseLevel };

export type CaseEditorPayload = Case & {
  stages: StageWithBlocks[];
  department: Department;
  caseFaculties: CaseFacultyRow[];
  caseCourseLevels: CaseCourseRow[];
};

type CaseEditorReference = {
  departments: Department[];
  faculties: Faculty[];
  courseLevels: CourseLevel[];
};

function sortedStages(list: StageWithBlocks[]) {
  return [...list].sort((a, b) => a.order - b.order);
}

function sortedBlocks(blocks: StageBlock[]) {
  return [...blocks].sort((a, b) => a.order - b.order);
}

export function CaseEditor({
  caseId,
  sessionCount,
  reference,
  fixedDepartmentId,
  initialCase,
}: {
  caseId: string;
  sessionCount: number;
  reference: CaseEditorReference;
  fixedDepartmentId?: string | null;
  initialCase?: CaseEditorPayload | null;
}) {
  const [data, setData] = useState<CaseEditorPayload | null>(
    () => initialCase ?? null,
  );
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    () => initialCase?.stages[0]?.id ?? null,
  );
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formattingBlockId, setFormattingBlockId] = useState<string | null>(
    null,
  );
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [committingPreview, setCommittingPreview] = useState(false);
  const [loading, setLoading] = useState(!initialCase);
  const [wipingSessions, setWipingSessions] = useState(false);
  const [pptxBusy, setPptxBusy] = useState(false);
  const [liveSessionCount, setLiveSessionCount] = useState(sessionCount);

  useEffect(() => {
    setLiveSessionCount(sessionCount);
  }, [sessionCount]);

  const locked = liveSessionCount > 0;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/cases/${caseId}`);
    if (!res.ok) {
      setError("Не удалось загрузить кейс");
      setLoading(false);
      return;
    }
    const j = (await res.json()) as { case: CaseEditorPayload };
    setData(j.case);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    if (initialCase?.id === caseId) {
      setData(initialCase);
      setLoading(false);
      return;
    }
    void load();
  }, [caseId, initialCase, load]);

  async function exportPptx() {
    if (!data) return;
    setPptxBusy(true);
    setError(null);
    const r = await downloadCasePptx(caseId, data.title);
    if (!r.ok) setError(r.message);
    setPptxBusy(false);
  }

  async function deleteAllSessionsForCase() {
    if (liveSessionCount <= 0) return;
    const confirmed = window.confirm(
      `Удалить все занятия этого кейса (${liveSessionCount} шт.)?\n\n` +
        "Безвозвратно удалятся прохождения: гипотезы, вопросы и результаты ИИ. После этого снова можно будет добавлять и удалять этапы.",
    );
    if (!confirmed) return;
    setWipingSessions(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/cases/${caseId}/sessions`, {
        method: "DELETE",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted?: number;
      };
      if (!res.ok) {
        setError(
          typeof j.error === "string"
            ? j.error
            : "Не удалось удалить сессии",
        );
        return;
      }
      setLiveSessionCount(0);
      await load();
    } catch {
      setError("Сеть недоступна или запрос прерван.");
    } finally {
      setWipingSessions(false);
    }
  }

  useEffect(() => {
    if (!aiPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !committingPreview) setAiPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiPreview, committingPreview]);

  const stages = useMemo(
    () => (data?.stages ? sortedStages(data.stages) : []),
    [data],
  );

  useEffect(() => {
    if (stages.length === 0) {
      setSelectedStageId(null);
      return;
    }
    if (!selectedStageId || !stages.some((s) => s.id === selectedStageId)) {
      setSelectedStageId(stages[0]!.id);
    }
  }, [stages, selectedStageId]);

  function buildPatchBody() {
    if (!data) return null;
    const orderedStages = sortedStages(data.stages);
    const n = orderedStages.length;
    return {
      title: data.title,
      description: data.description ?? null,
      published: data.published,
      teacherKey: data.teacherKey ?? null,
      departmentId: data.departmentId,
      facultyIds: data.caseFaculties.map((x) => x.facultyId),
      courseLevelIds: data.caseCourseLevels.map((x) => x.courseLevelId),
      stages: orderedStages.map((s, stageIdx) => {
        const blocks = sortedBlocks(s.blocks);
        const isLastStage = stageIdx === n - 1;
        return {
          id: s.id,
          order: stageIdx + 1,
          title: s.title,
          isFinalReveal: isLastStage && n > 0,
          learningGoals: s.learningGoals ?? null,
          blocks: blocks.map((b, i) => ({
            id: b.id,
            order: i,
            blockType: b.blockType,
            rawText: b.rawText,
            formattedContent: b.formattedContent,
            imageUrl: b.imageUrl,
            imageAlt: b.imageAlt,
          })),
        };
      }),
    };
  }

  async function persist(): Promise<CaseEditorPayload | null> {
    if (!data) return null;
    if (data.caseFaculties.length === 0 || data.caseCourseLevels.length === 0) {
      setError("Нужен хотя бы один факультет и один курс");
      return null;
    }
    const body = buildPatchBody();
    if (!body) return null;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(
          typeof j.error === "string" ? j.error : "Ошибка сохранения",
        );
        return null;
      }
      const j = (await res.json()) as { case: CaseEditorPayload };
      if (j.case) {
        setData(j.case);
        const prevOrder = stages.find((s) => s.id === selectedStageId)?.order;
        const next =
          (prevOrder
            ? sortedStages(j.case.stages).find((s) => s.order === prevOrder)
            : null) ?? sortedStages(j.case.stages)[0];
        if (next) setSelectedStageId(next.id);
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1600);
        return j.case;
      }
      return data;
    } catch {
      setError("Сеть недоступна или запрос прерван. Попробуйте ещё раз.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    await persist();
  }

  function findBlock(stageId: string, blockId: string) {
    if (!data) return null;
    const stage = data.stages.find((s) => s.id === stageId);
    return stage?.blocks.find((b) => b.id === blockId) ?? null;
  }

  async function requestAiPreview(stageId: string, blockId: string) {
    let sid = stageId;
    let bid = blockId;
    let block = findBlock(sid, bid);
    if (!block) return;
    if (bid.startsWith("temp-") || sid.startsWith("temp-")) {
      const stageIndex = stages.findIndex((s) => s.id === sid);
      const blockIndex = block
        ? sortedBlocks(stages[stageIndex]?.blocks ?? []).findIndex(
            (b) => b.id === bid,
          )
        : -1;
      const saved = await persist();
      if (!saved) return;
      const newStage = sortedStages(saved.stages)[stageIndex];
      const newBlock =
        newStage && blockIndex >= 0
          ? sortedBlocks(newStage.blocks)[blockIndex]
          : undefined;
      if (!newStage || !newBlock) {
        setError("Сохраните кейс и повторите оформление");
        return;
      }
      sid = newStage.id;
      bid = newBlock.id;
      block = newBlock;
    }
    setError(null);
    setFormattingBlockId(bid);
    try {
      const res = await apiFetch("/api/ai/format-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: bid,
          previewOnly: true,
          rawText: block.rawText ?? "",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(
          typeof j.error === "string"
            ? j.error
            : "ИИ-оформление не удалось",
        );
        return;
      }
      const j = (await res.json()) as {
        preview?: { blockType: BlockType; formattedContent: string };
        hint?: string | null;
      };
      if (!j.preview) {
        setError("Сервер не вернул предпросмотр");
        return;
      }
      setAiPreview({
        stageId: sid,
        blockId: bid,
        blockType: j.preview.blockType,
        formattedContent: j.preview.formattedContent,
        rawText: block.rawText,
        hint: j.hint ?? null,
      });
    } catch {
      setError("Сеть недоступна или запрос прерван. Попробуйте ещё раз.");
    } finally {
      setFormattingBlockId(null);
    }
  }

  async function applyAiPreview() {
    if (!aiPreview || !data) return;
    const b = findBlock(aiPreview.stageId, aiPreview.blockId);
    if (!b) return;
    setCommittingPreview(true);
    setError(null);
    try {
      const res = await apiFetch("/api/ai/format-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: aiPreview.blockId,
          commit: {
            blockType: aiPreview.blockType,
            formattedContent: aiPreview.formattedContent,
          },
          rawText: b.rawText,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(
          typeof j.error === "string"
            ? j.error
            : "Не удалось применить оформление",
        );
        return;
      }
      const j = (await res.json()) as { block: StageBlock };
      updateBlock(aiPreview.stageId, aiPreview.blockId, {
        blockType: j.block.blockType,
        formattedContent: j.block.formattedContent,
        rawText: j.block.rawText,
      });
      setAiPreview(null);
    } catch {
      setError("Сеть недоступна или запрос прерван. Попробуйте ещё раз.");
    } finally {
      setCommittingPreview(false);
    }
  }

  function updateStage(stageId: string, patch: Partial<StageWithBlocks>) {
    setData((d) =>
      d
        ? {
            ...d,
            stages: d.stages.map((s) =>
              s.id === stageId ? { ...s, ...patch } : s,
            ),
          }
        : d,
    );
  }

  function updateBlock(
    stageId: string,
    blockId: string,
    patch: Partial<StageBlock>,
  ) {
    setData((d) =>
      d
        ? {
            ...d,
            stages: d.stages.map((s) =>
              s.id !== stageId
                ? s
                : {
                    ...s,
                    blocks: s.blocks.map((b) =>
                      b.id === blockId ? { ...b, ...patch } : b,
                    ),
                  },
            ),
          }
        : d,
    );
  }

  function addStage() {
    if (!data || locked) return;
    const nextOrder =
      stages.length === 0 ? 1 : Math.max(...stages.map((s) => s.order)) + 1;
    const tempId = `temp-${crypto.randomUUID()}`;
    setData({
      ...data,
      stages: [
        ...data.stages,
        {
          id: tempId,
          caseId: data.id,
          order: nextOrder,
          title: `Этап ${stages.length + 1}`,
          isFinalReveal: false,
          learningGoals: null,
          blocks: [
            {
              id: `temp-b-${crypto.randomUUID()}`,
              caseStageId: tempId,
              order: 0,
              blockType: "PLAIN",
              rawText: "",
              formattedContent: null,
              imageUrl: null,
              imageAlt: null,
            },
          ],
        },
      ],
    });
    setSelectedStageId(tempId);
  }

  function removeStage(stageId: string) {
    if (!data || locked) return;
    const ok = window.confirm("Удалить этот этап и все его фрагменты?");
    if (!ok) return;
    const nextStages = data.stages
      .filter((s) => s.id !== stageId)
      .map((s, i) => ({ ...s, order: i + 1 }));
    setData({ ...data, stages: nextStages });
    setSelectedStageId(nextStages[0]?.id ?? null);
  }

  function addTextBlock(stageId: string) {
    if (!data || locked) return;
    setData({
      ...data,
      stages: data.stages.map((s) => {
        if (s.id !== stageId) return s;
        const nextOrder =
          s.blocks.length === 0
            ? 0
            : Math.max(...s.blocks.map((b) => b.order)) + 1;
        return {
          ...s,
          blocks: [
            ...s.blocks,
            {
              id: `temp-b-${crypto.randomUUID()}`,
              caseStageId: stageId,
              order: nextOrder,
              blockType: "PLAIN",
              rawText: "",
              formattedContent: null,
              imageUrl: null,
              imageAlt: null,
            },
          ],
        };
      }),
    });
  }

  function addImageBlock(stageId: string) {
    if (!data || locked) return;
    setData({
      ...data,
      stages: data.stages.map((s) => {
        if (s.id !== stageId) return s;
        const nextOrder =
          s.blocks.length === 0
            ? 0
            : Math.max(...s.blocks.map((b) => b.order)) + 1;
        return {
          ...s,
          blocks: [
            ...s.blocks,
            {
              id: `temp-b-${crypto.randomUUID()}`,
              caseStageId: stageId,
              order: nextOrder,
              blockType: "IMAGE_URL",
              rawText: null,
              formattedContent: null,
              imageUrl: "",
              imageAlt: null,
            },
          ],
        };
      }),
    });
  }

  function removeBlock(stageId: string, blockId: string) {
    if (!data || locked) return;
    setData({
      ...data,
      stages: data.stages.map((s) =>
        s.id !== stageId
          ? s
          : { ...s, blocks: s.blocks.filter((b) => b.id !== blockId) },
      ),
    });
  }

  function setDepartmentId(nextId: string) {
    if (!data || locked) return;
    const dept = reference.departments.find((d) => d.id === nextId);
    if (!dept) return;
    setData({ ...data, departmentId: nextId, department: dept });
  }

  function toggleFaculty(facultyId: string) {
    if (!data || locked) return;
    const has = data.caseFaculties.some((x) => x.facultyId === facultyId);
    if (has && data.caseFaculties.length <= 1) return;
    if (has) {
      setData({
        ...data,
        caseFaculties: data.caseFaculties.filter((x) => x.facultyId !== facultyId),
      });
      return;
    }
    const faculty = reference.faculties.find((f) => f.id === facultyId);
    if (!faculty) return;
    setData({
      ...data,
      caseFaculties: [
        ...data.caseFaculties,
        { caseId: data.id, facultyId, faculty },
      ],
    });
  }

  function toggleCourseLevel(courseLevelId: string) {
    if (!data || locked) return;
    const has = data.caseCourseLevels.some(
      (x) => x.courseLevelId === courseLevelId,
    );
    if (has && data.caseCourseLevels.length <= 1) return;
    if (has) {
      setData({
        ...data,
        caseCourseLevels: data.caseCourseLevels.filter(
          (x) => x.courseLevelId !== courseLevelId,
        ),
      });
      return;
    }
    const courseLevel = reference.courseLevels.find((c) => c.id === courseLevelId);
    if (!courseLevel) return;
    setData({
      ...data,
      caseCourseLevels: [
        ...data.caseCourseLevels,
        { caseId: data.id, courseLevelId, courseLevel },
      ],
    });
  }

  const activeStage =
    stages.find((s) => s.id === selectedStageId) ?? stages[0] ?? null;
  const activeStageIndex = activeStage
    ? stages.findIndex((s) => s.id === activeStage.id)
    : -1;

  if (loading || !data) {
    return <PageLoader />;
  }

  const busyLabel = saving
    ? "Сохраняем кейс…"
    : pptxBusy
      ? "Формируем PPTX…"
      : wipingSessions
        ? "Удаляем занятия…"
        : committingPreview
          ? "Применяем оформление…"
          : formattingBlockId !== null
            ? "ИИ оформляет фрагмент…"
            : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/cases"
          className="text-sm text-brand-800 hover:underline"
        >
          ← К списку
        </Link>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="ui-btn-primary"
        >
          Сохранить
        </button>
        {savedFlash ? (
          <span className="text-sm text-brand-800">Сохранено</span>
        ) : null}
        <button
          type="button"
          onClick={() => void exportPptx()}
          disabled={pptxBusy}
          title="Экспорт текущего сохранённого в базе кейса в слайды PowerPoint"
          className="ui-btn-secondary"
        >
          Скачать PPTX
        </button>
      </div>
      {locked && (
        <div className="ui-alert-warning space-y-2">
          <p>
            По этому кейсу уже есть занятия: структуру этапов менять нельзя,
            текст в существующих полях — можно.
          </p>
          <p>
            <Link
              to={`/sessions?caseId=${caseId}`}
              className="font-medium underline hover:no-underline"
            >
              Открыть занятия этого кейса
            </Link>
            — ведущий, этапы и гипотезы на стороне занятия.
          </p>
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-warning-border)] pt-3">
            <button
              type="button"
              disabled={wipingSessions}
              onClick={() => void deleteAllSessionsForCase()}
              className="ui-btn-danger"
            >
              Закрыть и удалить все занятия этого кейса
            </button>
            <span className="text-xs">
              После удаления снова можно менять этапы; данные занятий не
              восстановить.
            </span>
          </div>
        </div>
      )}
      {error && <p className="ui-alert-danger">{error}</p>}

      <section className="ui-card space-y-3 p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Название кейса
          <input
            className="ui-input font-normal"
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Краткое описание
          <textarea
            className="ui-input min-h-[72px] font-normal leading-relaxed"
            placeholder="Для себя и коллег — о чём кейс"
            value={data.description ?? ""}
            onChange={(e) =>
              setData({ ...data, description: e.target.value || null })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Эталон для разбора
          <textarea
            className="ui-input min-h-[88px] font-normal leading-relaxed"
            placeholder="Что группа должна увидеть — для ИИ после занятия"
            value={data.teacherKey ?? ""}
            onChange={(e) =>
              setData({ ...data, teacherKey: e.target.value || null })
            }
          />
          <span className="font-normal text-xs text-muted">
            Скрыто от группы во время занятия. Нужно, чтобы ИИ сравнивал ход
            разбора с вашим эталоном.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={data.published}
            onChange={(e) =>
              setData({ ...data, published: e.target.checked })
            }
          />
          Опубликовать в каталоге кейсов
        </label>
        <div className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Кафедра
            </p>
            {fixedDepartmentId ? (
              <p className="mt-1 text-sm font-medium text-ink">
                {data.department.name}
              </p>
            ) : (
              <select
                className="ui-input mt-1 max-w-md"
                disabled={locked}
                value={data.departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                {reference.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <fieldset className="space-y-2" disabled={locked}>
            <legend className="text-xs font-medium uppercase tracking-wide text-muted">
              Факультеты (несколько)
            </legend>
            <div className="flex flex-col gap-2">
              {reference.faculties.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={data.caseFaculties.some((x) => x.facultyId === f.id)}
                    onChange={() => toggleFaculty(f.id)}
                  />
                  {f.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2" disabled={locked}>
            <legend className="text-xs font-medium uppercase tracking-wide text-muted">
              Курсы (несколько)
            </legend>
            <div className="flex flex-col gap-2">
              {reference.courseLevels.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={data.caseCourseLevels.some(
                      (x) => x.courseLevelId === c.id,
                    )}
                    onChange={() => toggleCourseLevel(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted">
            Группа подходит для занятия, если её факультет и курс входят в
            отмеченные списки. При наличии занятий эти поля не меняются.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Этапы
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {stages.map((stage, stageIndex) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStageId(stage.id)}
                className={[
                  "min-h-11 shrink-0 rounded-[10px] px-3 py-2 text-left text-sm font-medium transition lg:w-full",
                  activeStage?.id === stage.id
                    ? "bg-brand-50 text-brand-800"
                    : "bg-elevated text-ink-soft ring-1 ring-line hover:text-ink",
                ].join(" ")}
              >
                {stageIndex + 1}. {stage.title || "Без названия"}
              </button>
            ))}
          </div>
          {!locked ? (
            <button
              type="button"
              onClick={addStage}
              className="w-full rounded-[var(--radius-md)] border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft hover:bg-surface"
            >
              + Добавить этап
            </button>
          ) : null}
        </aside>

        <div className="min-w-0">
          {stages.length === 0 ? (
            <p className="ui-empty">
              Пока нет этапов. Добавьте первый — затем заполните описание и при
              необходимости оформите текст через ИИ.
            </p>
          ) : activeStage ? (
            <div className="ui-card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-faint">
                  Этап {activeStageIndex + 1}
                </p>
                {!locked ? (
                  <button
                    type="button"
                    className="text-xs text-[var(--color-danger)] hover:underline"
                    onClick={() => removeStage(activeStage.id)}
                  >
                    Удалить этап
                  </button>
                ) : null}
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Заголовок этапа
                <input
                  className="ui-input font-normal"
                  value={activeStage.title}
                  onChange={(e) =>
                    updateStage(activeStage.id, { title: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Цели этапа
                <textarea
                  className="ui-input min-h-[72px] font-normal leading-relaxed"
                  placeholder="Что группа должна понять на этом шаге"
                  value={activeStage.learningGoals ?? ""}
                  onChange={(e) =>
                    updateStage(activeStage.id, {
                      learningGoals: e.target.value || null,
                    })
                  }
                />
              </label>

              <div className="space-y-5">
                {sortedBlocks(activeStage.blocks).map((block, blockIndex) => {
                  const isImage = block.blockType === "IMAGE_URL";
                  return (
                    <div
                      key={block.id}
                      className="rounded-[var(--radius-md)] border border-line bg-surface p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted">
                          {isImage
                            ? `Фрагмент ${blockIndex + 1}: иллюстрация`
                            : `Фрагмент ${blockIndex + 1}: текст`}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {!isImage ? (
                            <button
                              type="button"
                              disabled={formattingBlockId !== null || saving}
                              className="ui-btn-primary px-3 py-1.5 text-xs"
                              onClick={() =>
                                void requestAiPreview(activeStage.id, block.id)
                              }
                            >
                              ИИ: как будет выглядеть
                            </button>
                          ) : null}
                          {!locked && (
                            <button
                              type="button"
                              className="text-xs text-[var(--color-danger)] hover:underline"
                              onClick={() =>
                                removeBlock(activeStage.id, block.id)
                              }
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </div>

                      {isImage ? (
                        <div className="space-y-2">
                          <label className="flex flex-col gap-1 text-sm text-ink-soft">
                            Ссылка на изображение
                            <input
                              className="ui-input"
                              placeholder="https://…"
                              value={block.imageUrl ?? ""}
                              onChange={(e) =>
                                updateBlock(activeStage.id, block.id, {
                                  imageUrl: e.target.value || null,
                                })
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm text-ink-soft">
                            Подпись (по желанию)
                            <input
                              className="ui-input"
                              value={block.imageAlt ?? ""}
                              onChange={(e) =>
                                updateBlock(activeStage.id, block.id, {
                                  imageAlt: e.target.value || null,
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                          Описание
                          <textarea
                            className="ui-input min-h-[120px] font-normal leading-relaxed"
                            placeholder="Жалобы, речь пациента, наблюдения врача…"
                            value={block.rawText ?? ""}
                            onChange={(e) =>
                              updateBlock(activeStage.id, block.id, {
                                rawText: e.target.value || null,
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              {!locked && (
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => addTextBlock(activeStage.id)}
                    className="text-sm text-brand-800 hover:underline"
                  >
                    + Текстовый фрагмент
                  </button>
                  <button
                    type="button"
                    onClick={() => addImageBlock(activeStage.id)}
                    className="text-sm text-brand-800 hover:underline"
                  >
                    + Картинка по ссылке
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {aiPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-preview-title"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget &&
              !committingPreview
            ) {
              setAiPreview(null);
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-lg)] border border-line bg-elevated p-5 shadow-xl">
            <h2
              id="ai-preview-title"
              className="text-lg font-semibold text-ink"
            >
              Предпросмотр оформления
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Так фрагмент будет показан при прохождении после применения. Исходный
              текст в поле «Описание» не меняется.
            </p>
            {aiPreview.hint ? (
              <p className="ui-alert-warning mt-2">
                {aiPreview.hint}
              </p>
            ) : null}
            <div className="mt-4">
              <BlockView
                blockType={aiPreview.blockType}
                rawText={aiPreview.rawText}
                formattedContent={aiPreview.formattedContent}
                imageUrl={null}
                imageAlt={null}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="ui-btn-primary"
                disabled={committingPreview}
                onClick={() => void applyAiPreview()}
              >
                Применить к фрагменту
              </button>
              <button
                type="button"
                className="ui-btn-secondary"
                disabled={committingPreview}
                onClick={() => setAiPreview(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {busyLabel && <LoadingOverlay label={busyLabel} />}
    </div>
  );
}
