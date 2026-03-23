import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { CaseRowActions } from "@/components/case-row-actions";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import type { CaseListItem } from "~lib/case-list";

export function CasesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch("/api/cases");
      if (!res.ok) {
        if (!cancelled) setError("Не удалось загрузить кейсы");
        return;
      }
      const j = (await res.json()) as { cases: CaseListItem[] };
      if (!cancelled) {
        setCases(j.cases);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const canEdit = user.role === "ADMIN" || user.role === "TEACHER";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Кейсы
          </h1>
          <p className="mt-1 text-pretty text-sm text-slate-500 sm:text-base">
            {canEdit
              ? "Создавайте этапы, блоки и скрытый эталон для разбора."
              : "Доступны опубликованные кейсы вашего обучения."}
          </p>
        </div>
        {canEdit && (
          <Link
            to="/cases/new"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 sm:w-auto sm:min-h-0"
          >
            Новый кейс
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {cases.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-card backdrop-blur-sm transition hover:border-brand-200/60 hover:shadow-soft sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5"
          >
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-slate-900">
                {c.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {c.caseFaculties.map((x) => x.faculty.name).join(", ")}
                {" · "}
                {c.caseCourseLevels.map((x) => x.courseLevel.name).join(", ")}
                <span className="ml-2 text-slate-400">
                  {c._count.sessions} сесс.
                </span>
                {!c.published && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    черновик
                  </span>
                )}
              </p>
            </div>
            {canEdit ? (
              <CaseRowActions
                caseId={c.id}
                title={c.title}
                sessionCount={c._count.sessions}
              />
            ) : (
              <Link
                to={`/sessions/new?caseId=${c.id}`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 sm:w-auto sm:min-h-0 sm:py-2"
              >
                Запустить сессию
              </Link>
            )}
          </li>
        ))}
      </ul>

      {cases.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-slate-400">Пока нет кейсов для отображения</p>
        </div>
      )}
    </div>
  );
}
