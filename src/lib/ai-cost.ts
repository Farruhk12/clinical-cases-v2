/**
 * Расчёт стоимости вызовов ИИ по реальным токенам (см. AiUsageLog) и текущим
 * ценам DeepSeek. Цены заданы через env, чтобы их можно было менять без деплоя
 * при обновлении прайса поставщика.
 *
 * AI_COST_MARKUP_MULTIPLIER — наценка платформы поверх фактической стоимости
 * (например, 10 = показывать/включать в биллинг в 10 раз больше реальных затрат).
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** $ за 1M input-токенов (cache miss, off-peak) — см. api-docs.deepseek.com/quick_start/pricing. */
export function priceInputPerMillion(): number {
  return envNumber("DEEPSEEK_PRICE_INPUT_PER_1M", 0.15);
}

/** $ за 1M output-токенов (off-peak). */
export function priceOutputPerMillion(): number {
  return envNumber("DEEPSEEK_PRICE_OUTPUT_PER_1M", 0.6);
}

/** Множитель наценки платформы поверх фактической стоимости ИИ. */
export function costMarkupMultiplier(): number {
  return envNumber("AI_COST_MARKUP_MULTIPLIER", 10);
}

export type AiCostBreakdown = {
  promptTokens: number;
  completionTokens: number;
  /** Фактическая стоимость у поставщика, $. */
  actualCostUsd: number;
  /** Фактическая стоимость × множитель наценки, $. */
  billedCostUsd: number;
};

export function computeAiCost(usage: {
  promptTokens: number;
  completionTokens: number;
}): AiCostBreakdown {
  const inputCost = (usage.promptTokens / 1_000_000) * priceInputPerMillion();
  const outputCost = (usage.completionTokens / 1_000_000) * priceOutputPerMillion();
  const actualCostUsd = inputCost + outputCost;
  const billedCostUsd = actualCostUsd * costMarkupMultiplier();
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    actualCostUsd,
    billedCostUsd,
  };
}
