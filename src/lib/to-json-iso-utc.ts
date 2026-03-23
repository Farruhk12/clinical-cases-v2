/**
 * Postgres `TIMESTAMP` (without time zone) хранит «наивное» время; в JSON оно часто
 * уходит строкой без смещения, и `new Date(...)` в браузере трактует это как *локальное*,
 * из‑за чего `toLocaleString` показывает неверные часы.
 * Сериализуем в ISO с суффиксом Z (момент в UTC), чтобы клиент корректно перевёл в свой пояс.
 */
export function toJsonIsoUtc(
  value: Date | string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/[zZ]$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) {
    const d = new Date(`${normalized}Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
