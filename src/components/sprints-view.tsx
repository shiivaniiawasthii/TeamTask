"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatDate, initials, priorityColor, statusLabel } from "@/lib/utils";
import { CreateTaskDialog } from "@/components/create-task-dialog";

type SprintTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  endDate: string | null;
  assignee: { id: string; name: string | null; email: string } | null;
};

type Sprint = {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: string;
  tasks: SprintTask[];
};

type Member = { id: string; name: string | null; email: string; image: string | null };

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-muted text-foreground border-border",
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

export function SprintsView({
  projectId,
  initialSprints,
  members,
}: {
  projectId: string;
  initialSprints: Sprint[];
  members: Member[];
}) {
  const router = useRouter();
  const [sprints, setSprints] = useState<Sprint[]>(initialSprints);
  useEffect(() => setSprints(initialSprints), [initialSprints]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openSprintDialog, setOpenSprintDialog] = useState(false);
  const [taskDialogSprintId, setTaskDialogSprintId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("PLANNED");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  function startEdit(s: Sprint) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditGoal(s.goal ?? "");
    setEditStartDate(s.startDate.slice(0, 10));
    setEditEndDate(s.endDate.slice(0, 10));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const res = await fetch(`/api/projects/${projectId}/sprints/${editingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: editName,
        goal: editGoal || null,
        startDate: editStartDate,
        endDate: editEndDate,
      }),
    });
    if (!res.ok) return toast.error("Failed to save");
    const updated = await res.json();
    setSprints(
      sprints.map((s) =>
        s.id === editingId
          ? {
              ...s,
              name: updated.name,
              goal: updated.goal,
              startDate: updated.startDate,
              endDate: updated.endDate,
            }
          : s,
      ),
    );
    setEditingId(null);
    router.refresh();
  }

  function toggle(id: string) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  async function createSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !startDate || !endDate) {
      toast.error("Name, start, and end date required");
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, goal: goal || undefined, startDate, endDate, status }),
    });
    if (!res.ok) return toast.error("Failed to create sprint");
    toast.success(`Sprint "${name}" created`);
    const created = await res.json();
    setSprints([...sprints, { ...created, tasks: [] }]);
    setOpenSprintDialog(false);
    setName("");
    setGoal("");
    setStartDate("");
    setEndDate("");
    setStatus("PLANNED");
    router.refresh();
  }

  async function updateStatus(id: string, newStatus: string) {
    const res = await fetch(`/api/projects/${projectId}/sprints/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) return toast.error("Failed");
    setSprints(sprints.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  }

  async function deleteSprint(id: string) {
    if (!confirm("Delete this sprint? Tasks won't be deleted but will lose their sprint link."))
      return;
    const res = await fetch(`/api/projects/${projectId}/sprints/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return toast.error("Failed");
    setSprints(sprints.filter((s) => s.id !== id));
    router.refresh();
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-indigo-500" /> Sprints
        </h2>
        <Button onClick={() => setOpenSprintDialog(true)}>
          <Plus className="h-4 w-4" /> New sprint
        </Button>
      </div>

      {sprints.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md bg-card">
          No sprints yet. Create one to start planning iterations.
        </p>
      ) : (
        <div className="space-y-3">
          {sprints.map((s) => {
            const isCollapsed = collapsed[s.id];
            const completed = s.tasks.filter((t) => t.status === "DONE").length;
            const pct =
              s.tasks.length === 0 ? 0 : Math.round((completed / s.tasks.length) * 100);
            return (
              <section
                key={s.id}
                className="rounded-md border bg-card overflow-hidden"
              >
                <header className="flex items-start justify-between gap-3 p-4">
                  <button
                    onClick={() => toggle(s.id)}
                    className="flex items-start gap-2 text-left flex-1 min-w-0"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold">{s.name}</h3>
                        <Badge className={cn("border", STATUS_COLORS[s.status])}>
                          {s.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {s.tasks.length} {s.tasks.length === 1 ? "task" : "tasks"}
                        </span>
                      </div>
                      {s.goal && (
                        <p className="text-sm text-muted-foreground mt-1">{s.goal}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <CalendarRange className="h-3.5 w-3.5" />
                        {formatDate(s.startDate)} → {formatDate(s.endDate)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={s.status} onValueChange={(v) => updateStatus(s.id, v)}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PLANNED">Planned</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => startEdit(s)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label="Edit sprint"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteSprint(s.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="Delete sprint"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {completed}/{s.tasks.length} done
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="border-t">
                    {s.tasks.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground italic">
                        No tasks in this sprint yet.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                          <tr>
                            <th className="px-4 py-2 font-normal">Task</th>
                            <th className="px-3 py-2 font-normal">Status</th>
                            <th className="px-3 py-2 font-normal">Priority</th>
                            <th className="px-3 py-2 font-normal">Due</th>
                            <th className="px-3 py-2 font-normal">Assignee</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.tasks.map((t) => {
                            const overdue =
                              t.endDate &&
                              new Date(t.endDate) < new Date() &&
                              t.status !== "DONE";
                            return (
                              <tr key={t.id} className="border-b last:border-b-0 hover:bg-muted/40">
                                <td className="px-4 py-2 font-medium">{t.title}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {statusLabel(t.status)}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge className={priorityColor(t.priority)}>
                                    {t.priority}
                                  </Badge>
                                </td>
                                <td
                                  className={cn(
                                    "px-3 py-2 text-muted-foreground",
                                    overdue && "text-destructive font-medium",
                                  )}
                                >
                                  {formatDate(t.endDate)}
                                </td>
                                <td className="px-3 py-2">
                                  {t.assignee ? (
                                    <span className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarFallback>
                                          {initials(t.assignee.name, t.assignee.email)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span>{t.assignee.name ?? t.assignee.email}</span>
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <button
                      onClick={() => setTaskDialogSprintId(s.id)}
                      className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 border-t flex items-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <CreateTaskDialog
        projectId={projectId}
        members={members}
        open={taskDialogSprintId !== null}
        onOpenChange={(v) => !v && setTaskDialogSprintId(null)}
        defaultSprintId={taskDialogSprintId}
      />

      <Dialog open={editingId !== null} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit sprint</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Textarea
                rows={2}
                value={editGoal}
                onChange={(e) => setEditGoal(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openSprintDialog} onOpenChange={setOpenSprintDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New sprint</DialogTitle>
          </DialogHeader>
          <form onSubmit={createSprint} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Textarea
                rows={2}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What we want to achieve in this sprint"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNED">Planned</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit">Create sprint</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
