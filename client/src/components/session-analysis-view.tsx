"use client";

import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import type { AiPreliminaryScoresPayload } from "~lib/session-ai-scores";
import { unwrapAnalysisMarkdownIfJsonWrapped } from "~lib/session-ai-scores";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function nodeToPlainText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToPlainText).join("");
  if (typeof node === "object" && "props" in node) {
    return nodeToPlainText(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}

/** Делит ответ ИИ на карточки по заголовкам ## */
export function splitMarkdownByH2(md: string): { title: string; body: string }[] {
  const lines = md.split("\n");
  const blocks: { title: string; body: string }[] = [];
  let pendingTitle: string | null = null;
  let bodyLines: string[] = [];

  function flushPreamble() {
    const body = bodyLines.join("\n").trim();
    bodyLines = [];
    if (body) {
      blocks.push({ title: "Обзор", body });
    }
  }

  function flushSection() {
    if (pendingTitle === null) return;
    const body = bodyLines.join("\n").trim();
    bodyLines = [];
    blocks.push({ title: pendingTitle, body });
    pendingTitle = null;
  }

  for (const line of lines) {
    const hm = line.match(/^(#{1,2})\s+(.+)$/);
    if (hm) {
      if (pendingTitle !== null) {
        flushSection();
      } else {
        flushPreamble();
      }
      pendingTitle = hm[2].trim();
    } else {
      bodyLines.push(line);
    }
  }

  if (pendingTitle !== null) {
    flushSection();
  } else {
    flushPreamble();
  }

  if (blocks.length === 0 && md.trim()) {
    return [{ title: "Анализ", body: md.trim() }];
  }
  return blocks;
}

function extractStageOrderFromTitle(title: string): number | null {
  const m = title.match(/Этап\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const mdComponents: Partial<Components> = {
  h1: ({ children }) => (
    <h4 className="mb-2 text-sm font-semibold text-ink">{children}</h4>
  ),
  h2: ({ children }) => (
    <h4 className="mb-2 mt-4 border-t border-line pt-3 text-sm font-semibold text-[var(--color-accent)] first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </h4>
  ),
  h3: ({ children }) => {
    const t = nodeToPlainText(children).trim().toLowerCase();
    if (t.includes("положительн")) {
      return (
        <h5 className="mb-2 mt-5 flex items-center gap-2 border-b-2 border-[var(--color-success-border)] pb-2 text-sm font-semibold text-[var(--color-success)] first:mt-0">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-success)]"
            aria-hidden
          />
          {children}
        </h5>
      );
    }
    if (t.includes("отрицательн")) {
      return (
        <h5 className="mb-2 mt-5 flex items-center gap-2 border-b-2 border-[var(--color-danger-border)] pb-2 text-sm font-semibold text-[var(--color-danger)]">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-danger)]"
            aria-hidden
          />
          {children}
        </h5>
      );
    }
    if (t.includes("рекомендац")) {
      return (
        <h5 className="mb-2 mt-5 flex items-center gap-2 border-b-2 border-[var(--color-accent)]/40 pb-2 text-sm font-semibold text-[var(--color-accent)]">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-accent)]"
            aria-hidden
          />
          {children}
        </h5>
      );
    }
    return (
      <h5 className="mb-1.5 mt-4 text-sm font-medium text-ink">{children}</h5>
    );
  },
  p: ({ children }) => (
    <p className="my-2 text-sm leading-relaxed text-ink-soft">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-[var(--color-accent)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-soft marker:font-medium marker:text-[var(--color-accent)]">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed text-ink-soft [&_ol]:mt-2 [&_ul]:mt-2">
      {children}
    </li>
  ),
  strong: ({ children }) => {
    const t = nodeToPlainText(children).trim();
    const chip = t.length > 0 && t.length <= 80 && !t.includes("\n");
    if (chip) {
      return (
        <span className="mx-0.5 inline-flex max-w-full align-baseline break-words rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
          {children}
        </span>
      );
    }
    return (
      <strong className="font-semibold text-ink">{children}</strong>
    );
  },
  em: ({ children }) => (
    <em className="text-ink-soft">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-[var(--radius-sm)] border border-line bg-surface py-2 px-3 text-sm text-ink-soft">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-line bg-[var(--color-ink)] p-3 text-xs text-[var(--color-elevated)]">
      {children}
    </pre>
  ),
};

function MarkdownBody({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {source}
    </ReactMarkdown>
  );
}

export function SessionAnalysisView({
  content,
  stageScores,
  averageScore,
}: {
  content: string;
  stageScores?: AiPreliminaryScoresPayload["stageScores"];
  averageScore?: number;
}) {
  const md = unwrapAnalysisMarkdownIfJsonWrapped(content);
  const blocks = splitMarkdownByH2(md);

  return (
    <div className="space-y-4">
      {blocks.length === 0 ? (
        <p className="text-sm text-muted">Текст анализа пуст</p>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, i) => {
            const stageOrder = extractStageOrderFromTitle(block.title);
            const isGeneral =
              stageOrder == null &&
              /общ/i.test(block.title) &&
              /замечан/i.test(block.title);
            const stageScore =
              stageOrder != null && stageScores?.length
                ? (stageScores.find((s) => s.stageOrder === stageOrder)
                    ?.score ?? null)
                : null;
            const generalScore =
              isGeneral && typeof averageScore === "number"
                ? averageScore
                : null;
            const badge = stageScore ?? generalScore;

            return (
            <article
              key={`${block.title}-${i}`}
              className="ui-card overflow-hidden"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
                <h3 className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-ink">
                  {block.title}
                </h3>
                {badge != null ? (
                  <span
                    className="shrink-0 rounded-[8px] bg-brand px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--color-on-action)]"
                    title="Предварительная оценка ИИ по 100-балльной шкале"
                  >
                    {isGeneral ? "Среднее" : "Балл"}: {badge}/100
                  </span>
                ) : null}
              </header>
              <div className="px-4 py-3">
                {block.body ? (
                  <MarkdownBody source={block.body} />
                ) : (
                  <p className="text-sm text-muted">Нет содержимого</p>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
