import { Navigate, useParams } from "react-router-dom";
import { PageLoader } from "@/components/PageLoader";
import { PresentationView } from "@/session/PresentationView";
import { PresentationDebrief } from "@/session/PresentationDebrief";
import { usePresentationData } from "@/session/usePresentationData";

/** Полноэкранный крупный вид занятия для второго монитора/проектора. Только чтение. */
export function SessionPresentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <Navigate to="/sessions" replace />;
  return <SessionPresentView sessionId={sessionId} />;
}

function SessionPresentView({ sessionId }: { sessionId: string }) {
  const { data, error, loading } = usePresentationData(sessionId);

  if (loading || !data) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-canvas">
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-1 items-center justify-center bg-canvas">
        <p className="text-xl text-muted">{error}</p>
      </div>
    );
  }

  const completed = data.session.status === "COMPLETED";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="border-b border-line bg-elevated px-8 py-5 xl:px-16">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight text-ink xl:text-3xl">
              {data.session.case.title}
            </h1>
            <p className="mt-1 text-lg text-ink-soft">
              {data.session.studyGroup.name} · {data.session.studyGroup.faculty.name}
            </p>
          </div>
          {!completed && (
            <span className="ui-badge shrink-0 bg-brand-50 px-4 py-1.5 text-base text-brand-800">
              Этап {data.session.currentStageOrder} из{" "}
              {data.session.totalStages || data.visibleStages.length}
            </span>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {completed ? (
          <PresentationDebrief data={data} />
        ) : (
          <PresentationView data={data} />
        )}
      </main>
    </div>
  );
}
