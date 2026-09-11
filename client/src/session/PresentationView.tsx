import { BlockView } from "@/components/block-view";
import type { SessionPayload } from "./types";

/** Крупный read-only вид текущего этапа — окно на проекторе, без управления. */
export function PresentationView({ data }: { data: SessionPayload }) {
  const hypotheses = data.draft?.hypotheses ?? [];
  const questions = data.draft?.questions ?? [];
  const stage =
    data.currentStage ??
    data.visibleStages.find((s) => s.order === data.session.currentStageOrder) ??
    data.visibleStages[data.visibleStages.length - 1] ??
    null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-8 py-10 xl:px-16 xl:py-12">
      {stage ? (
        <article className="space-y-6">
          <h2 className="font-display text-4xl font-medium leading-tight tracking-tight text-ink xl:text-5xl">
            <span className="mr-3 text-brand-700">{stage.order}.</span>
            {stage.title}
          </h2>
          <div className="presentation-blocks space-y-6">
            {stage.blocks.map((b) => (
              <BlockView
                key={b.id}
                blockType={b.blockType}
                rawText={b.rawText}
                formattedContent={b.formattedContent}
                imageUrl={b.imageUrl}
                imageAlt={b.imageAlt}
              />
            ))}
          </div>
        </article>
      ) : null}

      <section>
        <h3 className="mb-4 text-xl font-semibold text-ink">Гипотезы</h3>
        {hypotheses.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {hypotheses.map((h) => (
              <li
                key={h.id}
                className="rounded-full border border-amber-200/80 bg-amber-50 px-6 py-3 text-2xl leading-snug text-amber-950"
              >
                {h.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xl text-muted">Пока нет</p>
        )}
      </section>

      {questions.some((q) => q.text.trim()) ? (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-ink-soft">Вопросы</h3>
          <ul className="space-y-2">
            {questions
              .filter((q) => q.text.trim())
              .map((q) => (
                <li key={q.id} className="text-xl leading-snug text-ink-soft">
                  {q.text}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
