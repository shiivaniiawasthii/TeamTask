import { cn } from "@/lib/utils";

/**
 * WorkHive bee mascot.
 *
 * Inline SVG + Tailwind animation classes. No JS runtime, no extra HTTP
 * requests. The wings each animate with their own keyframe at a tight
 * interval so they read as "flapping"; the whole bee separately bobs via
 * bee-float. Disable via `animated={false}` for static icon uses.
 *
 * Variants:
 *   - <Bee size={48} />            inline static icon (header / empty state)
 *   - <Bee size={48} animated />   flapping + bobbing
 *   - <Bee floating />             also gently drifts horizontally (corners)
 *
 * Performance: only `transform` is animated (compositor-only) and there are
 * never more than ~4 instances on a page in our usages, so total cost is
 * negligible. Respects prefers-reduced-motion via media query below.
 */
export function Bee({
  size = 40,
  className,
  animated = true,
  floating = false,
  style,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
  floating?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-block align-middle motion-reduce:animate-none",
        animated && "animate-bee-float",
        floating && "animate-bee-drift",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Wings — back wing first so the front overlaps it. */}
        <g
          className={cn(
            "origin-[50%_30%]",
            animated && "motion-safe:animate-wing-flap",
          )}
          style={{ transformBox: "fill-box" }}
        >
          <ellipse cx="22" cy="22" rx="10" ry="6" fill="#dbeafe" opacity="0.85" />
          <ellipse cx="22" cy="22" rx="10" ry="6" fill="none" stroke="#1e3a8a" strokeWidth="1" opacity="0.4" />
        </g>
        <g
          className={cn(
            "origin-[50%_30%]",
            animated && "motion-safe:animate-wing-flap",
          )}
          style={{ transformBox: "fill-box", animationDelay: "55ms" }}
        >
          <ellipse cx="42" cy="22" rx="10" ry="6" fill="#dbeafe" opacity="0.85" />
          <ellipse cx="42" cy="22" rx="10" ry="6" fill="none" stroke="#1e3a8a" strokeWidth="1" opacity="0.4" />
        </g>

        {/* Body */}
        <ellipse cx="32" cy="38" rx="16" ry="13" fill="#fbbf24" />
        {/* Stripes */}
        <path
          d="M22 32 Q32 28 42 32 L42 36 Q32 32 22 36 Z"
          fill="#1f2937"
        />
        <path
          d="M22 42 Q32 38 42 42 L42 46 Q32 42 22 46 Z"
          fill="#1f2937"
        />
        {/* Head */}
        <circle cx="48" cy="34" r="6" fill="#1f2937" />
        {/* Eye */}
        <circle cx="49" cy="33" r="1.4" fill="#fff" />
        {/* Antennae */}
        <path
          d="M49 28 Q51 22 54 22"
          stroke="#1f2937"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="54.2" cy="22" r="1.4" fill="#fbbf24" />
        {/* Stinger */}
        <path d="M16 38 L12 36 L16 35 Z" fill="#1f2937" />
      </svg>
    </span>
  );
}

/**
 * Decorative cluster of bees for hero areas. Three bees with staggered
 * positions and animation delays so they don't read as identical.
 * Stays absolutely positioned inside a relative parent.
 */
export function BeeCluster({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none select-none", className)}
      aria-hidden="true"
    >
      <Bee
        size={48}
        animated={false}
        className="absolute top-2 right-4"
      />
      <Bee
        size={32}
        animated={false}
        className="absolute top-12 right-20"
      />
      <Bee
        size={24}
        animated={false}
        className="absolute top-6 right-32 opacity-70"
      />
    </div>
  );
}
