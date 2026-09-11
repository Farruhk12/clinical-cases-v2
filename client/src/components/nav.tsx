import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useId, useState } from "react";
import type { Role } from "~types/db";
import { useAuth } from "@/auth-context";
import { BrandMark } from "@/components/BrandMark";

const links: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Сегодня", roles: ["ADMIN", "TEACHER"] },
  { href: "/cases", label: "Кейсы", roles: ["ADMIN", "TEACHER"] },
  { href: "/sessions", label: "Занятия", roles: ["ADMIN", "TEACHER"] },
  { href: "/analytics", label: "Аналитика", roles: ["ADMIN", "TEACHER"] },
];

const adminNav: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin", label: "Обзор", end: true },
  { to: "/admin/users", label: "Пользователи" },
  { to: "/admin/references", label: "Справочники" },
  { to: "/admin/ai-usage", label: "Расходы на ИИ" },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
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
          d="M4 7h16M4 12h16M4 17h16"
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
  const initial = (login ?? "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[var(--color-canvas)]/90 backdrop-blur-xl safe-area-t">
      <div className="safe-area-x mx-auto flex max-w-[96rem] items-center justify-between gap-3 py-2 md:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link
            to="/dashboard"
            className="group flex shrink-0 items-center gap-2.5 text-ink transition hover:text-brand-700"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-elevated shadow-[var(--shadow-hair)]">
              <BrandMark className="h-7 w-7" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate font-display text-[1.02rem] font-semibold leading-tight tracking-tight">
                Клинические кейсы
              </span>
              <span className="block truncate text-[11px] leading-tight text-[var(--color-gilt)]">
                Карта занятий
              </span>
            </span>
          </Link>
          <nav
            className="ui-seg hidden text-sm md:inline-flex"
            aria-label="Основной раздел"
          >
            {visible.map((l) => (
              <NavLink
                key={l.href}
                to={l.href}
                className={({ isActive }) =>
                  isActive ? "ui-seg-item ui-seg-item-on" : "ui-seg-item"
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {login ? (
            <span
              className="hidden items-center gap-2 rounded-full border border-line bg-elevated px-2 py-1 text-[13px] text-ink-soft lg:inline-flex"
              title={login}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                {initial}
              </span>
              <span className="max-w-[10rem] truncate">{login}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="ui-btn-secondary bg-elevated px-3.5"
            onClick={() => void signOut()}
          >
            Выйти
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-elevated text-ink md:hidden"
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
          className="safe-area-x border-t border-line bg-elevated pb-3 pt-1 md:hidden"
        >
          <nav className="flex flex-col" aria-label="Основной раздел">
            {visible.map((l) => (
              <NavLink
                key={l.href}
                to={l.href}
                className={({ isActive }) =>
                  [
                    "rounded-[10px] px-2 py-3 text-base font-medium transition",
                    isActive
                      ? "bg-brand-50 text-brand-800"
                      : "text-ink hover:bg-surface",
                  ].join(" ")
                }
              >
                {l.label}
              </NavLink>
            ))}
            {login ? (
              <p className="mt-1 truncate border-t border-line px-2 py-2.5 text-sm text-muted">
                {login}
              </p>
            ) : null}
          </nav>
        </div>
      ) : null}
      {role === "ADMIN" ? (
        <div className="safe-area-x mx-auto max-w-[96rem] pb-2">
          <div className="flex w-fit max-w-full flex-col gap-1.5 rounded-full border border-line bg-elevated px-2 py-1.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <span className="ui-kicker shrink-0 px-2">Админ</span>
            <nav
              className="ui-seg bg-transparent p-0"
              aria-label="Администрирование"
            >
              {adminNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? "ui-chip-on" : "ui-chip"
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
