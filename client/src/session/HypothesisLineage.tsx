import { buildLineageTracks, type LineageTrack } from "~lib/hypothesis-lineage";
import type { TimelineRow } from "./types";

export function HypothesisLineage({
  timeline,
  compact = false,
}: {
  timeline: TimelineRow[];
  compact?: boolean;
}) {
  const tracks = buildLineageTracks(timeline);
  if (tracks.hypotheses.length === 0 && tracks.questions.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {tracks.hypotheses.length > 0 ? (
        <TrackList title="Лента гипотез" tracks={tracks.hypotheses} compact={compact} />
      ) : null}
      {tracks.questions.length > 0 ? (
        <TrackList title="Лента вопросов" tracks={tracks.questions} compact={compact} />
      ) : null}
    </div>
  );
}

function TrackList({
  title,
  tracks,
  compact,
}: {
  title: string;
  tracks: LineageTrack[];
  compact: boolean;
}) {
  return (
    <section>
      <h3
        className={
          compact
            ? "mb-2 text-sm font-semibold text-slate-700"
            : "mb-3 text-base font-semibold tracking-tight text-ink"
        }
      >
        {title}
      </h3>
      <ul className="space-y-3">
        {tracks.map((track) => (
          <li key={track.lineageId} className="min-w-0">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              {statusLabel(track.status)}
            </p>
            <ol className="flex flex-wrap items-center gap-1.5">
              {track.steps.map((step, i) => {
                const prev = track.steps[i - 1];
                const changed = Boolean(prev && prev.text.trim() !== step.text.trim());
                return (
                  <li key={`${track.lineageId}-${step.stageOrder}`} className="flex items-center gap-1.5">
                    {i > 0 ? (
                      <span className="text-faint" aria-hidden>
                        →
                      </span>
                    ) : null}
                    <span
                      className={[
                        "inline-flex max-w-full items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-[13px] leading-snug",
                        changed
                          ? "border-amber-300 bg-amber-50 text-amber-950"
                          : "border-line bg-surface text-ink",
                      ].join(" ")}
                    >
                      <span className="shrink-0 text-[11px] text-muted">
                        {step.stageOrder}
                      </span>
                      <span className="min-w-0 truncate">{step.text}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}

function statusLabel(status: LineageTrack["status"]): string {
  if (status === "evolved") return "Изменилась";
  if (status === "dropped") return "Снята на следующем этапе";
  return "Держится";
}
