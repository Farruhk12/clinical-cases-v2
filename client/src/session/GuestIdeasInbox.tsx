import type { GuestIdeaJson } from "./types";

export function TakenCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className ?? "h-4 w-4"}
    >
      <circle cx="10" cy="10" r="9" className="fill-emerald-50 stroke-emerald-500" strokeWidth="1.4" />
      <path
        d="M6 10.2 8.6 12.8 14 7.4"
        className="stroke-emerald-700"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GuestIdeasInbox({
  ideas,
  currentStageId,
  canEdit,
  busy,
  onTake,
}: {
  ideas: GuestIdeaJson[];
  currentStageId: string | null;
  canEdit: boolean;
  busy: boolean;
  onTake: (idea: GuestIdeaJson) => void;
}) {
  const stageIdeas = currentStageId
    ? ideas.filter((i) => i.caseStageId === currentStageId)
    : ideas;
  const open = stageIdeas.filter((i) => !i.takenAt);
  const taken = stageIdeas.filter((i) => i.takenAt);
  const hypos = stageIdeas.filter((i) => i.kind === "HYPOTHESIS");
  const questions = stageIdeas.filter((i) => i.kind === "QUESTION");

  if (stageIdeas.length === 0) {
    return (
      <section className="ui-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-700">Ответы с телефонов</h3>
        <p className="mt-1.5 text-sm text-ink-soft">
          Пока никто не прислал. Покажите группе QR.
        </p>
      </section>
    );
  }

  return (
    <section className="ui-card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Ответы с телефонов</h3>
        <span className="text-xs text-muted">
          {open.length} новых
          {taken.length ? ` · ${taken.length} в списке` : ""}
        </span>
      </div>
      {hypos.length > 0 ? (
        <IdeaGroup
          title="Гипотезы"
          ideas={hypos}
          canEdit={canEdit}
          busy={busy}
          onTake={onTake}
        />
      ) : null}
      {questions.length > 0 ? (
        <IdeaGroup
          title="Вопросы"
          ideas={questions}
          canEdit={canEdit}
          busy={busy}
          onTake={onTake}
        />
      ) : null}
    </section>
  );
}

function IdeaGroup({
  title,
  ideas,
  canEdit,
  busy,
  onTake,
}: {
  title: string;
  ideas: GuestIdeaJson[];
  canEdit: boolean;
  busy: boolean;
  onTake: (idea: GuestIdeaJson) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </p>
      <ul className="space-y-1.5">
        {ideas.map((idea) => {
          const inList = Boolean(idea.takenAt);
          return (
            <li
              key={idea.id}
              className={`flex items-start justify-between gap-2 rounded-[10px] border px-3 py-2 ${
                inList
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-line bg-surface"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">{idea.text}</p>
                <p className="mt-0.5 text-xs text-muted">{idea.displayName}</p>
              </div>
              {inList ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-medium text-emerald-800"
                  title="Уже в общем списке"
                >
                  <TakenCheck />
                  <span className="hidden sm:inline">В списке</span>
                </span>
              ) : canEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 text-xs font-medium text-brand-700 hover:text-brand-800"
                  onClick={() => onTake(idea)}
                >
                  В список
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
