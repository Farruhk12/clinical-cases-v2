import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ReferencesAdmin } from "@/ReferencesAdmin";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import { PageLoader } from "@/components/PageLoader";

type RefBundle = {
  departments: { id: string; name: string }[];
  faculties: { id: string; name: string }[];
  courseLevels: { id: string; name: string; sort: number }[];
};

export function AdminReferencesPage() {
  const { user } = useAuth();
  const [ref, setRef] = useState<RefBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
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
  if (user.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  if (error) {
    return (
      <p className="ui-alert-danger">{error}</p>
    );
  }

  if (!ref) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-8">
      <h1 className="ui-title">Справочники</h1>
      <ReferencesAdmin
        departments={ref.departments}
        faculties={ref.faculties}
        courseLevels={ref.courseLevels}
      />
    </div>
  );
}
