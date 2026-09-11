import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { downloadCasePptx } from "@/lib/downloadCasePptx";
import { LoadingOverlay } from "@/components/LoadingOverlay";

export function CaseRowActions({
  caseId,
  title,
  sessionCount,
  hideStart = false,
}: {
  caseId: string;
  title: string;
  sessionCount: number;
  hideStart?: boolean;
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
        ? `\n\nСейчас у кейса ${sessionCount} занят. Пока они есть, сервер не даст удалить кейс — сначала в редакторе нажмите «Закрыть и удалить все занятия этого кейса».`
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
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <Link to={`/cases/${caseId}/edit`} className="ui-btn-secondary">
          Редактировать
        </Link>
        <button
          type="button"
          disabled={pptxBusy}
          onClick={() => void exportPptx()}
          title="Слайды PowerPoint по этапам и блокам (как в базе)"
          className="ui-btn-secondary"
        >
          Скачать PPTX
        </button>
        {hideStart ? null : (
          <Link to={`/sessions/new?caseId=${caseId}`} className="ui-btn-primary">
            Начать занятие
          </Link>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteCase()}
          className="ui-btn-danger"
        >
          Удалить
        </button>
      </div>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
      ) : null}
      {pptxError ? (
        <p className="max-w-xs text-right text-xs text-red-600">{pptxError}</p>
      ) : null}

      {(busy || pptxBusy) && (
        <LoadingOverlay label={busy ? "Удаляем кейс…" : "Формируем PPTX…"} />
      )}
    </div>
  );
}
