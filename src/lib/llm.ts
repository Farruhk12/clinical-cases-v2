const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult =
  | { ok: true; text: string; model?: string; truncated?: boolean }
  | { ok: false; missingKey: boolean; text: string; error?: string };

function geminiModelName() {
  return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
}

/** Лимит выходных токенов (иначе длинный JSON с html обрезается в середине). */
export function llmMaxOutputTokens(): number {
  const n = Number(process.env.LLM_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(n) && n >= 256) return Math.min(Math.floor(n), 32768);
  return 8192;
}

async function geminiGenerate(
  messages: ChatMessage[],
  jsonMode: boolean,
): Promise<ChatResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, missingKey: true, text: "" };
  }

  const model = geminiModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const systemInstruction =
    systemParts.length > 0
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : undefined;

  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: m.content }] });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: llmMaxOutputTokens(),
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      ok: false,
      missingKey: false,
      text: "",
      error: `Gemini error ${res.status}: ${errText}`,
    };
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    return {
      ok: false,
      missingKey: false,
      text: "",
      error: data.error.message,
    };
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  const finishReason = data.candidates?.[0]?.finishReason;

  if (!text && finishReason === "SAFETY") {
    return {
      ok: false,
      missingKey: false,
      text: "",
      error: "Gemini: ответ заблокирован настройками безопасности",
    };
  }

  const truncated = finishReason === "MAX_TOKENS";
  return { ok: true, text, model: `google/${model}`, truncated };
}

async function openaiGenerate(
  messages: ChatMessage[],
  jsonMode: boolean,
): Promise<ChatResult> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (!key) {
    return { ok: false, missingKey: true, text: "" };
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: llmMaxOutputTokens(),
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      ok: false,
      missingKey: false,
      text: "",
      error: `OpenAI error ${res.status}: ${errText}`,
    };
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string };
      finish_reason?: string;
    }[];
  };
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  const truncated = choice?.finish_reason === "length";
  return { ok: true, text, model, truncated };
}

/** Сначала Gemini (`GEMINI_API_KEY`), иначе OpenAI (`OPENAI_API_KEY`). */
export async function chatCompletion(
  messages: ChatMessage[],
  jsonMode = false,
): Promise<ChatResult> {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (!hasGemini && !hasOpenAI) {
    return { ok: false, missingKey: true, text: "" };
  }

  if (hasGemini) {
    const g = await geminiGenerate(messages, jsonMode);
    if (g.ok || !hasOpenAI) return g;
    const o = await openaiGenerate(messages, jsonMode);
    if (o.ok) return o;
    return {
      ok: false,
      missingKey: false,
      text: "",
      error: [g.error, o.error].filter(Boolean).join(" | "),
    };
  }

  return openaiGenerate(messages, jsonMode);
}

export function heuristicFormatBlock(raw: string) {
  const trimmed = raw.trim();
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
  const inner = paragraphs.join("\n") || "<p></p>";
  return {
    blockType: "PLAIN" as const,
    html: `<div data-case-part="narrator">${inner}</div>`,
  };
}
