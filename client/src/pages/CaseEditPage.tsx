import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { CaseEditor, type CaseEditorPayload } from "@/CaseEditor";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import { PageLoader } from "@/components/PageLoader";

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
  const [initialCase, setInitialCase] = useState<CaseEditorPayload | null>(
    null,
  );
  const [ref, setRef] = useState<RefBundle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user || !caseId) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const [cr, rr] = await Promise.all([
        apiFetch(`/api/cases/${caseId}`),
        apiFetch("/api/reference"),
      ]);
      if (!cr.ok || !rr.ok) {
        if (!cancelled) navigate("/cases", { replace: true });
        return;
      }
      const cj = (await cr.json()) as {
        case: CaseEditorPayload;
        sessionCount?: number;
      };
      const rj = (await rr.json()) as RefBundle;
      if (!cancelled) {
        setInitialCase(cj.case);
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
    return <PageLoader />;
  }

  return (
    <div className="space-y-8">
      <h1 className="ui-title">Подготовка кейса</h1>
      <CaseEditor
        caseId={caseId}
        sessionCount={sessionCount}
        reference={{
          departments: ref.departments,
          faculties: ref.faculties,
          courseLevels: ref.courseLevels,
        }}
        initialCase={initialCase}
        fixedDepartmentId={
          user.role === "TEACHER" ? user.departmentId : null
        }
      />
    </div>
  );
}
