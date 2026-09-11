export type LineageItem = {
  id: string;
  text: string;
  lineageId: string;
};

export type LineageStageRow = {
  stageOrder: number;
  stageTitle: string;
  hypotheses: LineageItem[];
  questions: LineageItem[];
};

export type LineageStep = {
  stageOrder: number;
  stageTitle: string;
  text: string;
};

export type LineageTrack = {
  lineageId: string;
  kind: "hypothesis" | "question";
  steps: LineageStep[];
  status: "stable" | "evolved" | "dropped";
};

function tracksForKind(
  rows: LineageStageRow[],
  kind: "hypothesis" | "question",
): LineageTrack[] {
  const key = kind === "hypothesis" ? "hypotheses" : "questions";
  const firstSeen: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const item of row[key]) {
      if (!item.lineageId || seen.has(item.lineageId)) continue;
      seen.add(item.lineageId);
      firstSeen.push(item.lineageId);
    }
  }

  const lastOrder = rows[rows.length - 1]?.stageOrder;
  const tracks: LineageTrack[] = [];
  for (const lineageId of firstSeen) {
    const steps: LineageStep[] = [];
    for (const row of rows) {
      const hit = row[key].find((item) => item.lineageId === lineageId);
      if (hit) {
        steps.push({
          stageOrder: row.stageOrder,
          stageTitle: row.stageTitle,
          text: hit.text,
        });
      }
    }
    if (steps.length === 0) continue;
    const texts = steps.map((s) => s.text.trim());
    const unique = new Set(texts);
    const presentOnLast = steps.some((s) => s.stageOrder === lastOrder);
    let status: LineageTrack["status"] = "stable";
    if (!presentOnLast && rows.length > 1) status = "dropped";
    else if (unique.size > 1) status = "evolved";
    tracks.push({ lineageId, kind, steps, status });
  }
  return tracks;
}

/** Склеивает гипотезы/вопросы по lineageId — как мысль жила от этапа к этапу. */
export function buildLineageTracks(rows: LineageStageRow[]): {
  hypotheses: LineageTrack[];
  questions: LineageTrack[];
} {
  const ordered = [...rows].sort((a, b) => a.stageOrder - b.stageOrder);
  return {
    hypotheses: tracksForKind(ordered, "hypothesis"),
    questions: tracksForKind(ordered, "question"),
  };
}
