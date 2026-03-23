import { Link } from "react-router-dom";
import { useAuth } from "@/auth-context";
import { IconBook, IconClipboard } from "@/components/icons";

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-10">
      <div className="motion-safe:animate-fade-up">
        <p className="text-sm font-medium text-brand-600">
          {user.role === "ADMIN" ? "Администратор" : "Преподаватель"}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Добро пожаловать{user.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-2 text-slate-500">
          Выберите раздел для работы
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/cases"
          className="group rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-soft motion-safe:animate-fade-up motion-safe:duration-300 sm:p-7"
        >
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600 transition group-hover:scale-105">
            <IconBook className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Кейсы
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Создание и редактирование этапов, блоков, эталона для ИИ.
          </p>
        </Link>
        <Link
          to="/sessions"
          className="group rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-soft motion-safe:animate-fade-up motion-safe:delay-100 motion-safe:duration-300 sm:p-7"
        >
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-mist-100 text-brand-600 transition group-hover:scale-105">
            <IconClipboard className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Сессии
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Запуск прохождения, гипотезы по этапам, итог и экспорт.
          </p>
        </Link>
        <Link
          to="/analytics"
          className="group rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-soft motion-safe:animate-fade-up motion-safe:delay-[180ms] motion-safe:duration-300 sm:col-span-2 sm:p-7 lg:col-span-1"
        >
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 transition group-hover:scale-105">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C4.59167 10.5167 7.06818 9 10 9c2.9318 0 5.4083 1.5167 7 4.125M3 17.25h.008v.008H3v-.008zm3 0h.008v.008H6v-.008zm3 0h.008v.008H9v-.008zm9-4.125c1.5917-2.6083 4.0682-4.125 7-4.125s5.4083 1.5167 7 4.125M18 17.25h.008v.008H18v-.008zm3 0h.008v.008H21v-.008z"
              />
            </svg>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Аналитика
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Сводка сессий, учебных групп и кейсов.
          </p>
        </Link>
      </div>
    </div>
  );
}
