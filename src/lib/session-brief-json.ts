import type { CaseSessionBrief } from "./session-detail";
import { toJsonIsoUtc } from "./to-json-iso-utc";

/** Готовит краткую карточку сессии для `res.json` с однозначными UTC-метками времени. */
export function serializeSessionBriefForJson(s: CaseSessionBrief) {
  return {
    ...s,
    startedAt: toJsonIsoUtc(s.startedAt),
    completedAt: toJsonIsoUtc(s.completedAt),
    outcome: s.outcome
      ? { ...s.outcome, finalizedAt: toJsonIsoUtc(s.outcome.finalizedAt) }
      : null,
  };
}
