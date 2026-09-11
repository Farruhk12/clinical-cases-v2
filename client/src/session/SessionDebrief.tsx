import { AiPreliminaryScoresPanel } from "@/components/ai-preliminary-scores-panel";
import { SessionAnalysisView } from "@/components/session-analysis-view";
import { preliminaryScoresFromOutcome } from "~lib/session-ai-scores";
import { parseScore100 } from "@/lib/score-100";
import type { RefObject } from "react";
import type { SessionRunnerState } from "./useSessionRunner";
import type { SessionPayload } from "./types";
import { SessionProgressTable } from "./SessionProgressTable";
import { HypothesisLineage } from "./HypothesisLineage";
import { GuestStudentsPanel } from "./GuestStudentsPanel";

/** Фаза после завершения занятия: сетка хода, эталон, оценка справа. */
export function SessionDebrief({
  data,
  state,
  staff,
  analysisResultsRef,
}: {
  data: SessionPayload;
  state: SessionRunnerState;
  staff: boolean;
  analysisResultsRef: RefObject<HTMLDivElement | null>;
}) {
  const { busy, grade, setGrade, comment, setComment, runAnalysis, saveOutcome } = state;

  const preliminaryScores = preliminaryScoresFromOutcome(data.session.outcome ?? null);
  const hasAi = Boolean(data.session.outcome?.aiAnalysis?.trim());
  const savedGrade = data.session.outcome?.teacherGrade?.trim() || null;

  async function handleRunAnalysis() {
    const ok = await runAnalysis();
    if (ok) {
      requestAnimationFrame(() => {
        analysisResultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  return (
    <div className="mt-2 space-y-8">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="ui-card overflow-hidden">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold tracking-tight text-ink">Ход группы</h2>
          </div>
          <div className="px-1 py-1 sm:px-2">
            <SessionProgressTable data={data} />
          </div>
        </section>

        <aside className="ui-card space-y-4 p-4 xl:sticky xl:top-20">
          <h2 className="text-base font-semibold tracking-tight text-ink">Оценка</h2>
          {savedGrade ? (
            <p className="font-display text-4xl font-medium tabular-nums text-ink">{savedGrade}</p>
          ) : (
            <p className="text-sm text-ink-soft">Ещё нет балла</p>
          )}
          {preliminaryScores ? (
            <p className="text-sm text-slate-500">
              ИИ:{" "}
              <span className="font-semibold tabular-nums text-slate-700">
                {preliminaryScores.averageScore}/100
              </span>
            </p>
          ) : null}
          {staff ? (
            <div className="space-y-3 border-t border-line pt-3">
              {grade.trim() !== "" && parseScore100(grade) === null ? (
                <>
                  <p className="text-xs text-amber-800">
                    Сохранена нечисловая оценка. Укажите число от 0 до 100.
                  </p>
                  <input
                    className="min-h-11 w-full rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-base sm:min-h-0 sm:text-sm"
                    placeholder="Например: 75"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  />
                </>
              ) : (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600">Балл (0–100)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-base tabular-nums sm:min-h-0 sm:text-sm"
                    placeholder="75"
                    value={grade === "" ? "" : parseScore100(grade) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setGrade("");
                        return;
                      }
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      setGrade(String(Math.round(Math.min(100, Math.max(0, n)))));
                    }}
                  />
                </label>
              )}
              <textarea
                className="min-h-[88px] w-full rounded-lg border border-slate-200 px-3 py-2 text-base sm:text-sm"
                placeholder="Комментарий"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveOutcome()}
                className="ui-btn-primary w-full"
              >
                Сохранить оценку
              </button>
            </div>
          ) : data.session.outcome?.teacherComment?.trim() ? (
            <p className="text-sm leading-relaxed text-ink-soft">
              {data.session.outcome.teacherComment}
            </p>
          ) : null}
        </aside>
      </div>

      <GuestStudentsPanel
        ideas={data.guestIdeas ?? []}
        sessionId={data.session.id}
      />

      {data.timeline.some((row) => row.hypotheses.length + row.questions.length > 0) ? (
        <section className="ui-card space-y-4 p-4 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Как менялась мысль
          </h2>
          <p className="text-sm text-ink-soft">
            Одна линия — одна гипотеза или вопрос. Стрелка — переход этапа.
          </p>
          <HypothesisLineage timeline={data.timeline} />
        </section>
      ) : null}

      <section className="ui-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">ИИ-анализ</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Для себя, не на проектор. Итог выставляете вы.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRunAnalysis()}
            className="ui-btn-primary w-full sm:w-auto"
          >
            {hasAi ? "Обновить ИИ-анализ" : "Сгенерировать ИИ-анализ"}
          </button>
        </div>
        {(preliminaryScores || data.session.outcome?.aiAnalysis) && (
          <div ref={analysisResultsRef} className="scroll-mt-6 space-y-4">
            {preliminaryScores ? <AiPreliminaryScoresPanel scores={preliminaryScores} /> : null}
            {data.session.outcome?.aiAnalysis ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <SessionAnalysisView
                  content={data.session.outcome.aiAnalysis}
                  stageScores={preliminaryScores?.stageScores}
                  averageScore={preliminaryScores?.averageScore}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
