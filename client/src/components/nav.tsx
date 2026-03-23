import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useId, useState } from "react";
import type { Role } from "~types/db";
import { useAuth } from "@/auth-context";
import { IconStethoscope } from "@/components/icons";

const links: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Главная", roles: ["ADMIN", "TEACHER"] },
  { href: "/cases", label: "Кейсы", roles: ["ADMIN", "TEACHER"] },
  { href: "/sessions", label: "Сессии", roles: ["ADMIN", "TEACHER"] },
  { href: "/analytics", label: "Аналитика", roles: ["ADMIN", "TEACHER"] },
];

const adminNav: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin", label: "Обзор", end: true },
  { to: "/admin/users", label: "Пользователи" },
  { to: "/admin/references", label: "Справочники" },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      {open ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 12h16M4 18h16"
        />
      )}
    </svg>
  );
}

export function NavBar({
  role,
  login,
}: {
  role: Role;
  login?: string | null;
}) {
  const { signOut } = useAuth();
  const location = useLocation();
  const visible = links.filter((l) => l.roles.includes(role));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-mist-200/80 bg-white/70 shadow-sm backdrop-blur-lg safe-area-t">
      <div className="safe-area-x mx-auto flex max-w-6xl items-center justify-between gap-2 py-3 md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-5 lg:gap-8">
          <Link
            to="/dashboard"
            className="group flex shrink-0 items-center gap-2 font-display font-semibold text-brand-700 transition hover:text-brand-800"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-mist-100 text-brand-600 shadow-sm transition group-hover:shadow-card md:h-9 md:w-9">
              <IconStethoscope className="h-5 w-5" />
            </span>
            <span className="hidden min-w-0 truncate sm:inline">
              Клинические кейсы
            </span>
          </Link>
          <nav
            className="hidden flex-wrap gap-1 text-sm md:flex md:gap-2"
            aria-label="Основной раздел"
          >
            {visible.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-800 md:py-1.5"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
          <span className="hidden max-w-[10rem] truncate rounded-lg bg-mist-50 px-3 py-2 text-slate-600 lg:inline lg:max-w-[14rem] lg:py-1.5">
            {login}
          </span>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-mist-200 bg-white/90 px-3 py-2 font-medium text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/80 hover:text-brand-800 md:min-h-0"
            onClick={() => void signOut()}
          >
            Выйти
          </button>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-mist-200 bg-white/90 text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/80 hover:text-brand-800 md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div
          id={menuId}
          className="safe-area-x border-t border-mist-100 bg-white/95 pb-3 pt-1 backdrop-blur-md md:hidden"
        >
          <nav className="flex flex-col" aria-label="Основной раздел">
            {visible.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className="rounded-lg px-2 py-3 text-base font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800"
              >
                {l.label}
              </Link>
            ))}
            {login ? (
              <p className="mt-1 truncate border-t border-mist-100 px-2 py-2.5 text-sm text-slate-500">
                {login}
              </p>
            ) : null}
          </nav>
        </div>
      ) : null}
      {role === "ADMIN" ? (
        <div className="border-t border-mist-100/90 bg-gradient-to-r from-mist-50/95 via-white/60 to-brand-50/40 backdrop-blur-md">
          <div className="safe-area-x mx-auto flex max-w-6xl flex-col gap-2 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
            <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-brand-600/90">
              Админ
            </span>
            <nav
              className="flex flex-wrap gap-x-1 gap-y-1"
              aria-label="Администрирование"
            >
              {adminNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      "rounded-lg px-3 py-2 font-medium transition sm:py-1.5",
                      isActive
                        ? "bg-white text-brand-800 shadow-sm ring-1 ring-brand-200/60"
                        : "text-slate-600 hover:bg-white/70 hover:text-brand-800",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
