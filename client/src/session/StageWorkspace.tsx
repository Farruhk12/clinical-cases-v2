import { BlockView } from "@/components/block-view";
import { Collapsible } from "./Collapsible";
import { GuestIdeasInbox } from "./GuestIdeasInbox";
import { HypothesisLineage } from "./HypothesisLineage";
import type { SessionRunnerState } from "./useSessionRunner";
import type { SessionPayload } from "./types";

/** Экран у доски: крупный этап, чипы гипотез, «Далее» всегда внизу. */
export function StageWorkspace({
  data,
  state,
  userId,
}: {
  data: SessionPayload;
  state: SessionRunnerState;
  userId: string;
}) {
  const {
    busy,
    hypos,
    setHypos,
    newHypoInput,
    setNewHypoInput,
    editingHypoIdx,
    setEditingHypoIdx,
    questions,
    setQuestions,
    leaderChoice,
    setLeaderChoice,
    addHypoFromInput,
    saveDraft,
    advance,
    saveLeader,
    forceComplete,
    adoptGuestIdea,
  } = state;

  const stage =
    data.currentStage ??
    data.visibleStages.find((s) => s.order === data.session.currentStageOrder) ??
    data.visibleStages[data.visibleStages.length - 1] ??
    null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-8 pb-28">
        {stage ? (
          <article>
            <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl md:text-5xl">
              <span className="mr-3 text-brand-700">{stage.order}.</span>
              {stage.title}
            </h2>
            <div className="presentation-blocks mt-6 space-y-5">
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
          <h3 className="mb-4 text-lg font-semibold text-ink">Гипотезы</h3>
          {hypos.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2.5">
              {hypos.map((h, i) => (
                <span
                  key={h.lineageId ?? `hypo-${i}`}
                  className="group inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-4 py-2.5 text-lg leading-snug text-amber-950 sm:text-xl"
                >
                  {data.canEdit && editingHypoIdx === i ? (
                    <input
                      autoFocus
                      type="text"
                      data-role="hypo-edit"
                      className="min-w-0 flex-1 border-none bg-transparent p-0 text-lg text-amber-950 outline-none sm:text-xl"
                      value={h.text}
                      onChange={(e) => {
                        const next = [...hypos];
                        next[i] = { ...next[i], text: e.target.value };
                        setHypos(next);
                      }}
                      onBlur={() => setEditingHypoIdx(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingHypoIdx(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="max-w-full text-left"
                      onClick={() => data.canEdit && setEditingHypoIdx(i)}
                      title={h.text}
                    >
                      {h.text || "..."}
                    </button>
                  )}
                  {data.canEdit ? (
                    <button
                      type="button"
                      className="text-amber-700/50 transition hover:text-amber-950"
                      aria-label="Удалить"
                      onClick={() => {
                        setHypos(hypos.filter((_, j) => j !== i));
                        if (editingHypoIdx === i) setEditingHypoIdx(null);
                        else if (editingHypoIdx !== null && editingHypoIdx > i) {
                          setEditingHypoIdx(editingHypoIdx - 1);
                        }
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          )}
          {data.canEdit ? (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="session-hypo-input"
                type="text"
                data-role="hypothesis"
                className="h-14 min-h-14 w-full flex-1 rounded-[var(--radius-md)] border border-line bg-elevated px-4 text-xl placeholder:text-faint focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                placeholder="Гипотеза… Enter"
                value={newHypoInput}
                onChange={(e) => setNewHypoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    addHypoFromInput();
                  }
                }}
              />
              <button
                type="button"
                className="h-14 shrink-0 rounded-full bg-amber-100 px-5 text-base font-semibold text-amber-950 transition hover:bg-amber-200"
                onClick={() => addHypoFromInput()}
              >
                +
              </button>
            </div>
          ) : hypos.length === 0 ? (
            <p className="text-lg text-muted">Пока нет</p>
          ) : null}
        </section>

        {data.canEdit ? (
          <section className="border-t border-line/70 pt-5">
            <h3 className="mb-2 text-sm font-semibold text-ink-soft">Вопросы</h3>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="flex min-w-0 items-center gap-2">
                  <input
                    type="text"
                    data-role="question"
                    className="h-10 min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-line bg-surface px-3 text-base placeholder:text-faint focus:border-brand-600 focus:bg-elevated focus:outline-none focus:ring-1 focus:ring-brand-600"
                    placeholder="Вопрос…"
                    value={q.text}
                    onChange={(e) => {
                      const next = [...questions];
                      next[i] = { ...next[i], text: e.target.value };
                      setQuestions(next);
                    }}
                  />
                  {questions.length > 1 && (
                    <button
                      type="button"
                      className="text-sm text-slate-400 transition hover:text-red-500"
                      onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-brand-700 transition hover:text-brand-800"
              onClick={() => setQuestions([...questions, { text: "" }])}
            >
              + ещё вопрос
            </button>
          </section>
        ) : questions.some((q) => q.text.trim()) ? (
          <section className="border-t border-line/70 pt-5">
            <h3 className="mb-2 text-sm font-semibold text-ink-soft">Вопросы</h3>
            <ul className="space-y-1 text-base text-ink-soft">
              {questions
                .filter((q) => q.text.trim())
                .map((q, i) => (
                  <li key={q.lineageId ?? i}>{q.text}</li>
                ))}
            </ul>
          </section>
        ) : null}

        <GuestIdeasInbox
          ideas={data.guestIdeas ?? []}
          currentStageId={stage?.id ?? null}
          canEdit={data.canEdit}
          busy={busy}
          onTake={(idea) => void adoptGuestIdea(idea)}
        />

        {data.timeline.length > 1 ? (
          <Collapsible title="Лента гипотез">
            <HypothesisLineage timeline={data.timeline} compact />
          </Collapsible>
        ) : null}

        <div className="space-y-3 pt-4">
          {(data.canEditSessionSettings ?? false) && (
            <Collapsible title="Параметры">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:min-w-[220px] sm:flex-none">
                  <span className="text-slate-600">Ведущий</span>
                  <select
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-base sm:min-h-0 sm:min-w-[220px] sm:text-sm"
                    value={leaderChoice}
                    onChange={(e) => setLeaderChoice(e.target.value)}
                  >
                    {(data.leaderCandidates ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? m.login ?? m.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || leaderChoice === data.session.leader.id || !leaderChoice}
                  onClick={() => void saveLeader()}
                  className="ui-btn-primary w-full sm:w-auto"
                >
                  Сохранить
                </button>
              </div>
            </Collapsible>
          )}

          <Collapsible title="Об занятии">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <dt className="text-slate-500">Ведущий</dt>
              <dd className="font-medium text-slate-800">
                {data.session.leader.name ?? data.session.leader.login}
                {data.session.leader.id === userId && (
                  <span className="ml-2 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                    вы
                  </span>
                )}
              </dd>
              <dt className="text-slate-500">Группа</dt>
              <dd className="text-slate-800">{data.session.studyGroup.name}</dd>
              <dt className="text-slate-500">Факультет</dt>
              <dd className="text-slate-800">{data.session.studyGroup.faculty.name}</dd>
              <dt className="text-slate-500">Курс</dt>
              <dd className="text-slate-800">{data.session.studyGroup.courseLevel.name}</dd>
              <dt className="text-slate-500">Начата</dt>
              <dd className="text-slate-800">
                {new Date(data.session.startedAt).toLocaleString("ru-RU")}
              </dd>
              <dt className="text-slate-500">Версия кейса</dt>
              <dd className="text-slate-800">{data.session.caseVersionSnapshot}</dd>
            </dl>
          </Collapsible>
        </div>
      </div>

      {data.canEdit ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <div className="border-t border-line bg-elevated/95 shadow-[0_-8px_24px_-16px_rgb(24_27_33/0.28)] backdrop-blur-sm">
            <div className="pointer-events-auto safe-area-x mx-auto flex max-w-6xl flex-col gap-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void advance()}
                className="ui-btn-primary h-12 min-h-12 w-full px-8 text-base sm:w-auto sm:min-w-[10rem]"
              >
                Далее
              </button>
              <p className="order-last text-center text-xs text-faint sm:order-none sm:mr-auto sm:text-left">
                Enter — гипотеза · → — этап
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDraft()}
                className="ui-btn-secondary w-full sm:w-auto"
              >
                Сохранить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceComplete()}
                className="ui-btn-danger w-full sm:w-auto"
              >
                Завершить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
