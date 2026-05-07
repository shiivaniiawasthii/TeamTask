"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function KanbanColumn({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 shrink-0 bg-slate-100 rounded-md p-2",
        isOver && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between px-2 py-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex-1 min-h-[40px]">{children}</div>
    </div>
  );
}
