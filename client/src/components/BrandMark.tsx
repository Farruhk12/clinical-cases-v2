export function BrandMark({
  className = "h-9 w-9",
}: {
  className?: string;
}) {
  return (
    <img
      src="/avicenna-crest.png"
      alt=""
      width={36}
      height={36}
      className={`shrink-0 object-contain mix-blend-multiply ${className}`}
    />
  );
}
