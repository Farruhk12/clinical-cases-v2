import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";

type SessionRow = {
  id: string;
  status: string;
  case: { title: string };
  studyGroup: {
    name: string;
    faculty: { name: string };
    courseLevel: { name: string };
  };
  leader: { name: string | null; login: string };
};

export function SessionsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const caseIdFilter = searchParams.get("caseId") ?? undefined;
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = caseIdFilter
        ? `?caseId=${encodeURIComponent(caseIdFilter)}`
        : "";
      const res = await apiFetch(`/api/sessions${q}`);
      if (!res.ok) {
        if (!cancelled) setError("Не удалось загрузить сессии");
        return;
      }
      const j = (await res.json()) as { sessions: SessionRow[] };
      if (!cancelled) {
        setSessions(j.sessions);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseIdFilter]);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            Сессии
          </h1>
          <p className="mt-1 text-slate-500">
            Прохождения кейсов группами: этапы, гипотезы, итоговый анализ.
            {caseIdFilter && (
              <span className="mt-1 block text-sm text-teal-700">
                Фильтр: только сессии этого кейса.{" "}
                <Link to="/sessions" className="underline">
                  Показать все
                </Link>
              </span>
            )}
          </p>
        </div>
        <Link
          to="/sessions/new"
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          Новая сессия
        </Link>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-card backdrop-blur-sm transition hover:border-brand-200/60 hover:shadow-soft"
          >
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-slate-900">
                {s.case.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {s.studyGroup.name} · {s.studyGroup.faculty.name} ·{" "}
                {s.studyGroup.courseLevel.name}
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                <span>Ведущий: {s.leader.name ?? s.leader.login}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.status === "COMPLETED"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-teal-50 text-teal-700"
                  }`}
                >
                  {s.status === "COMPLETED" ? "завершена" : "в процессе"}
                </span>
              </p>
            </div>
            <Link
              to={`/sessions/${s.id}`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              Открыть
            </Link>
          </li>
        ))}
      </ul>

      {sessions.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-slate-400">Сессий пока нет</p>
        </div>
      )}
    </div>
  );
}
