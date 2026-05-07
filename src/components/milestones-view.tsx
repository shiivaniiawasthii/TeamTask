"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Plus, Trash2, Calendar } from "lucide-react";
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
import { cn, formatDate } from "@/lib/utils";

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  tasks: { id: string; title: string; status: string }[];
};

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-amber-100 text-amber-700 border-amber-200",
  REACHED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MISSED: "bg-red-100 text-red-700 border-red-200",
};

export function MilestonesView({
  projectId,
  initialMilestones,
}: {
  projectId: string;
  initialMilestones: Milestone[];
}) {
  const router = useRouter();
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, description: description || undefined, dueDate: dueDate || null }),
    });
    if (!res.ok) return toast.error("Failed to create milestone");
    const created = await res.json();
    setMilestones([...milestones, { ...created, tasks: [] }]);
    setOpen(false);
    setTitle("");
    setDescription("");
    setDueDate("");
    router.refresh();
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/milestones/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return toast.error("Failed");
    setMilestones(milestones.map((m) => (m.id === id ? { ...m, status } : m)));
  }

  async function remove(id: string) {
    if (!confirm("Delete this milestone?")) return;
    const res = await fetch(`/api/projects/${projectId}/milestones/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return toast.error("Failed");
    setMilestones(milestones.filter((m) => m.id !== id));
    router.refresh();
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Flag className="h-5 w-5 text-amber-500" /> Milestones
        </h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New milestone
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md bg-white">
          No milestones yet. Define key checkpoints for this project.
        </p>
      ) : (
        <ul className="grid gap-3">
          {milestones.map((m) => {
            const total = m.tasks.length;
            const done = m.tasks.filter((t) => t.status === "DONE").length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const overdue =
              m.dueDate && m.status === "UPCOMING" && new Date(m.dueDate) < new Date();
            return (
              <li key={m.id} className="rounded-md border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{m.title}</h3>
                      <Badge className={cn("border", STATUS_COLORS[m.status])}>
                        {m.status}
                      </Badge>
                      {overdue && (
                        <Badge className="border bg-red-50 text-red-700 border-red-200">
                          overdue
                        </Badge>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
                    )}
                    {m.dueDate && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Due {formatDate(m.dueDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={m.status} onValueChange={(v) => updateStatus(m.id, v)}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPCOMING">Upcoming</SelectItem>
                        <SelectItem value="REACHED">Reached</SelectItem>
                        <SelectItem value="MISSED">Missed</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => remove(m.id)}
                      className="text-muted-foreground hover:text-red-600 p-1"
                      aria-label="Delete milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {total > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{done}/{total} linked tasks done</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New milestone</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit">Create milestone</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
