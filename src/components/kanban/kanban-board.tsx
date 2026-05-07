"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskDialog } from "@/components/create-task-dialog";

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "TODO", label: "To Do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "IN_REVIEW", label: "In Review" },
  { id: "ON_HOLD", label: "On Hold" },
  { id: "DONE", label: "Done" },
];

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "ON_HOLD" | "DONE";

export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  position: number;
  startDate: string | Date | null;
  endDate: string | Date | null;
  assignee: { id: string; name: string | null; email: string; image: string | null } | null;
  subtasks: { id: string; title: string; done: boolean }[];
  sprint: { id: string; name: string } | null;
  milestone: { id: string; title: string } | null;
  _count: { comments: number };
};

export type Member = { id: string; name: string | null; email: string; image: string | null };

export function KanbanBoard({
  project,
  members,
  initialTaskId,
}: {
  project: { id: string; tasks: BoardTask[] };
  members: Member[];
  initialTaskId?: string;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(project.tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(initialTaskId ?? null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => setTasks(project.tasks), [project.tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tasksByCol = useMemo(() => {
    const map: Record<TaskStatus, BoardTask[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], ON_HOLD: [], DONE: [] };
    for (const t of tasks) map[t.status].push(t);
    for (const k of Object.keys(map) as TaskStatus[])
      map[k].sort((a, b) => a.position - b.position);
    return map;
  }, [tasks]);

  function findContainer(id: string): TaskStatus | null {
    if ((COLUMNS.map((c) => c.id) as string[]).includes(id)) return id as TaskStatus;
    const t = tasks.find((x) => x.id === id);
    return t ? t.status : null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer) return;

    const movingTask = tasks.find((t) => t.id === active.id);
    if (!movingTask) return;

    let newTasks = [...tasks];
    if (activeContainer === overContainer) {
      const colTasks = newTasks.filter((t) => t.status === activeContainer);
      const oldIndex = colTasks.findIndex((t) => t.id === active.id);
      const newIndex = colTasks.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(colTasks, oldIndex, newIndex);
      newTasks = newTasks.map((t) => {
        if (t.status !== activeContainer) return t;
        const i = reordered.findIndex((r) => r.id === t.id);
        return { ...t, position: i };
      });
    } else {
      newTasks = newTasks.map((t) => (t.id === active.id ? { ...t, status: overContainer } : t));
      const colTasks = newTasks.filter((t) => t.status === overContainer);
      colTasks.sort((a, b) => a.position - b.position);
      newTasks = newTasks.map((t) => {
        if (t.status !== overContainer) return t;
        const i = colTasks.findIndex((c) => c.id === t.id);
        return { ...t, position: i };
      });
    }
    setTasks(newTasks);

    const payload = newTasks
      .filter((t) => t.status === activeContainer || t.status === overContainer)
      .map((t) => ({ id: t.id, status: t.status, position: t.position }));

    const res = await fetch(`/api/projects/${project.id}/tasks/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ updates: payload }),
    });
    if (!res.ok) toast.error("Failed to save order");
  }

  const activeTask = tasks.find((t) => t.id === activeId);

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New task
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto flex-1 min-h-0 pb-4">
          {COLUMNS.map((col) => (
            <KanbanColumn key={col.id} id={col.id} label={col.label} count={tasksByCol[col.id].length}>
              <SortableContext
                items={tasksByCol[col.id].map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {tasksByCol[col.id].map((t) => (
                    <TaskCard key={t.id} task={t} onClick={() => setOpenTaskId(t.id)} />
                  ))}
                </div>
              </SortableContext>
            </KanbanColumn>
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailDrawer
        taskId={openTaskId}
        members={members}
        onClose={() => setOpenTaskId(null)}
      />
      <CreateTaskDialog
        projectId={project.id}
        members={members}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
