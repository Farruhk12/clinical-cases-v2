import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  NewSessionForm,
  type StudyGroupOption,
} from "@/NewSessionForm";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";
import { PageLoader } from "@/components/PageLoader";
import type { CaseListItem } from "~lib/case-list";
import type { SessionBriefJson } from "@/lib/teacher-workbench";

type User = { id: string; name: string | null; login: string };
type LeaderCandidate = User & { role: string; departmentId: string | null };

export function SessionNewPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const defaultCaseId = searchParams.get("caseId") ?? undefined;
  const defaultGroupId = searchParams.get("groupId") ?? undefined;
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [leaderCandidates, setLeaderCandidates] = useState<LeaderCandidate[]>(
    [],
  );
  const [studyGroups, setStudyGroups] = useState<StudyGroupOption[]>([]);
  const [sessions, setSessions] = useState<SessionBriefJson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const [cRes, gRes, sRes] = await Promise.all([
        apiFetch("/api/cases"),
        apiFetch("/api/study-groups"),
        apiFetch("/api/sessions"),
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
        studyGroups: StudyGroupOption[];
      };
      const sj = sRes.ok
        ? ((await sRes.json()) as { sessions: SessionBriefJson[] })
        : { sessions: [] as SessionBriefJson[] };
      if (!cancelled) {
        setCases(cj.cases);
        setLeaderCandidates(gj.leaderCandidates ?? []);
        setStudyGroups(gj.studyGroups ?? []);
        setSessions(sj.sessions ?? []);
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
    return <p className="ui-alert-danger">{error}</p>;
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ui-title">Новое занятие</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Выберите кейс и группу — ведущим будете вы.
        </p>
      </div>
      <NewSessionForm
        cases={cases}
        leaderCandidates={leaderCandidates}
        studyGroups={studyGroups}
        sessions={sessions}
        defaultCaseId={defaultCaseId}
        defaultGroupId={defaultGroupId}
      />
    </div>
  );
}
