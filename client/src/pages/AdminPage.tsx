import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth-context";
import {
  IconBook,
  IconClipboard,
  IconGrid,
  IconUser,
} from "@/components/icons";

const cards = [
  {
    to: "/admin/users",
    title: "Пользователи",
    desc: "Учётные записи преподавателей и администраторов",
    icon: IconUser,
  },
  {
    to: "/cases",
    title: "Кейсы",
    desc: "Клинические кейсы, этапы и блоки",
    icon: IconBook,
  },
  {
    to: "/sessions",
    title: "Занятия",
    desc: "Прохождения кейсов с учебными группами",
    icon: IconClipboard,
  },
  {
    to: "/admin/references",
    title: "Справочники",
    desc: "Кафедры, факультеты, уровни курсов",
    icon: IconGrid,
  },
  {
    to: "/analytics",
    title: "Аналитика",
    desc: "Оценки групп и студентов, ответы с телефонов, время по этапам",
    wide: true,
  },
];

export function AdminPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "ADMIN") return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-10">
      <div>
        <p className="ui-kicker">Управление</p>
        <h1 className="ui-title mt-2">Панель администратора</h1>
        <p className="mt-2 max-w-[48ch] text-ink-soft">
          Пользователи, справочники и учебный контур платформы.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = "icon" in c ? c.icon : null;
          return (
            <Link
              key={c.to}
              to={c.to}
              className={`ui-card-hover p-6 ${c.wide ? "sm:col-span-2 lg:col-span-3 bg-brand text-[var(--color-on-action)]" : ""}`}
            >
              {Icon ? (
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
              ) : (
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/50">
                  Сводка
                </p>
              )}
              <h2
                className={`mt-1 text-base font-semibold tracking-tight ${c.wide ? "text-white" : "text-ink"}`}
              >
                {c.title}
              </h2>
              <p
                className={`mt-1.5 text-sm leading-relaxed ${c.wide ? "text-white/65" : "text-ink-soft"}`}
              >
                {c.desc}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
