export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <span
        className="grid h-7 w-7 place-items-center rounded-md text-white font-bold text-sm shadow-sm bg-primary"
      >
        T
      </span>
      <span className="text-base font-semibold tracking-tight">
        Team<span className="text-primary">Tasks</span>
      </span>
    </span>
  );
}
