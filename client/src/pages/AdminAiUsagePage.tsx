import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import { PageLoader } from "@/components/PageLoader";

type CostBreakdown = {
  promptTokens: number;
  completionTokens: number;
  actualCostUsd: number;
  billedCostUsd: number;
};

type CaseUsageRow = CostBreakdown & {
  caseId: string;
  caseTitle: string;
  callCount: number;
  sessionCount: number;
};

type SessionUsageRow = CostBreakdown & {
  caseSessionId: string;
  caseTitle: string;
  studyGroupName: string;
  startedAt: string;
  callCount: number;
};

type AiUsagePayload = {
  pricing: {
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
    markupMultiplier: number;
  };
  totals: CostBreakdown & { callCount: number };
  byCase: CaseUsageRow[];
  bySession: SessionUsageRow[];
};

function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="ui-card p-4 sm:p-5">
      <p className="ui-kicker">{label}</p>
      <p className="mt-2 font-display text-2xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export function AdminAiUsagePage() {
  const { user } = useAuth();
  const [data, setData] = useState<AiUsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch("/api/admin/ai-usage");
      if (cancelled) return;
      if (!res.ok) {
        setError("Не удалось загрузить данные о расходах на ИИ");
        setLoading(false);
        return;
      }
      const j = (await res.json()) as AiUsagePayload;
      setData(j);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;
  if (user.role !== "ADMIN") return <Navigate to="/dashboard" replace />;
  if (loading || !data) return <PageLoader />;
  if (error) return <p className="ui-alert-danger">{error}</p>;

  const { pricing, totals, byCase, bySession } = data;
  const totalTokens = totals.promptTokens + totals.completionTokens;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ui-title">Расходы на ИИ</h1>
        <p className="mt-1 max-w-2xl text-pretty text-sm text-muted sm:text-base">
          Реальные токены DeepSeek по каждому вызову ИИ-анализа занятий. Наценка
          применяется поверх фактической стоимости у поставщика.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Фактические затраты"
          value={formatUsd(totals.actualCostUsd)}
          sub={`${totals.callCount} вызовов ИИ`}
        />
        <StatCard
          label="К выставлению (с наценкой)"
          value={formatUsd(totals.billedCostUsd)}
          sub={`× ${pricing.markupMultiplier} к фактическим`}
        />
        <StatCard
          label="Токенов всего"
          value={totalTokens.toLocaleString("ru-RU")}
          sub={`${totals.promptTokens.toLocaleString("ru-RU")} вход · ${totals.completionTokens.toLocaleString("ru-RU")} выход`}
        />
        <StatCard
          label="Цена за 1M токенов"
          value={`${formatUsd(pricing.inputPerMillionUsd)} / ${formatUsd(pricing.outputPerMillionUsd)}`}
          sub="вход / выход, DeepSeek"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-ink">По кейсам</h2>
        {byCase.length === 0 ? (
          <p className="ui-empty">ИИ-анализ ещё не запускался ни разу.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="ui-table-head">
                  <th className="px-4 py-3">Кейс</th>
                  <th className="px-4 py-3 text-right">Занятий</th>
                  <th className="px-4 py-3 text-right">Вызовов ИИ</th>
                  <th className="px-4 py-3 text-right">Токенов</th>
                  <th className="px-4 py-3 text-right">Факт. затраты</th>
                  <th className="px-4 py-3 text-right">К выставлению</th>
                </tr>
              </thead>
              <tbody>
                {byCase.map((c) => (
                  <tr key={c.caseId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{c.caseTitle}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {c.sessionCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {c.callCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {(c.promptTokens + c.completionTokens).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {formatUsd(c.actualCostUsd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-brand-800">
                      {formatUsd(c.billedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Последние занятия с ИИ-анализом
        </h2>
        {bySession.length === 0 ? (
          <p className="ui-empty">Пока нет данных.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="ui-table-head">
                  <th className="px-4 py-3">Кейс</th>
                  <th className="px-4 py-3">Группа</th>
                  <th className="px-4 py-3">Начато</th>
                  <th className="px-4 py-3 text-right">Вызовов</th>
                  <th className="px-4 py-3 text-right">Факт. затраты</th>
                  <th className="px-4 py-3 text-right">К выставлению</th>
                </tr>
              </thead>
              <tbody>
                {bySession.map((s) => (
                  <tr key={s.caseSessionId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{s.caseTitle}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.studyGroupName}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(s.startedAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {s.callCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {formatUsd(s.actualCostUsd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-brand-800">
                      {formatUsd(s.billedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
