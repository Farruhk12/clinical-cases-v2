import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth-context";
import { PageLoader } from "@/components/PageLoader";
import { BrandMark } from "@/components/BrandMark";
import { IconBook, IconClipboard } from "@/components/icons";

export function HomePage() {
  const { user, loading } = useAuth();

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

  return (
    <main id="main" className="relative flex flex-1 flex-col">
      <header className="isolate border-b border-line bg-white">
        <div className="safe-area-x mx-auto flex w-full max-w-6xl items-center justify-between py-4">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
            <BrandMark className="h-10 w-10" />
            Клинические кейсы
          </div>
          <Link to="/login" className="ui-btn-primary">
            Войти
          </Link>
        </div>
      </header>

      <section className="safe-area-x mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-20 lg:py-16">
        <div className="motion-safe:animate-fade-up">
          <p className="ui-kicker mb-5">Для преподавателей медицины</p>
          <h1 className="max-w-[16ch] font-display text-[2.15rem] font-medium leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
            Разбор клинических кейсов. Этапами, в группе.
          </h1>
          <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-ink-soft sm:text-lg">
            Собирайте сценарии, ведите занятия и смотрите, как группа проходит
            этапы: гипотезы, вопросы, итоговый анализ.
          </p>
          <div className="mt-9">
            <Link to="/login" className="ui-btn-primary px-6 py-3">
              Войти в систему
            </Link>
          </div>
        </div>

        <div className="grid gap-3 motion-safe:animate-fade-up motion-safe:[animation-delay:80ms]">
          <article className="ui-card p-6 sm:p-7">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
              <IconBook className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              Кейсы и этапы
            </h2>
            <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-ink-soft">
              Блоки, эталон для ИИ и роли в диалоге. Материал держится в одной
              структуре.
            </p>
          </article>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="ui-card p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-surface text-brand-700">
                <IconClipboard className="h-5 w-5" />
              </div>
              <h2 className="font-semibold tracking-tight text-ink">Занятия</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Запуск группы, гипотезы по этапам, итог.
              </p>
            </article>
            <article className="ui-card bg-brand p-5 text-[var(--color-on-action)]">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/55">
                Аналитика
              </p>
              <p className="mt-3 font-display text-3xl font-medium tracking-tight">
                По кафедрам
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Занятия, группы и оценки в одном срезе.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
