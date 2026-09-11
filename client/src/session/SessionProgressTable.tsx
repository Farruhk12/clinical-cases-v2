import type { SessionPayload } from "./types";

function ChipList({
  items,
  empty,
  large,
}: {
  items: { id: string; text: string }[];
  empty: string;
  large?: boolean;
}) {
  if (items.length === 0) {
    return <span className={large ? "text-lg text-faint" : "text-faint"}>{empty}</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={
            large
              ? "rounded-full border border-amber-200/80 bg-amber-50 px-4 py-2 text-lg leading-snug text-amber-950"
              : "rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[13px] leading-snug text-amber-950"
          }
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function QuestionList({
  items,
  large,
}: {
  items: { id: string; text: string }[];
  large?: boolean;
}) {
  if (items.length === 0) {
    return <span className={large ? "text-lg text-faint" : "text-faint"}>—</span>;
  }
  return (
    <ul className={large ? "space-y-2 text-lg leading-snug text-ink" : "space-y-1 text-[13px] leading-snug text-ink"}>
      {items.map((item) => (
        <li key={item.id}>{item.text}</li>
      ))}
    </ul>
  );
}

function KeyText({
  text,
  large,
}: {
  text: string;
  large?: boolean;
}) {
  if (!text) {
    return <span className={large ? "text-lg text-faint" : "text-faint"}>—</span>;
  }
  return (
    <p className={large ? "whitespace-pre-wrap text-lg leading-relaxed text-ink" : "whitespace-pre-wrap text-[13px] leading-relaxed text-ink"}>
      {text}
    </p>
  );
}

/** Ход группы: этап / гипотезы / вопросы / эталон. */
export function SessionProgressTable({
  data,
  large = false,
}: {
  data: SessionPayload;
  large?: boolean;
}) {
  const teacherKey = data.session.case.teacherKey?.trim() ?? "";
  const rows = data.timeline;
  const caseKeyOnly = Boolean(teacherKey) && rows.every((r) => !r.learningGoals?.trim());
  const th = large
    ? "px-4 py-3 text-base font-semibold"
    : "px-3 py-2 text-xs font-semibold uppercase tracking-wide sm:px-4";
  const td = large ? "px-4 py-4 align-top" : "px-3 py-3 align-top sm:px-4";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-muted">
            <th className={th}>Этап</th>
            <th className={th}>Гипотезы</th>
            <th className={th}>Вопросы</th>
            <th className={th}>Эталон</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className={large ? "px-4 py-8 text-lg text-faint" : "px-3 py-6 text-sm text-faint sm:px-4"}>
                Хода занятия пока нет.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const stageKey = row.learningGoals?.trim() ?? "";
              const showCaseKeyCell = caseKeyOnly && i === 0;
              const skipKeyCell = caseKeyOnly && i > 0;
              return (
                <tr key={row.stageOrder} className="border-b border-line last:border-b-0">
                  <td className={td}>
                    <div className={large ? "font-display text-2xl font-medium leading-snug text-ink" : "font-medium leading-snug text-ink"}>
                      <span className="text-brand-700">{row.stageOrder}.</span> {row.stageTitle}
                    </div>
                  </td>
                  <td className={td}>
                    <ChipList items={row.hypotheses} empty="—" large={large} />
                  </td>
                  <td className={td}>
                    <QuestionList items={row.questions} large={large} />
                  </td>
                  {skipKeyCell ? null : (
                    <td className={td} rowSpan={showCaseKeyCell ? rows.length : undefined}>
                      <KeyText text={showCaseKeyCell ? teacherKey : stageKey || teacherKey} large={large} />
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
