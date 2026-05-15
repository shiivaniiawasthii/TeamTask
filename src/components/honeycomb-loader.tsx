/**
 * Bee-themed loading state.
 *
 * Used by Next.js loading.tsx files — it renders instantly when the user
 * clicks a link, while the real server component fetches in the background.
 *
 * 6 hexagons "waving" in sequence (looks like bees buzzing across honeycomb).
 * Color is hardcoded to honey-amber so it reads as bee-themed regardless of
 * the active app theme.
 */
export function HoneycombLoader({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[40vh] gap-5 ${className ?? ""}`}
    >
      <div className="honeycomb-loader" aria-label="Loading">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="text-sm text-muted-foreground">
        {message ?? "Buzzing through the hive…"}
      </p>
    </div>
  );
}
