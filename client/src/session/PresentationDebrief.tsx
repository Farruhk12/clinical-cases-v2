import type { SessionPayload } from "./types";
import { SessionProgressTable } from "./SessionProgressTable";
import { HypothesisLineage } from "./HypothesisLineage";
import { GuestStudentsPanel } from "./GuestStudentsPanel";

/** Разбор на проекторе: сетка хода и оценка, без markdown-простыни. */
export function PresentationDebrief({ data }: { data: SessionPayload }) {
  const outcome = data.session.outcome;
  const finalGrade = outcome?.teacherGrade?.trim() || null;

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-8 px-6 py-8 xl:px-12 xl:py-10">
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <section className="ui-card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-3xl font-medium tracking-tight text-ink">
              Ход группы
            </h2>
          </div>
          <div className="p-2 sm:p-3">
            <SessionProgressTable data={data} large />
          </div>
        </section>

        <aside className="ui-card space-y-3 p-6 text-center xl:sticky xl:top-8">
          <p className="text-lg text-ink-soft">Оценка</p>
          {finalGrade ? (
            <p className="font-display text-6xl font-medium tabular-nums leading-none text-ink">
              {finalGrade}
            </p>
          ) : (
            <p className="text-2xl text-faint">—</p>
          )}
          {outcome?.teacherComment?.trim() ? (
            <p className="mt-4 text-left text-lg leading-relaxed text-ink-soft">
              {outcome.teacherComment}
            </p>
          ) : null}
        </aside>
      </div>

      <GuestStudentsPanel ideas={data.guestIdeas ?? []} large />

      {data.timeline.some((row) => row.hypotheses.length + row.questions.length > 0) ? (
        <section className="ui-card p-6 xl:p-8">
          <h2 className="mb-5 font-display text-3xl font-medium tracking-tight text-ink">
            Как менялась мысль
          </h2>
          <HypothesisLineage timeline={data.timeline} />
        </section>
      ) : null}
    </div>
  );
}
