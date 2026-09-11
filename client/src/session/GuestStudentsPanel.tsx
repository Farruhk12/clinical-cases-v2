import { useState } from "react";
import { Link } from "react-router-dom";
import { groupGuestStudents } from "~lib/guest-student-scores";
import type { GuestIdeaJson } from "./types";
import { TakenCheck } from "./GuestIdeasInbox";

export function GuestStudentsPanel({
  ideas,
  sessionId,
  large = false,
}: {
  ideas: GuestIdeaJson[];
  sessionId?: string;
  large?: boolean;
}) {
  const students = groupGuestStudents(ideas);
  if (students.length === 0) return null;

  return (
    <section className="ui-card space-y-4 p-4 sm:p-5">
      <div>
        <h2
          className={
            large
              ? "font-display text-3xl font-medium tracking-tight text-ink"
              : "text-base font-semibold tracking-tight text-ink"
          }
        >
          Оценки студентов
        </h2>
        <p className={`mt-1 ${large ? "text-lg" : "text-sm"} text-ink-soft`}>
          По ответам с телефона. Полная сводка — в разделе «Аналитика».
        </p>
        {sessionId ? (
          <p className="mt-2">
            <Link
              to={`/analytics?sessionId=${encodeURIComponent(sessionId)}`}
              className="text-sm font-medium text-brand-800 hover:underline"
            >
              Открыть в аналитике
            </Link>
          </p>
        ) : null}
      </div>
      <ul className="space-y-2">
        {students.map((student) => (
          <StudentRow
            key={student.guestKey}
            student={student}
            large={large}
          />
        ))}
      </ul>
    </section>
  );
}

function StudentRow({
  student,
  large,
}: {
  student: ReturnType<typeof groupGuestStudents>[number];
  large: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-[12px] border border-line bg-surface">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left sm:px-4"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className={large ? "text-xl font-medium text-ink" : "text-sm font-medium text-ink"}>
            {student.displayName}
          </p>
          <p className={`mt-0.5 ${large ? "text-base" : "text-xs"} text-muted`}>
            {student.hypothesisCount} гип. · {student.questionCount} вопр.
            {student.takenCount
              ? ` · ${student.takenCount} в общем списке`
              : " · в список не брали"}
          </p>
        </div>
        <span className="shrink-0 text-right">
          <span
            className={`font-display font-medium tabular-nums text-ink ${
              large ? "text-3xl" : "text-2xl"
            }`}
          >
            {student.score}
          </span>
          <span className={`${large ? "text-base" : "text-xs"} text-muted`}>
            {" "}
            /100
          </span>
        </span>
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-line px-3 py-3 sm:px-4">
          {student.ideas.map((idea, i) => (
            <li
              key={`${idea.caseStageId}-${i}-${idea.text}`}
              className="flex items-start gap-2 text-sm text-ink"
            >
              {idea.takenAt ? (
                <TakenCheck className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              )}
              <div className="min-w-0">
                <p>
                  <span className="text-xs text-muted">
                    {idea.kind === "HYPOTHESIS" ? "Гипотеза" : "Вопрос"}
                    {idea.stageOrder != null ? ` · этап ${idea.stageOrder}` : ""}
                    {idea.takenAt ? " · в общем списке" : ""}
                  </span>
                </p>
                <p>{idea.text}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
