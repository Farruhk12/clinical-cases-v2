import { Link, Navigate, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/auth-context";
import { PageLoader } from "@/components/PageLoader";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { BrandMark } from "@/components/BrandMark";
import { IconLock, IconUser } from "@/components/icons";

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <main id="main" className="flex flex-1 flex-col">
        <PageLoader />
      </main>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(login.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Неверный логин или пароль");
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  return (
    <main id="main" className="relative flex flex-1 flex-col lg:flex-row">
      <aside className="relative hidden w-[42%] shrink-0 flex-col justify-between bg-brand px-10 py-10 text-[var(--color-on-action)] lg:flex">
        <div className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="isolate flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-[var(--shadow-hair)]">
            <BrandMark className="h-8 w-8" />
          </span>
          Клинические кейсы
        </div>
        <div>
          <p className="font-display text-4xl font-medium leading-[1.12] tracking-tight xl:text-5xl">
            Спокойная среда для разбора кейсов.
          </p>
          <p className="mt-5 max-w-[32ch] text-sm leading-relaxed text-white/65">
            Кейсы, групповые занятия и аналитика кафедры в одном рабочем контуре.
          </p>
        </div>
        <p className="text-xs text-white/40">Образовательная платформа</p>
      </aside>

      <section className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md motion-safe:animate-fade-up">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-brand-700 transition hover:text-brand-800"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            На главную
          </Link>

          <div className="ui-card p-7 sm:p-9">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Вход
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Учётная запись преподавателя или администратора.
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <IconUser className="h-4 w-4 text-brand-600" />
                  Логин
                </span>
                <input
                  className="ui-input"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  placeholder="Введите логин"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <IconLock className="h-4 w-4 text-brand-600" />
                  Пароль
                </span>
                <input
                  className="ui-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </label>
              {error ? (
                <p className="ui-alert-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="ui-btn-primary mt-1 py-3"
              >
                Войти
              </button>
            </form>
          </div>
        </div>
      </section>

      {busy && <LoadingOverlay label="Входим…" />}
    </main>
  );
}
