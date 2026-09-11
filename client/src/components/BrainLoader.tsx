/**
 * Контур мозга (вид сбоку), заливаемый цветом снизу вверх в цикле —
 * используется как индикатор ожидания в LoadingOverlay.
 */
export function BrainLoader({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg
      className={`brain-loader ${className}`}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id="brain-loader-clip">
          <path d="M50 12c-7 0-13 3-17 8-6-1-12 2-15 8-3 5-3 11 0 16-3 4-4 10-1 15 2 4 6 7 10 8 1 5 5 9 10 10 4 6 11 9 18 8 4 3 9 4 14 3 5-1 9-4 12-8 5 0 10-3 12-8 2-4 2-9-1-13 3-5 3-11 0-16-2-4-6-6-10-7 -1-6-5-11-11-13-3-6-9-10-16-11-2 0-3-1-5-0Z" />
        </clipPath>
      </defs>

      <path
        className="brain-loader-outline"
        d="M50 12c-7 0-13 3-17 8-6-1-12 2-15 8-3 5-3 11 0 16-3 4-4 10-1 15 2 4 6 7 10 8 1 5 5 9 10 10 4 6 11 9 18 8 4 3 9 4 14 3 5-1 9-4 12-8 5 0 10-3 12-8 2-4 2-9-1-13 3-5 3-11 0-16-2-4-6-6-10-7 -1-6-5-11-11-13-3-6-9-10-16-11-2 0-3-1-5-0Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      <g clipPath="url(#brain-loader-clip)">
        <rect className="brain-loader-fill" x="0" y="0" width="100" height="100" fill="currentColor" />
      </g>

      <g className="brain-loader-outline" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <path d="M50 20c0 8 0 45 0 62" />
        <path d="M38 24c3 6 3 14 -2 19c-4 4 -4 10 0 14" />
        <path d="M62 24c-3 6 -3 14 2 19c4 4 4 10 0 14" />
        <path d="M27 40c5 2 8 7 7 12" />
        <path d="M73 40c-5 2 -8 7 -7 12" />
      </g>
    </svg>
  );
}
