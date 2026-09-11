import { apiUrl } from "@/lib/api-fetch";
import { StageWorkspace } from "@/session/StageWorkspace";
import { SessionDebrief } from "@/session/SessionDebrief";
import { useSessionRunner } from "@/session/useSessionRunner";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { JoinQrPanel } from "@/session/JoinQrPanel";
import type { Role } from "~types/db";
import { Link } from "react-router-dom";
import { useRef } from "react";

export function SessionRunner({
  sessionId,
  userId,
  role,
}: {
  sessionId: string;
  userId: string;
  role: Role;
}) {
  const state = useSessionRunner(sessionId);
  const { data, error, loading, busy, busyLabel } = state;
  const analysisResultsRef = useRef<HTMLDivElement | null>(null);

  if (loading || !data) {
    return <LoadingOverlay label="Загрузка занятия…" />;
  }

  const completed = data.session.status === "COMPLETED";
  const staff = role === "ADMIN" || role === "TEACHER";
  const totalStages = data.session.totalStages || data.visibleStages.length;
  const currentOrder = data.session.currentStageOrder;
  const hasAi = Boolean(data.session.outcome?.aiAnalysis?.trim());
  const hasGrade = Boolean(
    data.session.outcome?.teacherGrade?.trim() || data.session.outcome?.finalizedAt,
  );
  const debriefReady = completed && hasAi && (!staff || hasGrade);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="safe-area-t sticky top-0 z-40 isolate border-b border-line bg-white">
        <div className="safe-area-x mx-auto flex max-w-6xl items-center gap-3 py-2.5 sm:gap-4">
          <Link
            to="/sessions"
            className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-soft transition hover:text-brand-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            К занятиям
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-medium tracking-tight text-ink sm:text-lg">
              {data.session.case.title}
            </p>
            <p className="truncate text-xs text-slate-500">
              {data.session.studyGroup.name} · {data.session.studyGroup.faculty.name}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {!completed && (
              <span className="ui-badge bg-brand-50 text-brand-800">
                Этап {currentOrder} из {totalStages}
              </span>
            )}
            {completed && (
              <span
                className={`ui-badge ${
                  debriefReady
                    ? "bg-surface text-ink-soft"
                    : "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                }`}
              >
                {debriefReady
                  ? "Разбор готов"
                  : !hasGrade
                    ? "Нужна оценка"
                    : "Нужен ИИ-анализ"}
              </span>
            )}
            {!completed && data.session.joinToken ? (
              <JoinQrPanel token={data.session.joinToken} />
            ) : null}
            {(data.canEdit || staff) && (
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() =>
                  window.open(
                    `/sessions/${sessionId}/present`,
                    `present-${sessionId}`,
                    "noopener",
                  )
                }
              >
                На проектор
              </button>
            )}
            {staff && (
              <a href={apiUrl(`/api/sessions/${sessionId}/export`)} className="ui-btn-secondary">
                Экспорт
              </a>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="safe-area-x mx-auto mt-4 w-full max-w-6xl">
          <p className="ui-alert-danger">{error}</p>
        </div>
      )}

      <main
        id="main"
        className={`safe-area-x mx-auto flex w-full max-w-6xl flex-1 flex-col ${
          completed ? "py-6 sm:py-8" : "py-5 sm:py-7"
        }`}
      >
        {!completed && !data.canEdit ? (
          <p className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
            Только просмотр. Вести занятие может назначенный ведущий.
          </p>
        ) : null}

        {completed ? (
          <SessionDebrief
            data={data}
            state={state}
            staff={staff}
            analysisResultsRef={analysisResultsRef}
          />
        ) : (
          <StageWorkspace data={data} state={state} userId={userId} />
        )}
      </main>

      {busy && <LoadingOverlay label={busyLabel} />}
    </div>
  );
}
