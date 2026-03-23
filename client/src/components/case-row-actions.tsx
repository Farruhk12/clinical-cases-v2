import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { downloadCasePptx } from "@/lib/downloadCasePptx";

export function CaseRowActions({
  caseId,
  title,
  sessionCount,
}: {
  caseId: string;
  title: string;
  sessionCount: number;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pptxBusy, setPptxBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pptxError, setPptxError] = useState<string | null>(null);

  async function deleteCase() {
    setError(null);
    const extra =
      sessionCount > 0
        ? `\n\nСейчас у кейса ${sessionCount} сесс. Пока они есть, сервер не даст удалить кейс — сначала в редакторе нажмите «Закрыть и удалить все сессии этого кейса».`
        : "";
    const ok = window.confirm(
      `Удалить кейс «${title}» безвозвратно (этапы, блоки, данные)?${extra}`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/cases/${caseId}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          typeof j.error === "string"
            ? j.error
            : "Не удалось удалить кейс",
        );
        return;
      }
      navigate(0);
    } catch {
      setError("Сеть недоступна или запрос прерван.");
    } finally {
      setBusy(false);
    }
  }

  async function exportPptx() {
    setPptxError(null);
    setPptxBusy(true);
    const r = await downloadCasePptx(caseId, title);
    setPptxBusy(false);
    if (!r.ok) setPptxError(r.message);
  }

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
        <Link
          to={`/cases/${caseId}/edit`}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-center text-sm text-slate-600 transition hover:bg-slate-50 sm:min-h-0 sm:px-3.5 sm:py-1.5"
        >
          Редактировать
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteCase()}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60 sm:min-h-0 sm:px-3.5 sm:py-1.5"
        >
          {busy ? "Удаление..." : "Удалить"}
        </button>
        <button
          type="button"
          disabled={pptxBusy}
          onClick={() => void exportPptx()}
          title="Слайды PowerPoint по этапам и блокам (как в базе)"
          className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-xl border-2 border-emerald-700 !bg-emerald-600 px-3 py-2 text-sm font-semibold !text-white shadow-sm transition hover:!bg-emerald-700 disabled:opacity-60 sm:col-span-1 sm:min-h-0 sm:px-3.5 sm:py-1.5"
        >
          {pptxBusy ? "PPTX…" : "Скачать PPTX"}
        </button>
        <Link
          to={`/sessions/new?caseId=${caseId}`}
          className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 sm:col-span-1 sm:min-h-0 sm:px-3.5 sm:py-1.5"
        >
          Запустить сессию
        </Link>
      </div>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
      ) : null}
      {pptxError ? (
        <p className="max-w-xs text-right text-xs text-red-600">{pptxError}</p>
      ) : null}
    </div>
  );
}
