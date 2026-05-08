"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Trash2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { initials, formatDate } from "@/lib/utils";

type Member = { id: string; name: string | null; email: string; image: string | null };

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "ON_HOLD" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  startDate: string | null;
  endDate: string | null;
  assignee: Member | null;
  creator: Member;
  subtasks: { id: string; title: string; done: boolean; position: number }[];
  sprint: { id: string; name: string } | null;
  milestone: { id: string; title: string } | null;
  comments: {
    id: string;
    body: string;
    source: string;
    createdAt: string;
    authorEmail: string | null;
    author: Member | null;
  }[];
  project: { id: string; key: string; name: string };
};

type SprintOpt = { id: string; name: string };
type MilestoneOpt = { id: string; title: string };

export function TaskDetailDrawer({
  taskId,
  members,
  onClose,
}: {
  taskId: string | null;
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [sprints, setSprints] = useState<SprintOpt[]>([]);
  const [milestones, setMilestones] = useState<MilestoneOpt[]>([]);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    setLoading(true);
    fetch(`/api/tasks/${taskId}`)
      .then((r) => r.json())
      .then((d) => {
        setTask(d);
        if (d?.project?.id) {
          fetch(`/api/projects/${d.project.id}/sprints`)
            .then((r) => (r.ok ? r.json() : []))
            .then(setSprints)
            .catch(() => setSprints([]));
          fetch(`/api/projects/${d.project.id}/milestones`)
            .then((r) => (r.ok ? r.json() : []))
            .then(setMilestones)
            .catch(() => setMilestones([]));
        }
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  async function patch(data: Partial<TaskDetail> & Record<string, any>) {
    if (!task) return;
    const wasDone = task.status === "DONE";
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      toast.error("Save failed");
      return;
    }
    const updated = await res.json();
    setTask((prev) => (prev ? { ...prev, ...updated } : prev));
    if (!wasDone && updated.status === "DONE") {
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

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !newSub.trim()) return;
    const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newSub }),
    });
    if (!res.ok) return toast.error("Failed");
    const sub = await res.json();
    setTask({ ...task, subtasks: [...task.subtasks, sub] });
    setNewSub("");
  }

  async function toggleSub(id: string, done: boolean) {
    if (!task) return;
    const res = await fetch(`/api/subtasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) return;
    setTask({
      ...task,
      subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, done } : s)),
    });
  }

  async function deleteSub(id: string) {
    if (!task) return;
    await fetch(`/api/subtasks/${id}`, { method: "DELETE" });
    setTask({ ...task, subtasks: task.subtasks.filter((s) => s.id !== id) });
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !newComment.trim()) return;
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: newComment }),
    });
    if (!res.ok) return toast.error("Failed");
    const c = await res.json();
    setTask({ ...task, comments: [...task.comments, c] });
    setNewComment("");
  }

  async function deleteTask() {
    if (!task) return;
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed");
    onClose();
    router.refresh();
  }

  const open = Boolean(taskId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent side="right" className="max-w-2xl">
        <DialogTitle className="sr-only">Task details</DialogTitle>
        {loading || !task ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground">
                {task.project.key} · created by {task.creator.name ?? task.creator.email}
              </p>
              <input
                className="mt-1 w-full text-2xl font-semibold bg-transparent focus:outline-none"
                value={task.title}
                onChange={(e) =>
                  setTask((p) => (p ? { ...p, title: e.target.value } : p))
                }
                onBlur={(e) => patch({ title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={task.status}
                  onValueChange={(v) => patch({ status: v as TaskDetail["status"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">To Do</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="IN_REVIEW">In Review</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={task.priority}
                  onValueChange={(v) => patch({ priority: v as TaskDetail["priority"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Assignee</Label>
                <Select
                  value={task.assignee?.id ?? "__unassigned"}
                  onValueChange={(v) => patch({ assigneeId: v === "__unassigned" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name ?? m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={task.startDate ? task.startDate.slice(0, 10) : ""}
                  onChange={(e) => patch({ startDate: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={task.endDate ? task.endDate.slice(0, 10) : ""}
                  onChange={(e) => patch({ endDate: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label>Sprint</Label>
                <Select
                  value={task.sprint?.id ?? "__none"}
                  onValueChange={(v) => patch({ sprintId: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="No sprint" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No sprint</SelectItem>
                    {sprints.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Milestone</Label>
                <Select
                  value={task.milestone?.id ?? "__none"}
                  onValueChange={(v) => patch({ milestoneId: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="No milestone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No milestone</SelectItem>
                    {milestones.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={task.description ?? ""}
                onChange={(e) =>
                  setTask((p) => (p ? { ...p, description: e.target.value } : p))
                }
                onBlur={(e) => patch({ description: e.target.value })}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Subtasks</Label>
              <ul className="space-y-1">
                {task.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 group">
                    <Checkbox
                      checked={s.done}
                      onCheckedChange={(v) => toggleSub(s.id, Boolean(v))}
                    />
                    <span
                      className={
                        s.done ? "line-through text-muted-foreground text-sm" : "text-sm"
                      }
                    >
                      {s.title}
                    </span>
                    <button
                      onClick={() => deleteSub(s.id)}
                      className="ml-auto text-muted-foreground opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={addSubtask} className="flex gap-2 pt-1">
                <Input
                  placeholder="Add a subtask"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                />
                <Button type="submit" size="sm" variant="secondary">
                  Add
                </Button>
              </form>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Comments</Label>
              <ul className="space-y-3">
                {task.comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback>
                        {initials(c.author?.name ?? c.authorEmail, c.author?.email ?? c.authorEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {c.author?.name ?? c.author?.email ?? c.authorEmail ?? "Unknown"}
                        </span>{" "}
                        · {formatDate(c.createdAt)}
                        {c.source === "email" && (
                          <span className="ml-1 rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[10px]">
                            via email
                          </span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={addComment} className="flex gap-2">
                <Input
                  placeholder="Write a comment…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <Button type="submit" size="icon" variant="secondary">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                Tip: members can also reply to notification emails to add a comment here.
              </p>
            </div>

            <Separator />
            <div className="flex justify-end">
              <Button variant="destructive" size="sm" onClick={deleteTask}>
                <Trash2 className="h-4 w-4" /> Delete task
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
