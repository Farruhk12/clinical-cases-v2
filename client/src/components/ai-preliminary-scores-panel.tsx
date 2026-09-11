import type { AiPreliminaryScoresPayload } from "~lib/session-ai-scores";

export function AiPreliminaryScoresPanel({
  scores,
}: {
  scores: AiPreliminaryScoresPayload;
}) {
  return (
    <div className="ui-card p-4">
      <h3 className="text-sm font-semibold text-ink">
        Предварительная оценка (ИИ, 100-балльная шкала)
      </h3>
      <p className="mt-1 text-xs leading-snug text-ink-soft">
        Ориентир для преподавателя. Итоговую оценку и комментарий вы фиксируете
        ниже сами.
      </p>
      {scores.stageScores.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {scores.stageScores.map((s) => (
            <li
              key={s.stageOrder}
              className="max-w-full rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm"
            >
              <span className="text-ink-soft">Этап {s.stageOrder}</span>
              {s.stageTitle ? (
                <span
                  className="ml-1 max-w-[10rem] truncate align-bottom text-xs text-faint"
                  title={s.stageTitle}
                >
                  · {s.stageTitle}
                </span>
              ) : null}
              <span className="ml-2 font-semibold tabular-nums text-ink">
                {s.score}/100
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line pt-3">
        <span className="text-sm font-medium text-ink-soft">
          Среднее по этапам:
        </span>
        <span className="font-display text-2xl font-medium tabular-nums text-ink">
          {scores.averageScore}
        </span>
        <span className="text-sm text-muted">/ 100</span>
      </div>
    </div>
  );
}
