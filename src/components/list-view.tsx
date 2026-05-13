"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn, initials, priorityColor } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "ON_HOLD" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  assignee: { id: string; name: string | null; email: string } | null;
  sprint: { id: string; name: string } | null;
  milestone: { id: string; title: string } | null;
  _count: { comments: number; subtasks: number };
};

type Member = { id: string; name: string | null; email: string; image: string | null };

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const NO_SPRINT = "__nosprint";

type Pagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export function ListView({
  projectId,
  currentUserId,
  initialTasks,
  members,
  pagination,
}: {
  projectId: string;
  currentUserId: string;
  initialTasks: Task[];
  members: Member[];
  pagination?: Pagination;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  useEffect(() => setTasks(initialTasks), [initialTasks]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterAssignee, setFilterAssignee] = useState<string>("ALL");
  const [onlyMine, setOnlyMine] = useState(false);
  const [groupBy, setGroupBy] = useState<"sprint" | "none">("sprint");
  const [sortBy, setSortBy] = useState<"created" | "due" | "priority" | "title">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [taskDialogSprintId, setTaskDialogSprintId] = useState<string | null | undefined>(undefined);

  async function patchTask(id: string, data: Record<string, any>) {
    const prev = tasks;
    const before = prev.find((t) => t.id === id);
    if (!before) return;

    setTasks((cur) =>
      cur.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...data } as Task;
        if ("assigneeId" in data) {
          if (data.assigneeId) {
            const m = members.find((mem) => mem.id === data.assigneeId);
            next.assignee = m ? { id: m.id, name: m.name, email: m.email } : t.assignee;
          } else {
            next.assignee = null;
          }
        }
        return next;
      }),
    );

    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      setTasks(prev);
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Save failed");
      return;
    }

    if (before.status !== "DONE" && data.status === "DONE") {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.7 },
        colors: ["#7c2d77", "#a8418a", "#c769b8", "#e9d3e3", "#ffd1eb"],
      });
      toast.success("🎉 Task complete — nice work!");
    }
    router.refresh();
  }

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (search.trim())
      list = list.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus !== "ALL") list = list.filter((t) => t.status === filterStatus);
    if (filterPriority !== "ALL") list = list.filter((t) => t.priority === filterPriority);
    if (filterAssignee !== "ALL")
      list = list.filter((t) =>
        filterAssignee === "__unassigned" ? !t.assignee : t.assignee?.id === filterAssignee,
      );
    if (onlyMine) list = list.filter((t) => t.assignee?.id === currentUserId);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") cmp = a.title.localeCompare(b.title);
      else if (sortBy === "priority")
        cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      else if (sortBy === "due") {
        const ad = a.endDate ? new Date(a.endDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.endDate ? new Date(b.endDate).getTime() : Number.MAX_SAFE_INTEGER;
        cmp = ad - bd;
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [tasks, search, filterStatus, filterPriority, filterAssignee, onlyMine, currentUserId, sortBy, sortDir]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, { name: string; sprintId: string | null; tasks: Task[] }>();
    const order: string[] = [];
    for (const t of filtered) {
      const key = t.sprint?.id ?? NO_SPRINT;
      if (!map.has(key)) {
        map.set(key, {
          name: t.sprint?.name ?? "No sprint",
          sprintId: t.sprint?.id ?? null,
          tasks: [],
        });
        order.push(key);
      }
      map.get(key)!.tasks.push(t);
    }
    const reorder = order.filter((k) => k !== NO_SPRINT);
    if (order.includes(NO_SPRINT)) reorder.push(NO_SPRINT);
    return reorder.map((k) => ({ key: k, ...map.get(k)! }));
  }, [filtered, groupBy]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="TODO">To Do</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="IN_REVIEW">In Review</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="DONE">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All assignees</SelectItem>
            <SelectItem value="__unassigned">Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name ?? m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "sprint" | "none")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sprint">Group by sprint</SelectItem>
            <SelectItem value="none">No grouping</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={() => setOnlyMine((v) => !v)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm border transition-all",
            onlyMine
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-card hover:bg-accent/30 border-border",
          )}
        >
          Just my tasks
        </button>
      </div>

      {grouped ? (
        <div className="space-y-3">
          {grouped.length === 0 && (
            <div className="text-center py-12 border rounded-md bg-card space-y-3">
              <p className="text-sm text-muted-foreground">
                {tasks.length === 0
                  ? "No tasks yet."
                  : "No tasks match your filters."}
              </p>
              <button
                onClick={() => setTaskDialogSprintId(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 transition"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            </div>
          )}
          {grouped.map((g) => {
            const isCollapsed = collapsed[g.key];
            return (
              <section
                key={g.key}
                className="rounded-md border bg-card overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(g.key)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/40 border-b"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.tasks.length} {g.tasks.length === 1 ? "task" : "tasks"}
                  </span>
                </button>
                {!isCollapsed && (
                  <>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <Th onClick={() => toggleSort("title")}>Title</Th>
                          <Th onClick={() => toggleSort("priority")}>Priority</Th>
                          <th className="px-3 py-2">Status</th>
                          <Th onClick={() => toggleSort("due")}>Due</Th>
                          <th className="px-3 py-2">Milestone</th>
                          <th className="px-3 py-2">Assignee</th>
                          <th className="px-3 py-2">Subs</th>
                          <th className="px-3 py-2">Cmts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.tasks.map((t) => (
                          <TaskRow
                            key={t.id}
                            t={t}
                            members={members}
                            onClick={() => setOpenTaskId(t.id)}
                            onPatch={patchTask}
                          />
                        ))}
                      </tbody>
                    </table>
                    <button
                      onClick={() => setTaskDialogSprintId(g.sprintId)}
                      className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 border-t flex items-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </button>
                  </>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <Th onClick={() => toggleSort("title")}>Title</Th>
                <Th onClick={() => toggleSort("priority")}>Priority</Th>
                <th className="px-3 py-2">Status</th>
                <Th onClick={() => toggleSort("due")}>Due</Th>
                <th className="px-3 py-2">Sprint</th>
                <th className="px-3 py-2">Milestone</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Subs</th>
                <th className="px-3 py-2">Cmts</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  showSprint
                  members={members}
                  onClick={() => setOpenTaskId(t.id)}
                  onPatch={patchTask}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {tasks.length === 0
                        ? "No tasks yet."
                        : "No tasks match your filters."}
                    </p>
                    <button
                      onClick={() => setTaskDialogSprintId(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (
        <PaginationBar projectId={projectId} pagination={pagination} />
      )}

      <TaskDetailDrawer
        taskId={openTaskId}
        members={members}
        onClose={() => setOpenTaskId(null)}
      />

      <CreateTaskDialog
        projectId={projectId}
        members={members}
        open={taskDialogSprintId !== undefined}
        onOpenChange={(v) => !v && setTaskDialogSprintId(undefined)}
        defaultSprintId={taskDialogSprintId ?? null}
      />
    </div>
  );
}

// Pagination footer — page size selector + prev/next + total record count.
// State lives in the URL (?page=&pageSize=), so the server component re-fetches
// the correct slice on navigation. No client-side data caching needed.
function PaginationBar({
  projectId,
  pagination,
}: {
  projectId: string;
  pagination: Pagination;
}) {
  const router = useRouter();
  const { page, pageSize, totalCount, totalPages } = pagination;
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  function go(nextPage: number, nextSize: number = pageSize) {
    const safePage = Math.min(Math.max(1, nextPage), Math.max(1, totalPages));
    router.push(
      `/projects/${projectId}/list?page=${safePage}&pageSize=${nextSize}`,
    );
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 text-sm pt-2">
      <p className="text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}–{end}</span>{" "}
        of <span className="font-medium text-foreground">{totalCount}</span> tasks
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-muted-foreground">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => go(1, Number(e.target.value))}
            className="border rounded-md bg-card px-2 py-1 text-sm"
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            className="px-2 py-1 border rounded-md disabled:opacity-40 hover:bg-muted/40"
          >
            Prev
          </button>
          <span className="px-2 text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => go(page + 1)}
            disabled={page >= totalPages}
            className="px-2 py-1 border rounded-md disabled:opacity-40 hover:bg-muted/40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  t,
  showSprint,
  members,
  onClick,
  onPatch,
}: {
  t: Task;
  showSprint?: boolean;
  members: Member[];
  onClick: () => void;
  onPatch: (id: string, data: Record<string, any>) => Promise<void>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(t.title);
  const overdue =
    t.endDate && new Date(t.endDate) < new Date() && t.status !== "DONE";

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  async function commitTitle() {
    setEditingTitle(false);
    const v = titleDraft.trim();
    if (v && v !== t.title) await onPatch(t.id, { title: v });
    else setTitleDraft(t.title);
  }

  return (
    <tr
      className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td
        className="px-3 py-2 font-medium"
        onDoubleClick={(e) => {
          stop(e);
          setEditingTitle(true);
        }}
        title="Double-click to rename"
      >
        {editingTitle ? (
          <Input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setEditingTitle(false);
                setTitleDraft(t.title);
              }
              stop(e);
            }}
            onClick={stop}
            className="h-8 text-sm"
          />
        ) : (
          t.title
        )}
      </td>
      <td className="px-3 py-2" onClick={stop}>
        <Select value={t.priority} onValueChange={(v) => onPatch(t.id, { priority: v })}>
          <SelectTrigger className="h-7 w-28 text-xs border-0 px-2">
            <Badge className={priorityColor(t.priority)}>{t.priority}</Badge>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2" onClick={stop}>
        <Select value={t.status} onValueChange={(v) => onPatch(t.id, { status: v })}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODO">To Do</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="IN_REVIEW">In Review</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="DONE">Done</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td
        className={cn("px-3 py-2", overdue && "text-destructive font-medium")}
        onClick={stop}
      >
        <Input
          type="date"
          value={t.endDate ? t.endDate.slice(0, 10) : ""}
          onChange={(e) => onPatch(t.id, { endDate: e.target.value || null })}
          className="h-7 text-xs w-36"
        />
      </td>
      {showSprint && (
        <td className="px-3 py-2 text-muted-foreground">
          {t.sprint ? t.sprint.name : "—"}
        </td>
      )}
      <td className="px-3 py-2 text-muted-foreground">
        {t.milestone ? t.milestone.title : "—"}
      </td>
      <td className="px-3 py-2" onClick={stop}>
        <Select
          value={t.assignee?.id ?? "__unassigned"}
          onValueChange={(v) =>
            onPatch(t.id, { assigneeId: v === "__unassigned" ? null : v })
          }
        >
          <SelectTrigger className="h-7 w-44 text-xs">
            {t.assignee ? (
              <span className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[10px]">
                    {initials(t.assignee.name, t.assignee.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {t.assignee.name ?? t.assignee.email}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassigned">Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name ?? m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{t._count.subtasks}</td>
      <td className="px-3 py-2 text-muted-foreground">{t._count.comments}</td>
    </tr>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th
      className="px-3 py-2 select-none cursor-pointer"
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </th>
  );
}
