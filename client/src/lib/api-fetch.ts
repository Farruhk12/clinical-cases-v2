/** Продакшен: фронт (Vercel) и API (отдельный хост) — полный origin без завершающего слэша, например https://api.example.com */
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

/** Fetch к бэкенду: при внешнем API добавляет credentials для httpOnly-cookie. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: API_BASE
      ? "include"
      : (init?.credentials ?? "same-origin"),
  });
}
