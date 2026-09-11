import type { BlockType } from "../types/db";
import { chatCompletion, heuristicFormatBlock } from "./llm";
import {
  sanitizeCaseFormattedHtml,
} from "./sanitize-case-html";

export const FORMAT_BLOCK_PROMPT_VERSION = "format-block-v4";

function unwrapJsonFromMarkdown(text: string) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

export type FormatBlockRow = {
  id: string;
  blockType: BlockType;
  imageUrl: string | null;
};

function approximateVisibleTextLen(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function modelHtmlLooksIncomplete(raw: string, htmlFromModel: string): boolean {
  const r = raw.trim();
  if (r.length < 800) return false;
  const inner = htmlFromModel.trim();
  if (!inner) return true;
  return approximateVisibleTextLen(inner) < r.length * 0.33;
}

export async function computeFormattedBlock(
  raw: string,
  block: FormatBlockRow,
): Promise<{
  blockType: BlockType;
  formattedContent: string;
  hint?: string;
}> {
  const llm = await chatCompletion(
    [
      {
        role: "system",
        content: `Ты оформляешь учебный клинический фрагмент для отображения при прохождении кейса.

Верни JSON с полями:
- blockType: обычно PLAIN (один фрагмент кейса); PATIENT_SPEECH / DOCTOR_NOTES / NARRATOR — только если весь текст однороден.
- html: последовательность визуальных блоков. Каждый DIV с атрибутом data-case-part:
  • data-case-part="narrator" — повествование, описание, действия («в кабинет заходит…», «вы спрашиваете» без кавычек реплики). Все подряд идущие абзацы и куски повествования между репликами — в ОДНОМ div narrator (не дробите каждый абзац на отдельный narrator).
  • data-case-part="doctor" — реплики и вопросы врача (часто после тире «—» или в кавычках)
  • data-case-part="patient" — речь пациента, ответы пациента

Внутри каждого DIV только теги: p, br, strong, em, ul, ol, li, blockquote. Без class, style, script.
Чередуй блоки по смыслу: диалог = отдельные doctor и patient; непрерывное повествование = один narrator до следующей реплики или смены роли.
Обязательно включи в поле html ВЕСЬ исходный текст целиком: не сокращай, не пересказывай, не обрывай на первом абзаце — только разметка тегами.
Не выдумывай факты, только разметка исходного текста.
Версия промпта: ${FORMAT_BLOCK_PROMPT_VERSION}`,
      },
      {
        role: "user",
        content: raw || "(пусто)",
      },
    ],
    true,
  );

  let blockType: BlockType = block.blockType;
  let formattedContent: string;
  let hint: string | undefined;

  if (llm.ok && llm.text) {
    try {
      const parsed = JSON.parse(unwrapJsonFromMarkdown(llm.text)) as {
        blockType?: string;
        html?: string;
      };
      const allowed = new Set([
        "PLAIN",
        "PATIENT_SPEECH",
        "DOCTOR_NOTES",
        "NARRATOR",
        "IMAGE_URL",
      ]);
      if (parsed.blockType && allowed.has(parsed.blockType)) {
        blockType = parsed.blockType as BlockType;
      }
      if (
        blockType === "IMAGE_URL" &&
        block.blockType !== "IMAGE_URL" &&
        !(block.imageUrl?.trim())
      ) {
        blockType = "PLAIN";
      }
      const fromModel =
        typeof parsed.html === "string" ? parsed.html.trim() : "";

      const useFullTextFallback =
        llm.truncated ||
        (fromModel.length > 0 && modelHtmlLooksIncomplete(raw, fromModel));

      if (useFullTextFallback) {
        const h = heuristicFormatBlock(raw);
        blockType = h.blockType as BlockType;
        const html = sanitizeCaseFormattedHtml(h.html);
        formattedContent = JSON.stringify({
          html,
          promptVersion: FORMAT_BLOCK_PROMPT_VERSION,
          model: llm.model,
          fullTextFallback: true,
        });
        hint = llm.truncated
          ? "Ответ модели обрезан по лимиту длины; показано полное простое оформление (абзацы). Увеличьте LLM_MAX_OUTPUT_TOKENS в .env при необходимости."
          : "Модель вернула неполный текст; показано полное простое оформление (абзацы).";
      } else {
        const rawHtml =
          fromModel.length > 0
            ? fromModel
            : heuristicFormatBlock(raw).html;
        const html = sanitizeCaseFormattedHtml(rawHtml);
        formattedContent = JSON.stringify({
          html,
          promptVersion: FORMAT_BLOCK_PROMPT_VERSION,
          model: llm.model,
        });
      }
    } catch {
      const h = heuristicFormatBlock(raw);
      const html = sanitizeCaseFormattedHtml(h.html);
      formattedContent = JSON.stringify({
        html,
        promptVersion: FORMAT_BLOCK_PROMPT_VERSION,
        fallback: true,
      });
    }
  } else {
    const h = heuristicFormatBlock(raw);
    hint = !llm.ok
      ? llm.missingKey
        ? "DEEPSEEK_API_KEY не задан"
        : (llm.error ?? "")
      : "";
    const html = sanitizeCaseFormattedHtml(h.html);
    formattedContent = JSON.stringify({
      html,
      promptVersion: FORMAT_BLOCK_PROMPT_VERSION,
      heuristic: true,
      hint,
    });
  }

  return { blockType, formattedContent, hint };
}
