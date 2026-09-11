export function PageLoader() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 py-24"
      role="status"
      aria-live="polite"
    >
      <div
        className="h-9 w-9 rounded-full border-2 border-line border-t-brand-600 motion-safe:animate-[spin_0.8s_linear_infinite]"
        aria-hidden
      />
      <p className="text-sm font-medium text-muted">Загрузка</p>
    </div>
  );
}
