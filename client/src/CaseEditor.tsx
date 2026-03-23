import type { CaseDetail } from "~types/case-detail";
import type { BlockType } from "~types/db";

type Department = { id: string; name: string };
type Faculty = { id: string; name: string };
type CourseLevel = { id: string; name: string; sort: number };
type Case = CaseDetail;
type CaseStage = CaseDetail["stages"][number];
type StageBlock = CaseStage["blocks"][number];
import { BlockView } from "@/components/block-view";
import { apiFetch } from "@/lib/api-fetch";
import { downloadCasePptx } from "@/lib/downloadCasePptx";
import { Link, useNavigate } from "react-router-dom";
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

type CasePayload = Case & {
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
}: {
  caseId: string;
  sessionCount: number;
  reference: CaseEditorReference;
  fixedDepartmentId?: string | null;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<CasePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formattingBlockId, setFormattingBlockId] = useState<string | null>(
    null,
  );
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [committingPreview, setCommittingPreview] = useState(false);
  const [loading, setLoading] = useState(true);
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
    const j = (await res.json()) as { case: CasePayload };
    setData(j.case);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      `Удалить все сессии этого кейса (${liveSessionCount} шт.)?\n\n` +
        "Безвозвратно удалятся прохождения: гипотезы, вопросы, аналитика этапов и результаты ИИ. После этого снова можно будет добавлять и удалять этапы и блоки в редакторе.",
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
          learningGoals: null as string | null,
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

  async function save() {
    if (!data) return;
    if (data.caseFaculties.length === 0 || data.caseCourseLevels.length === 0) {
      setError("Нужен хотя бы один факультет и один курс");
      return;
    }
    const body = buildPatchBody();
    if (!body) return;
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
          typeof j.error === "string"
            ? j.error
            : "Ошибка сохранения",
        );
        return;
      }
      navigate("/cases");
    } catch {
      setError("Сеть недоступна или запрос прерван. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  function findBlock(stageId: string, blockId: string) {
    if (!data) return null;
    const stage = data.stages.find((s) => s.id === stageId);
    return stage?.blocks.find((b) => b.id === blockId) ?? null;
  }

  async function requestAiPreview(stageId: string, blockId: string) {
    const block = findBlock(stageId, blockId);
    if (!block) return;
    setError(null);
    setFormattingBlockId(blockId);
    try {
      const res = await apiFetch("/api/ai/format-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId,
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
        stageId,
        blockId,
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

  if (loading || !data) {
    return <p className="text-slate-600">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/cases"
          className="text-sm text-teal-700 hover:underline"
        >
          ← К списку
        </Link>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => void exportPptx()}
          disabled={pptxBusy}
          title="Экспорт текущего сохранённого в базе кейса в слайды PowerPoint"
          className="rounded-md border-2 border-emerald-700 !bg-emerald-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:!bg-emerald-700 disabled:opacity-60"
        >
          {pptxBusy ? "Формирование…" : "Скачать PPTX"}
        </button>
      </div>
      {locked && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>
            Уже есть сессии по этому кейсу: нельзя добавлять или удалять этапы и
            блоки, можно править только текст в существующих полях.
          </p>
          <p className="mt-2">
            <Link
              to={`/sessions?caseId=${caseId}`}
              className="font-medium text-amber-950 underline hover:no-underline"
            >
              Открыть сессии этого кейса
            </Link>
            — смена ведущего, этапы и гипотезы на стороне занятия.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200/80 pt-3">
            <button
              type="button"
              disabled={wipingSessions}
              onClick={() => void deleteAllSessionsForCase()}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
            >
              {wipingSessions
                ? "Удаление…"
                : "Закрыть и удалить все сессии этого кейса"}
            </button>
            <span className="text-xs text-amber-800/90">
              После удаления можно менять структуру этапов; данные занятий не
              восстановить.
            </span>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
          Название кейса
          <input
            className="rounded-md border border-slate-200 px-3 py-2 font-normal"
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={data.published}
            onChange={(e) =>
              setData({ ...data, published: e.target.checked })
            }
          />
          Опубликовать в каталоге кейсов
        </label>
        <div className="space-y-3 rounded-md border border-slate-100 bg-slate-50/90 px-3 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Кафедра
            </p>
            {fixedDepartmentId ? (
              <p className="mt-1 text-sm font-medium text-slate-800">
                {data.department.name}
              </p>
            ) : (
              <select
                className="mt-1 w-full max-w-md rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
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
            <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Факультеты (несколько)
            </legend>
            <div className="flex flex-col gap-2">
              {reference.faculties.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
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
            <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Курсы (несколько)
            </legend>
            <div className="flex flex-col gap-2">
              {reference.courseLevels.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
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
          <p className="text-xs text-slate-500">
            Группа подходит для сессии, если её факультет и курс входят в отмеченные
            списки. При наличии сессий по кейсу эти поля не меняются.
          </p>
        </div>
      </section>

      {!locked && (
        <button
          type="button"
          onClick={addStage}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          + Добавить этап
        </button>
      )}

      {stages.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          Пока нет этапов. Нажмите «Добавить этап», затем в каждом этапе
          заполните описание и при необходимости нажмите «ИИ: как будет
          выглядеть» (после сохранения фрагмента).
        </p>
      )}

      <div className="space-y-8">
        {stages.map((stage, stageIndex) => (
          <div
            key={stage.id}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Этап {stageIndex + 1}
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
              Заголовок этапа
              <input
                className="rounded-md border border-slate-200 px-3 py-2 font-normal"
                value={stage.title}
                onChange={(e) =>
                  updateStage(stage.id, { title: e.target.value })
                }
              />
            </label>

            <div className="space-y-5">
              {sortedBlocks(stage.blocks).map((block, blockIndex) => {
                const isImage = block.blockType === "IMAGE_URL";
                const canAi = !isImage && !block.id.startsWith("temp-");
                return (
                  <div
                    key={block.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {isImage
                          ? `Фрагмент ${blockIndex + 1}: иллюстрация`
                          : `Фрагмент ${blockIndex + 1}: текст`}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {canAi && (
                          <button
                            type="button"
                            disabled={formattingBlockId !== null}
                            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                            onClick={() =>
                              void requestAiPreview(stage.id, block.id)
                            }
                          >
                            {formattingBlockId === block.id
                              ? "Готовим предпросмотр…"
                              : "ИИ: как будет выглядеть"}
                          </button>
                        )}
                        {!canAi && !isImage && block.id.startsWith("temp-") && (
                          <span className="text-xs text-slate-500">
                            Сохраните кейс — затем можно оформить через ИИ
                          </span>
                        )}
                        {!locked && (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => removeBlock(stage.id, block.id)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>

                    {isImage ? (
                      <div className="space-y-2">
                        <label className="flex flex-col gap-1 text-sm text-slate-700">
                          Ссылка на изображение
                          <input
                            className="rounded-md border border-slate-200 bg-white px-3 py-2"
                            placeholder="https://…"
                            value={block.imageUrl ?? ""}
                            onChange={(e) =>
                              updateBlock(stage.id, block.id, {
                                imageUrl: e.target.value || null,
                              })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm text-slate-700">
                          Подпись (по желанию)
                          <input
                            className="rounded-md border border-slate-200 bg-white px-3 py-2"
                            value={block.imageAlt ?? ""}
                            onChange={(e) =>
                              updateBlock(stage.id, block.id, {
                                imageAlt: e.target.value || null,
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
                        Описание
                        <textarea
                          className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-normal leading-relaxed"
                          placeholder="Жалобы, речь пациента, наблюдения врача…"
                          value={block.rawText ?? ""}
                          onChange={(e) =>
                            updateBlock(stage.id, block.id, {
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
                  onClick={() => addTextBlock(stage.id)}
                  className="text-sm text-teal-700 hover:underline"
                >
                  + Текстовый фрагмент
                </button>
                <button
                  type="button"
                  onClick={() => addImageBlock(stage.id)}
                  className="text-sm text-teal-700 hover:underline"
                >
                  + Картинка по ссылке
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!locked && stages.length > 0 && (
        <button
          type="button"
          onClick={addStage}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          + Добавить этап
        </button>
      )}

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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2
              id="ai-preview-title"
              className="text-lg font-semibold text-slate-900"
            >
              Предпросмотр оформления
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Так фрагмент будет показан при прохождении после применения. Исходный
              текст в поле «Описание» не меняется.
            </p>
            {aiPreview.hint ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
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
                className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                disabled={committingPreview}
                onClick={() => void applyAiPreview()}
              >
                {committingPreview ? "Применение…" : "Применить к фрагменту"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={committingPreview}
                onClick={() => setAiPreview(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
