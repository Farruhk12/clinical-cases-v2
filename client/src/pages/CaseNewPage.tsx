import { useEffect, useState } from "react";
import { NewCaseForm } from "@/NewCaseForm";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";

type RefBundle = {
  departments: { id: string; name: string }[];
  faculties: { id: string; name: string }[];
  courseLevels: { id: string; name: string; sort: number }[];
};

export function CaseNewPage() {
  const { user } = useAuth();
  const [ref, setRef] = useState<RefBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch("/api/reference");
      if (!res.ok) {
        if (!cancelled) setError("Не удалось загрузить справочники");
        return;
      }
      const j = (await res.json()) as RefBundle;
      if (!cancelled) {
        setRef(j);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!ref) {
    return <p className="text-slate-500">Загрузка справочников...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
        Новый кейс
      </h1>
      <NewCaseForm
        departments={ref.departments}
        faculties={ref.faculties}
        courseLevels={ref.courseLevels}
        fixedDepartmentId={
          user.role === "TEACHER" ? user.departmentId ?? undefined : undefined
        }
      />
    </div>
  );
}
