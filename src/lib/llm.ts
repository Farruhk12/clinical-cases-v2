const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ChatResult =
  | { ok: true; text: string; model?: string; truncated?: boolean; usage?: ChatUsage }
  | { ok: false; missingKey: boolean; text: string; error?: string };

/** Лимит выходных токенов (иначе длинный JSON с html обрезается в середине). */
export function llmMaxOutputTokens(): number {
  const n = Number(process.env.LLM_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(n) && n >= 256) return Math.min(Math.floor(n), 32768);
  return 8192;
}

async function deepseekGenerate(
  messages: ChatMessage[],
  jsonMode: boolean,
): Promise<ChatResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";

  if (!key) {
    return { ok: false, missingKey: true, text: "" };
  }

  const res = await fetch(DEEPSEEK_URL, {
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
      error: `DeepSeek error ${res.status}: ${errText}`,
    };
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string };
      finish_reason?: string;
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  const truncated = choice?.finish_reason === "length";
  const usage =
    typeof data.usage?.prompt_tokens === "number" &&
    typeof data.usage?.completion_tokens === "number"
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined;
  return { ok: true, text, model: `deepseek/${model}`, truncated, usage };
}

/** DeepSeek (`DEEPSEEK_API_KEY`). */
export async function chatCompletion(
  messages: ChatMessage[],
  jsonMode = false,
): Promise<ChatResult> {
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  if (!hasDeepseek) {
    return { ok: false, missingKey: true, text: "" };
  }
  return deepseekGenerate(messages, jsonMode);
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
