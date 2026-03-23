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

const styleMap: Record<BlockType, { border: string; bg: string; accent: string; label: string | null }> = {
  PLAIN: { border: "border-slate-200/60", bg: "bg-white", accent: "", label: null },
  PATIENT_SPEECH: {
    border: "border-amber-200",
    bg: "bg-gradient-to-br from-amber-50/80 to-amber-50/40",
    accent: "border-l-4 border-l-amber-400",
    label: "Речь пациента",
  },
  DOCTOR_NOTES: {
    border: "border-sky-200",
    bg: "bg-gradient-to-br from-sky-50/80 to-sky-50/40",
    accent: "border-l-4 border-l-sky-400",
    label: "Наблюдения врача",
  },
  NARRATOR: {
    border: "border-violet-200",
    bg: "bg-gradient-to-br from-violet-50/60 to-white",
    accent: "border-l-4 border-l-violet-400",
    label: "Повествование",
  },
  IMAGE_URL: { border: "border-slate-200/60", bg: "bg-slate-50", accent: "", label: null },
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
      <figure className="overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50 p-3 sm:p-4">
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
      <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm sm:p-6">
        <div
          className="case-rich-root prose prose-sm max-w-none text-slate-800 prose-p:my-3 prose-p:leading-relaxed first:prose-p:mt-0 sm:prose-base"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>
    );
  }

  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm sm:p-6 ${style.border} ${style.bg} ${style.accent}`}
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
