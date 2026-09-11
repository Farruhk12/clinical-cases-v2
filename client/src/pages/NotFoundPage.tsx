import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-4 py-24">
      <p className="font-display text-6xl font-medium text-faint">404</p>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
        Страница не найдена
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Проверьте адрес или вернитесь на главную.
      </p>
      <Link to="/" className="ui-btn-primary mt-6">
        На главную
      </Link>
    </main>
  );
}
