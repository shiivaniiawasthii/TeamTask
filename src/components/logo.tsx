export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <span
        className="grid h-7 w-7 place-items-center rounded-md text-white font-bold text-sm shadow-sm"
        style={{
          background: "linear-gradient(135deg, #E35336 0%, #F4A460 100%)",
        }}
      >
        T
      </span>
      <span className="text-base font-semibold tracking-tight">
        Team<span style={{ color: "#E35336" }}>Tasks</span>
      </span>
    </span>
  );
}
