import { z } from "zod";
import { chatCompletion, type ChatMessage, type ChatUsage } from "./llm";

export const SESSION_ANALYZE_VERSION = "session-analysis-v4";

export const aiAnalysisResponseSchema = z.object({
  analysisMarkdown: z.string(),
  stageScores: z.array(
    z.object({
      stageOrder: z.number().int().positive(),
      stageTitle: z.string().optional(),
      score: z.number().min(0).max(100),
    }),
  ),
  averageScore: z.number().min(0).max(100),
});

export type AiAnalysisResponse = z.infer<typeof aiAnalysisResponseSchema>;

export type AiPreliminaryScoresPayload = {
  stageScores: {
    stageOrder: number;
    stageTitle?: string;
    score: number;
  }[];
  averageScore: number;
};

export function unwrapLlmJson(text: string) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

/**
 * Модель иногда кладёт весь JSON ответа внутрь analysisMarkdown или сохраняется сырой JSON вместо текста.
 * Достаём реальный markdown (рекурсивно, с ограничением глубины).
 */
export function unwrapAnalysisMarkdownIfJsonWrapped(
  md: string,
  depth = 0,
): string {
  if (depth > 5) return md;
  const t = md.trim();
  if (!t.startsWith("{")) return md;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    if (typeof obj.analysisMarkdown === "string") {
      return unwrapAnalysisMarkdownIfJsonWrapped(
        obj.analysisMarkdown.trim(),
        depth + 1,
      );
    }
  } catch {
    return md;
  }
  return md;
}

export function parseAiAnalysisResponse(
  raw: string,
): { ok: true; data: AiAnalysisResponse } | { ok: false } {
  try {
    const parsed = JSON.parse(unwrapLlmJson(raw)) as unknown;
    const data = aiAnalysisResponseSchema.parse(parsed);
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/** Если полный zod-парсинг не прошёл, но JSON читается — достаём markdown и при возможности оценки. */
export function recoverAiAnalysisFromLooseJson(raw: string): {
  analysisMarkdown: string;
  scores: AiPreliminaryScoresPayload | null;
} | null {
  try {
    const parsed = JSON.parse(unwrapLlmJson(raw)) as Record<string, unknown>;
    if (typeof parsed.analysisMarkdown !== "string") return null;
    const md = unwrapAnalysisMarkdownIfJsonWrapped(parsed.analysisMarkdown.trim());
    const scored = aiAnalysisResponseSchema.safeParse(parsed);
    const scores = scored.success
      ? normalizeScores(scored.data)
      : parsePreliminaryScoresLoose(parsed);
    return { analysisMarkdown: md, scores };
  } catch {
    return null;
  }
}

/** Среднее по этапам; если модель ошиблась — пересчитываем. */
export function normalizeScores(
  data: AiAnalysisResponse,
): AiPreliminaryScoresPayload {
  const stages = data.stageScores;
  if (stages.length === 0) {
    return {
      stageScores: stages,
      averageScore: Math.round(
        Math.min(100, Math.max(0, data.averageScore)),
      ),
    };
  }
  const sum = stages.reduce((s, x) => s + x.score, 0);
  const avg = Math.round(sum / stages.length);
  return {
    stageScores: stages,
    averageScore: avg,
  };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Допускает числа из JSON/SQLite как number или string. */
export type StageWorkStats = {
  stageOrder: number;
  hypothesisCount: number;
  questionCount: number;
};

/**
 * Жёсткие потолки по фактическим данным этапа (не «милость» модели).
 * Пустой этап → 0; пара гипотез без вопросов → не выше 20 и т.д.
 */
export function enforceStrictStageScores(
  payload: AiPreliminaryScoresPayload,
  stageStats: StageWorkStats[],
): AiPreliminaryScoresPayload {
  const m = new Map(stageStats.map((s) => [s.stageOrder, s]));
  const adjusted = payload.stageScores.map((row) => {
    const st = m.get(row.stageOrder);
    if (!st) return row;
    const h = st.hypothesisCount;
    const q = st.questionCount;
    let s = row.score;

    if (h === 0 && q === 0) {
      s = 0;
    } else if (h >= 1 && h <= 2 && q === 0) {
      s = Math.min(s, 20);
    } else if (h >= 3 && q === 0) {
      s = Math.min(s, 40);
    } else if (h === 0 && q >= 1) {
      s = Math.min(s, 25);
    }

    return {
      ...row,
      score: Math.max(0, Math.min(100, Math.round(s))),
    };
  });
  const sum = adjusted.reduce((a, x) => a + x.score, 0);
  const averageScore = adjusted.length
    ? Math.round(sum / adjusted.length)
    : 0;
  return { stageScores: adjusted, averageScore };
}

/**
 * Баллы для UI: если в БД в aiAnalysis ошибочно лежит целый JSON ответа, берём stageScores оттуда
 * (иначе остаются старые aiPreliminaryScores после частичного сбоя сохранения).
 */
export function preliminaryScoresFromOutcome(outcome: {
  aiPreliminaryScores?: unknown | null;
  aiAnalysis?: string | null;
} | null | undefined): AiPreliminaryScoresPayload | null {
  if (!outcome) return null;
  const raw = outcome.aiAnalysis?.trim() ?? "";
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const fromJson = parsePreliminaryScoresLoose(parsed);
      if (fromJson) return fromJson;
    } catch {
      /* ignore */
    }
  }
  return parsePreliminaryScoresLoose(outcome.aiPreliminaryScores ?? null);
}

export function parsePreliminaryScoresLoose(
  v: unknown,
): AiPreliminaryScoresPayload | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const arr = o.stageScores;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const stageScores: AiPreliminaryScoresPayload["stageScores"] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const it = item as Record<string, unknown>;
    const order = num(it.stageOrder);
    const score = num(it.score);
    if (order == null || score == null) continue;
    stageScores.push({
      stageOrder: Math.max(1, Math.floor(order)),
      stageTitle:
        typeof it.stageTitle === "string" ? it.stageTitle : undefined,
      score: Math.round(Math.min(100, Math.max(0, score))),
    });
  }
  if (stageScores.length === 0) return null;
  const sum = stageScores.reduce((s, x) => s + x.score, 0);
  const averageScore = Math.round(sum / stageScores.length);
  return { stageScores, averageScore };
}

export type SessionAnalysisStageInput = {
  stageOrder: number;
  stageTitle: string;
  hypotheses: string[];
  questions: string[];
};

/** Сборка промпта для ИИ-разбора занятия — отдельно от HTTP-роута, чтобы промпт можно было версионировать и тестировать независимо. */
export function buildSessionAnalysisPrompt(input: {
  stages: SessionAnalysisStageInput[];
  teacherKey: string;
}): ChatMessage[] {
  const lines: string[] = [];
  for (const st of input.stages) {
    lines.push(`Этап ${st.stageOrder}: ${st.stageTitle}`);
    lines.push(
      "Гипотезы: " + (st.hypotheses.length ? st.hypotheses.join(" | ") : "—"),
    );
    lines.push(
      "Вопросы: " + (st.questions.length ? st.questions.join(" | ") : "—"),
    );
    lines.push("");
  }
  const stageCount = input.stages.length;
  return [
    {
      role: "system",
      content: `Ты методист медицинского образования. Проанализируй ход работы по клиническому кейсу.

В тексте анализа (analysisMarkdown) по-прежнему поощряй широту предварительных гипотез как полезную привычку обучения — но не смягчай цифры оценок.

ОЦЕНКИ score (0–100) — ЖЁСТКО, без снисхождения. Ориентиры (если данных мало — ставь нижнюю границу диапазона):
- Нет ни одной непустой гипотезы И нет ни одного непустого вопроса на этапе → **score = 0**. Не придумывай «зачёт за намерение».
- Только 1–2 короткие гипотезы, вопросов нет → обычно **5–20**, не выше **25**.
- Есть гипотезы (3+), но вопросов нет → обычно не выше **35–45** без сильной аргументации в данных.
- Нет гипотез, но есть вопросы → обычно **15–30**.
- И гипотезы (несколько, осмысленные), и вопросы, логика видна → можно **50–70**.
- **70+** только при реально плотной, связной работе этапа.
- **85+** почти не используй — резерв для выдающейся работы.

averageScore — среднее арифметическое score по этапам, округлённое до целого.

Поле analysisMarkdown — развёрнутый текст на русском в Markdown:
- Для каждого этапа — раздел ## «Этап N: …» (название как во входных данных).
- Внутри этапа три подраздела ### в порядке: Положительные качества | Отрицательные качества | Рекомендации (маркированные списки; если пусто — строка «—»).
- Названия гипотез из данных выделяй **жирным**.
- В конце опционально ## Общие замечания с теми же тремя ###.
- В тексте analysisMarkdown можно кратко упомянуть баллы этапов, но основные числа должны быть в stageScores и averageScore.

Ответ строго один JSON-объект (без текста вокруг) вида:
{"analysisMarkdown":"…","stageScores":[{"stageOrder":1,"stageTitle":"кратко","score":75},…],"averageScore":73}
stageScores.length должно быть ${stageCount} (по числу этапов во входе). stageTitle — короткая подпись этапа.

Не выставляй итоговую оценку вместо преподавателя — только предварительные баллы в полях score. Будь сдержан и требователен к цифрам.
Версия промпта: ${SESSION_ANALYZE_VERSION}.`,
    },
    {
      role: "user",
      content: `Данные по этапам:\n${lines.join("\n")}\n\nЭталон преподавателя (если есть): ${input.teacherKey || "не предоставлен"}`,
    },
  ];
}

export type SessionAnalysisResult = {
  analysis: string;
  model: string | null;
  scoresPayload: AiPreliminaryScoresPayload | null;
  usage: ChatUsage | null;
};

/**
 * Вызывает LLM и собирает итоговый результат (текст + баллы), применяя жёсткие
 * потолки (enforceStrictStageScores) к любому пути получения баллов — прямому
 * парсингу, восстановлению из "рыхлого" JSON и офлайн-фолбэку.
 */
export async function runSessionAnalysis(input: {
  stages: SessionAnalysisStageInput[];
  teacherKey: string;
}): Promise<SessionAnalysisResult> {
  const stageCount = input.stages.length;
  const stageStats: StageWorkStats[] = input.stages.map((st) => ({
    stageOrder: st.stageOrder,
    hypothesisCount: st.hypotheses.filter((h) => h.trim().length > 0).length,
    questionCount: st.questions.filter((q) => q.trim().length > 0).length,
  }));
  const rawLines = input.stages
    .flatMap((st) => [
      `Этап ${st.stageOrder}: ${st.stageTitle}`,
      "Гипотезы: " + (st.hypotheses.length ? st.hypotheses.join(" | ") : "—"),
      "Вопросы: " + (st.questions.length ? st.questions.join(" | ") : "—"),
      "",
    ])
    .join("\n");

  const messages = buildSessionAnalysisPrompt(input);
  const llm = await chatCompletion(messages, true);

  let analysis: string;
  let model: string | null = null;
  let scoresPayload: AiPreliminaryScoresPayload | null = null;

  if (llm.ok && llm.text) {
    const parsed = parseAiAnalysisResponse(llm.text);
    if (parsed.ok) {
      analysis = parsed.data.analysisMarkdown.trim();
      scoresPayload = normalizeScores(parsed.data);
      if (scoresPayload.stageScores.length !== stageCount && stageCount > 0) {
        scoresPayload = null;
      } else {
        scoresPayload = enforceStrictStageScores(scoresPayload, stageStats);
      }
    } else {
      const loose = recoverAiAnalysisFromLooseJson(llm.text);
      if (loose) {
        analysis = loose.analysisMarkdown;
        if (
          loose.scores &&
          (stageCount === 0 || loose.scores.stageScores.length === stageCount)
        ) {
          scoresPayload = enforceStrictStageScores(loose.scores, stageStats);
        }
      } else {
        analysis = llm.text.trim();
      }
    }
    model = llm.model ?? null;
  } else if (!llm.ok && llm.missingKey) {
    analysis =
      "## Локальный режим\n\nНе задан DEEPSEEK_API_KEY. Ниже сырые данные для ручного разбора:\n\n" +
      rawLines;
    model = "offline";
  } else {
    analysis = "Не удалось получить ответ модели. Данные сессии:\n\n" + rawLines;
    model = "error";
  }

  analysis = unwrapAnalysisMarkdownIfJsonWrapped(analysis);
  const usage = llm.ok ? llm.usage ?? null : null;
  return { analysis, model, scoresPayload, usage };
}
