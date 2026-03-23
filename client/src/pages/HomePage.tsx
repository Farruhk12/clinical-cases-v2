import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth-context";
import { PageLoader } from "@/components/PageLoader";
import { IconBook, IconClipboard, IconStethoscope } from "@/components/icons";

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex flex-1 flex-col">
        <PageLoader />
      </main>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="relative flex flex-1 flex-col justify-center px-4 py-16 sm:py-24">
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-16">
        <div className="motion-safe:animate-fade-up">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700 shadow-sm backdrop-blur-sm">
            <IconStethoscope className="h-4 w-4" />
            Клиническое образование
          </p>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Платформа{" "}
            <span className="text-gradient-brand">клинических кейсов</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Создавайте сценарии, ведите групповые сессии и отслеживайте этапы
            обучения — в одной спокойной, понятной среде для преподавателей.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 px-8 py-3.5 text-sm font-semibold text-white shadow-soft transition hover:from-brand-700 hover:to-brand-600 motion-safe:active:scale-[0.98]"
            >
              Войти в систему
            </Link>
          </div>
        </div>

        <div className="relative motion-safe:animate-fade-up motion-safe:delay-150">
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-brand-200/40 via-mist-100/80 to-white/40 blur-2xl" aria-hidden />
          <div className="relative grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-card backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-soft motion-safe:duration-300">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                <IconBook className="h-6 w-6" />
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Кейсы и этапы
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Структурируйте материал: блоки, эталоны для ИИ, роли в диалоге.
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-card backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-soft motion-safe:duration-300 sm:mt-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mist-100 text-brand-600">
                <IconClipboard className="h-6 w-6" />
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Сессии групп
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Запуск прохождения, гипотезы по этапам и итоговая аналитика.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
