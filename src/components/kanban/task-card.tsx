"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, MessageSquare, CheckSquare, Flag, Zap } from "lucide-react";
import type { BoardTask } from "./kanban-board";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, initials, priorityColor } from "@/lib/utils";

export function TaskCard({
  task,
  dragging,
  onClick,
}: {
  task: BoardTask;
  dragging?: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const completedSubs = task.subtasks.filter((s) => s.done).length;
  const overdue = task.endDate && new Date(task.endDate) < new Date() && task.status !== "DONE";
  const subProgressPct =
    task.subtasks.length === 0 ? 0 : Math.round((completedSubs / task.subtasks.length) * 100);
  const visibleSubs = task.subtasks.slice(0, 3);
  const remainingSubs = task.subtasks.length - visibleSubs.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "rounded-md border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing",
        (isDragging || dragging) && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug line-clamp-3">{task.title}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge className={priorityColor(task.priority)}>{task.priority}</Badge>
        {task.endDate && (
          <Badge
            className={cn(
              "border bg-white text-foreground",
              overdue && "border-red-300 bg-red-50 text-red-700",
            )}
          >
            <CalendarDays className="h-3 w-3 mr-1" />
            {formatDate(task.endDate)}
          </Badge>
        )}
        {(task.startDate || task.endDate) && (
          <Badge className="border bg-white text-muted-foreground text-[10px]">
            {task.startDate ? formatDate(task.startDate) : "—"} →{" "}
            {task.endDate ? formatDate(task.endDate) : "—"}
          </Badge>
        )}
        {task.sprint && (
          <Badge className="border bg-indigo-50 text-indigo-700 border-indigo-200">
            <Zap className="h-3 w-3 mr-1" />
            {task.sprint.name}
          </Badge>
        )}
        {task.milestone && (
          <Badge className="border bg-amber-50 text-amber-700 border-amber-200">
            <Flag className="h-3 w-3 mr-1" />
            {task.milestone.title}
          </Badge>
        )}
      </div>

      {task.subtasks.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>
              {completedSubs}/{task.subtasks.length} subtasks
            </span>
            <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${subProgressPct}%` }}
              />
            </div>
          </div>
          <ul className="space-y-0.5 text-[11px]">
            {visibleSubs.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-1.5 truncate",
                  s.done && "text-muted-foreground line-through",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2.5 w-2.5 rounded-sm border",
                    s.done
                      ? "bg-emerald-500 border-emerald-500"
                      : "bg-white border-slate-300",
                  )}
                />
                <span className="truncate">{s.title}</span>
              </li>
            ))}
            {remainingSubs > 0 && (
              <li className="text-[11px] text-muted-foreground pl-4">
                +{remainingSubs} more
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task._count.comments > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {task._count.comments}
            </span>
          )}
        </div>
        {task.assignee && (
          <Avatar className="h-6 w-6">
            <AvatarFallback>{initials(task.assignee.name, task.assignee.email)}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
