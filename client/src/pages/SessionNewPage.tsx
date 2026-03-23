import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { NewSessionForm } from "@/NewSessionForm";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import type { CaseListItem } from "~lib/case-list";

type User = { id: string; name: string | null; login: string };
type LeaderCandidate = User & { role: string; departmentId: string | null };

export function SessionNewPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const defaultCaseId = searchParams.get("caseId") ?? undefined;
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [leaderCandidates, setLeaderCandidates] = useState<LeaderCandidate[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const [cRes, gRes] = await Promise.all([
        apiFetch("/api/cases"),
        apiFetch("/api/study-groups"),
      ]);
      if (!cRes.ok || !gRes.ok) {
        if (!cancelled) {
          setError("Не удалось загрузить данные");
          setReady(true);
        }
        return;
      }
      const cj = (await cRes.json()) as { cases: CaseListItem[] };
      const gj = (await gRes.json()) as {
        leaderCandidates: LeaderCandidate[];
      };
      if (!cancelled) {
        setCases(cj.cases);
        setLeaderCandidates(gj.leaderCandidates ?? []);
        setError(null);
        setReady(true);
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

  if (!ready) {
    return <p className="text-slate-500">Загрузка...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
        Новая сессия
      </h1>
      <NewSessionForm
        cases={cases}
        leaderCandidates={leaderCandidates}
        defaultCaseId={defaultCaseId}
      />
    </div>
  );
}
