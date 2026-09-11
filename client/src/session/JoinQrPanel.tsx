import { useMemo, useState } from "react";
import { qrSvg } from "@/lib/qr-svg";

export function joinUrlForToken(token: string): string {
  if (typeof window === "undefined") return `/j/${token}`;
  return `${window.location.origin}/j/${token}`;
}

export function JoinQrPanel({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => joinUrlForToken(token), [token]);
  const svg = useMemo(() => qrSvg(url, 5), [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" className="ui-btn-secondary" onClick={() => setOpen(true)}>
        QR для группы
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-qr-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="ui-card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="join-qr-title" className="text-base font-semibold tracking-tight text-ink">
              Вход студентов
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Сканируют телефоном — имя, гипотезы и вопросы. Аккаунт не нужен.
            </p>
            <div
              className="mx-auto mt-4 w-[220px]"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="mt-3 break-all text-center text-xs text-muted">{url}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="ui-btn-primary flex-1" onClick={() => void copy()}>
                {copied ? "Скопировано" : "Скопировать ссылку"}
              </button>
              <button
                type="button"
                className="ui-btn-secondary flex-1"
                onClick={() => setOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
