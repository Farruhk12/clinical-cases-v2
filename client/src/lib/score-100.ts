/** Парсит балл 0–100 из строки (целое или дробное). Иначе null. */
export function parseScore100(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** Для отображения: числовая оценка как «72/100», иначе исходный текст. */
export function formatGradeOutOf100(raw: string | null | undefined): string {
  const n = parseScore100(raw);
  if (n != null) return `${Math.round(n)}/100`;
  const s = raw?.trim();
  return s ?? "";
}
