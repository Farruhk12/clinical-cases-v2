import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api-fetch";
import { BlockView } from "@/components/block-view";
import { BrandMark } from "@/components/BrandMark";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PageLoader } from "@/components/PageLoader";
import type { ApiBlock } from "@/session/types";
import type { GuestIdeaJson } from "@/session/types";

type JoinPayload = {
  status: string;
  caseTitle: string;
  groupName: string;
  facultyName: string;
  currentStageOrder: number;
  totalStages: number;
  currentStage: {
    id: string;
    order: number;
    title: string;
    blocks: ApiBlock[];
  } | null;
  ownIdeas: GuestIdeaJson[];
};

const NAME_KEY = "clinical-cases:guest-name";

function guestStorageKey(token: string) {
  return `clinical-cases:guest-key:${token}`;
}

function readOrCreateGuestKey(token: string): string {
  try {
    const existing = localStorage.getItem(guestStorageKey(token));
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(guestStorageKey(token), next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function JoinSessionPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<JoinPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [joined, setJoined] = useState(false);
  const [hypo, setHypo] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  const guestKey = useMemo(
    () => (token ? readOrCreateGuestKey(token) : ""),
    [token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const q = guestKey ? `?guestKey=${encodeURIComponent(guestKey)}` : "";
    const res = await apiFetch(`/api/join/${token}${q}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Занятие недоступно");
      setLoading(false);
      return;
    }
    const j = (await res.json()) as JoinPayload;
    setData(j);
    setError(null);
    setLoading(false);
  }, [token, guestKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!joined || data?.status !== "IN_PROGRESS") return;
    const id = window.setInterval(() => void load(), 6000);
    return () => window.clearInterval(id);
  }, [joined, data?.status, load]);

  function enter(e: React.FormEvent) {
    e.preventDefault();
    const n = name.replace(/\s+/g, " ").trim();
    if (n.length < 2) {
      setError("Укажите имя — так ведущий увидит, чья гипотеза");
      return;
    }
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
    setName(n);
    setError(null);
    setJoined(true);
  }

  async function send(kind: "HYPOTHESIS" | "QUESTION") {
    if (!token) return;
    const text = kind === "HYPOTHESIS" ? hypo : question;
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/join/${token}/ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestKey,
        displayName: name.trim(),
        kind,
        text,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Не удалось отправить");
      return;
    }
    if (kind === "HYPOTHESIS") setHypo("");
    else setQuestion("");
    await load();
  }

  if (!token) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-ink-soft">Ссылка неполная.</p>
      </main>
    );
  }

  if (loading && !data) {
    return (
      <main className="flex flex-1 flex-col">
        <PageLoader />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="ui-alert-danger max-w-md">{error ?? "Занятие не найдено"}</p>
      </main>
    );
  }

  const completed = data.status !== "IN_PROGRESS";

  return (
    <main id="main" className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <header className="mb-6 flex items-center gap-2.5">
        <BrandMark className="h-9 w-9" />
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight text-ink">{data.caseTitle}</p>
          <p className="truncate text-xs text-muted">
            {data.groupName} · {data.facultyName}
          </p>
        </div>
      </header>

      {error ? <p className="ui-alert-danger mb-4">{error}</p> : null}

      {completed ? (
        <p className="ui-card p-5 text-sm leading-relaxed text-ink-soft">
          Занятие уже завершено. Новые гипотезы отправить нельзя.
        </p>
      ) : !joined ? (
        <form className="ui-card space-y-4 p-5" onSubmit={enter}>
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
            Как вас зовут?
          </h1>
          <p className="text-sm leading-relaxed text-ink-soft">
            Имя увидит ведущий рядом с вашими гипотезами. Профиль создавать не нужно.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Имя</span>
            <input
              className="ui-input"
              value={name}
              autoComplete="name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Анна"
              required
            />
          </label>
          <button type="submit" className="ui-btn-primary w-full">
            Войти на занятие
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-soft">
            Вы — <span className="font-medium text-ink">{name}</span>
            <button
              type="button"
              className="ml-2 text-xs text-brand-700 hover:underline"
              onClick={() => setJoined(false)}
            >
              сменить
            </button>
          </p>

          {data.currentStage ? (
            <article>
              <p className="ui-kicker mb-2">
                Этап {data.currentStageOrder} из {data.totalStages}
              </p>
              <h2 className="mb-4 text-lg font-semibold text-ink">
                {data.currentStage.order}. {data.currentStage.title}
              </h2>
              <div className="space-y-4">
                {data.currentStage.blocks.map((b) => (
                  <BlockView
                    key={b.id}
                    blockType={b.blockType}
                    rawText={b.rawText}
                    formattedContent={b.formattedContent}
                    imageUrl={b.imageUrl}
                    imageAlt={b.imageAlt}
                  />
                ))}
              </div>
            </article>
          ) : null}

          <section className="ui-card space-y-3 p-4">
            <h3 className="text-sm font-semibold text-slate-700">Ваша гипотеза</h3>
            <div className="flex gap-2">
              <input
                className="ui-input flex-1"
                value={hypo}
                placeholder="Что это может быть…"
                onChange={(e) => setHypo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (hypo.trim()) void send("HYPOTHESIS");
                  }
                }}
              />
              <button
                type="button"
                className="ui-btn-primary shrink-0"
                disabled={busy || !hypo.trim()}
                onClick={() => void send("HYPOTHESIS")}
              >
                Отправить
              </button>
            </div>
            <h3 className="pt-2 text-sm font-semibold text-slate-700">Вопрос</h3>
            <div className="flex gap-2">
              <input
                className="ui-input flex-1"
                value={question}
                placeholder="Что ещё нужно узнать…"
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (question.trim()) void send("QUESTION");
                  }
                }}
              />
              <button
                type="button"
                className="ui-btn-secondary shrink-0"
                disabled={busy || !question.trim()}
                onClick={() => void send("QUESTION")}
              >
                Отправить
              </button>
            </div>
          </section>

          {data.ownIdeas.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Вы отправили</h3>
              <ul className="space-y-1.5">
                {data.ownIdeas.map((idea) => (
                  <li
                    key={idea.id}
                    className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      {idea.kind === "HYPOTHESIS" ? "Гипотеза" : "Вопрос"}
                      {idea.takenAt ? (
                        <span className="font-medium text-emerald-800">
                          · в общем списке
                        </span>
                      ) : null}
                    </span>
                    <p>{idea.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      {busy ? <LoadingOverlay label="Отправляем…" /> : null}
    </main>
  );
}
