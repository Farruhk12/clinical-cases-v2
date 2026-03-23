/** Относительные URL — на Vercel и локально тот же origin для `/api`. */
export function apiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: init?.credentials ?? "same-origin",
  });
}
