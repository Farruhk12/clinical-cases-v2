import { BrainLoader } from "./BrainLoader";

/**
 * Полноэкранная модалка ожидания с анимацией «заполнения мозга» —
 * показывается поверх всего интерфейса на время любого запроса к серверу.
 */
export function LoadingOverlay({
  label = "Обработка…",
}: {
  label?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--color-canvas)]/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <BrainLoader className="h-20 w-20" />
      <p className="text-sm font-medium text-ink-soft">{label}</p>
    </div>
  );
}
