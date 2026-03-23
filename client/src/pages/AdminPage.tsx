import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth-context";

const cards = [
  {
    to: "/admin/users",
    title: "Пользователи",
    desc: "Создание, редактирование и удаление учётных записей",
    color: "bg-violet-100 text-violet-600",
  },
  {
    to: "/cases",
    title: "Кейсы",
    desc: "Управление клиническими кейсами, этапами и блоками",
    color: "bg-brand-100 text-brand-600",
  },
  {
    to: "/sessions",
    title: "Сессии",
    desc: "Просмотр и управление сессиями прохождения",
    color: "bg-teal-100 text-teal-600",
  },
  {
    to: "/admin/references",
    title: "Справочники",
    desc: "Кафедры, факультеты, уровни курсов",
    color: "bg-amber-100 text-amber-600",
  },
  {
    to: "/analytics",
    title: "Аналитика",
    desc: "Сводка по кафедрам, группам и кейсам",
    color: "bg-violet-100 text-violet-600",
  },
];

export function AdminPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "ADMIN") return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
          Панель администратора
        </h1>
        <p className="mt-2 text-slate-500">
          Управление платформой клинических кейсов
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <Link
            key={c.to}
            to={c.to}
            className={`group rounded-2xl border border-white/80 bg-white/90 p-6 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-brand-200/60 hover:shadow-soft motion-safe:animate-fade-up motion-safe:duration-300`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${c.color} transition group-hover:scale-105`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {c.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              {c.desc}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
