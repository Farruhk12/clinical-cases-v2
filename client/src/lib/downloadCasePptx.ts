import { apiFetch } from "@/lib/api-fetch";

/**
 * Скачивание экспорта кейса в PPTX (тот же endpoint, что в редакторе).
 */
export async function downloadCasePptx(
  caseId: string,
  titleForFile: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await apiFetch(`/api/cases/${caseId}/export/pptx`);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        message:
          typeof j.error === "string"
            ? j.error
            : "Не удалось сформировать презентацию",
      };
    }
    const blob = await res.blob();
    const safe =
      titleForFile
        .trim()
        .replace(/[<>:"/\\|?*]+/g, "_")
        .slice(0, 100) || "case";
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${safe}.pptx`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, message: "Не удалось скачать файл" };
  }
}
