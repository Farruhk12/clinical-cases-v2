import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { CaseRowActions } from "@/components/case-row-actions";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import type { CaseListItem } from "~lib/case-list";
import { caseStatusLabel } from "@/lib/teacher-workbench";

export function CasesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await apiFetch("/api/cases");
      if (!res.ok) {
        if (!cancelled) {
          setError("Не удалось загрузить кейсы");
          setLoading(false);
        }
        return;
      }
      const j = (await res.json()) as { cases: CaseListItem[] };
      if (!cancelled) {
        setCases(j.cases);
        setError(null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => c.title.toLowerCase().includes(q));
  }, [cases, query]);

  const selected =
    filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;
  const selectedStatus = selected ? caseStatusLabel(selected) : null;

  if (!user) return null;

  const canEdit = user.role === "ADMIN" || user.role === "TEACHER";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="ui-title">Кейсы</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {cases.length > 0
              ? `${cases.length} ${cases.length === 1 ? "сценарий" : "сценариев"}`
              : "Сценарии для занятия с группой"}
          </p>
        </div>
        {canEdit ? (
          <Link to="/cases/new" className="ui-btn-primary w-full sm:w-auto">
            Новый кейс
          </Link>
        ) : null}
      </div>

      {error ? <p className="ui-alert-danger">{error}</p> : null}

      <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <section className="ui-card flex min-h-0 flex-col overflow-hidden">
          {cases.length > 0 ? (
            <div className="border-b border-line p-3">
              <label className="block">
                <span className="sr-only">Поиск кейса</span>
                <input
                  className="ui-input ui-input-search bg-surface"
                  placeholder="Поиск по названию"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <PageLoader />
            ) : (
              <ul>
                {filtered.map((c) => {
                  const status = caseStatusLabel(c);
                  const active = selected?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={[
                          "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition",
                          active
                            ? "bg-[var(--color-accent-soft)]"
                            : "bg-elevated hover:bg-surface",
                        ].join(" ")}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            status === "черновик"
                              ? "bg-[var(--color-warning)]"
                              : "bg-[var(--color-action)]"
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold tracking-tight text-ink">
                            {c.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-ink-soft">
                            {c.caseFaculties.map((x) => x.faculty.name).join(", ")}
                            {" · "}
                            {c.caseCourseLevels
                              .map((x) => x.courseLevel.name)
                              .join(", ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!loading && !error && filtered.length === 0 ? (
            <div className="p-4">
              <div className="ui-empty space-y-4 px-4 py-12">
                <p>
                  {cases.length === 0
                    ? canEdit
                      ? "Пока нет кейсов. Соберите первый сценарий."
                      : "Пока нет опубликованных кейсов."
                    : "Ничего не найдено."}
                </p>
                {cases.length === 0 && canEdit ? (
                  <Link to="/cases/new" className="ui-btn-primary">
                    Создать кейс
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="ui-card overflow-hidden bg-elevated">
          {selected ? (
            <div className="flex h-full flex-col p-5 sm:p-6">
              <p className="text-[12.5px] text-ink-soft">
                {selected.caseFaculties.map((x) => x.faculty.name).join(", ")}
                {" · "}
                {selected.caseCourseLevels
                  .map((x) => x.courseLevel.name)
                  .join(", ")}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                {selected.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span
                  className={`ui-badge ${
                    selectedStatus === "черновик"
                      ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                      : "bg-brand-50 text-brand-800"
                  }`}
                >
                  {selectedStatus}
                </span>
                {(selected.stageCount ?? 0) === 0 ? (
                  <span className="ui-badge bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                    нет этапов
                  </span>
                ) : (
                  <span className="ui-badge bg-surface text-ink-soft">
                    {selected.stageCount} этап.
                  </span>
                )}
                {!selected.teacherKey?.trim() ? (
                  <span className="ui-badge bg-surface text-ink-soft">
                    нет эталона
                  </span>
                ) : null}
                <span className="ui-badge bg-surface text-ink-soft">
                  {selected._count.sessions} зан.
                </span>
              </div>

              <div className="mt-6 flex flex-wrap gap-1.5">
                <Link
                  to={`/sessions/new?caseId=${encodeURIComponent(selected.id)}`}
                  className="ui-btn-primary"
                >
                  Начать занятие
                </Link>
                {canEdit ? (
                  <CaseRowActions
                    caseId={selected.id}
                    title={selected.title}
                    sessionCount={selected._count.sessions}
                    hideStart
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-muted">Выберите кейс в списке слева.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
