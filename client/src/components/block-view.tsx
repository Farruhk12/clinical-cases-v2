import type { BlockType } from "~types/db";
import { mergeConsecutiveNarratorCaseDivs } from "~lib/case-html-merge-segments";

function parseFormattedHtml(json: string | null): string | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as { html?: string };
    const html = typeof o.html === "string" ? o.html.trim() : "";
    return html.length > 0 ? html : null;
  } catch {
    return null;
  }
}

function isSegmentedCaseHtml(html: string): boolean {
  return html.includes("data-case-part=");
}

const styleMap: Record<BlockType, { border: string; bg: string; label: string | null }> = {
  PLAIN: { border: "border-line", bg: "bg-elevated", label: null },
  PATIENT_SPEECH: {
    border: "border-line",
    bg: "bg-[#f8f4ea]",
    label: "Речь пациента",
  },
  DOCTOR_NOTES: {
    border: "border-line",
    bg: "bg-[#eef3f9]",
    label: "Наблюдения врача",
  },
  NARRATOR: {
    border: "border-line",
    bg: "bg-surface",
    label: "Повествование",
  },
  IMAGE_URL: { border: "border-line", bg: "bg-surface", label: null },
};

export function BlockView({
  blockType,
  rawText,
  formattedContent,
  imageUrl,
  imageAlt,
}: {
  blockType: BlockType;
  rawText: string | null;
  formattedContent: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
}) {
  const style = styleMap[blockType];

  if (blockType === "IMAGE_URL" && imageUrl) {
    return (
      <figure className="ui-card overflow-hidden p-3 sm:p-4">
        <img
          src={imageUrl}
          alt={imageAlt ?? ""}
          className="max-h-[50vh] w-full rounded-xl object-contain sm:max-h-[32rem]"
          referrerPolicy="no-referrer"
        />
        {imageAlt && (
          <figcaption className="mt-3 text-center text-sm italic text-slate-500">
            {imageAlt}
          </figcaption>
        )}
      </figure>
    );
  }

  const htmlRaw = parseFormattedHtml(formattedContent);
  const html =
    htmlRaw && isSegmentedCaseHtml(htmlRaw)
      ? mergeConsecutiveNarratorCaseDivs(htmlRaw)
      : htmlRaw;
  const segmented = html ? isSegmentedCaseHtml(html) : false;

  if (html && segmented) {
    return (
      <section className="ui-card p-4 sm:p-6">
        <div
          className="case-rich-root prose prose-sm max-w-none text-slate-800 prose-p:my-3 prose-p:leading-relaxed first:prose-p:mt-0 sm:prose-base"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>
    );
  }

  return (
    <section
      className={`rounded-[var(--radius-lg)] border p-4 sm:p-6 ${style.border} ${style.bg}`}
    >
      {style.label && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          {style.label}
        </p>
      )}
      {html ? (
        <div
          className="prose prose-sm max-w-none text-slate-800 prose-p:leading-relaxed sm:prose-base"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-slate-800 sm:text-base">
          {rawText ?? ""}
        </p>
      )}
    </section>
  );
}
