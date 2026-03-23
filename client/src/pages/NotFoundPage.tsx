import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24">
      <p className="text-6xl font-bold text-slate-300">404</p>
      <h1 className="mt-4 font-display text-xl font-semibold text-slate-800">
        Страница не найдена
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Проверьте адрес или вернитесь на главную.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        На главную
      </Link>
    </main>
  );
}
