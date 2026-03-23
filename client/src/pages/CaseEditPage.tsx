import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { CaseEditor } from "@/CaseEditor";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";

type RefBundle = {
  departments: { id: string; name: string }[];
  faculties: { id: string; name: string }[];
  courseLevels: { id: string; name: string; sort: number }[];
};

export function CaseEditPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessionCount, setSessionCount] = useState(0);
  const [ref, setRef] = useState<RefBundle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user || !caseId) return;
    let cancelled = false;
    (async () => {
      const cr = await apiFetch(`/api/cases/${caseId}`);
      if (!cr.ok) {
        if (!cancelled) navigate("/cases", { replace: true });
        return;
      }
      const cj = (await cr.json()) as { sessionCount?: number };
      const rr = await apiFetch("/api/reference");
      if (!rr.ok) {
        if (!cancelled) navigate("/cases", { replace: true });
        return;
      }
      const rj = (await rr.json()) as RefBundle;
      if (!cancelled) {
        setSessionCount(cj.sessionCount ?? 0);
        setRef(rj);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, user, navigate]);

  if (!user) return null;
  if (!caseId) {
    return <Navigate to="/cases" replace />;
  }

  if (!ready || !ref) {
    return <p className="text-slate-500">Загрузка редактора...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
        Редактор кейса
      </h1>
      <CaseEditor
        caseId={caseId}
        sessionCount={sessionCount}
        reference={{
          departments: ref.departments,
          faculties: ref.faculties,
          courseLevels: ref.courseLevels,
        }}
        fixedDepartmentId={
          user.role === "TEACHER" ? user.departmentId : null
        }
      />
    </div>
  );
}
