"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Pencil, Save, X } from "lucide-react";
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
import { formatDate } from "@/lib/utils";

type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; email: string } | null;
};

export function NotesView({
  projectId,
  initialNotes,
}: {
  projectId: string;
  initialNotes: Note[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  useEffect(() => setNotes(initialNotes), [initialNotes]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) return toast.error("Failed to create note");
    const created = await res.json();
    setNotes([created, ...notes]);
    setOpen(false);
    setTitle("");
    setBody("");
    router.refresh();
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditBody(n.body);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/projects/${projectId}/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: editTitle, body: editBody }),
    });
    if (!res.ok) return toast.error("Save failed");
    const updated = await res.json();
    setNotes(notes.map((n) => (n.id === id ? updated : n)));
    setEditingId(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    const res = await fetch(`/api/projects/${projectId}/notes/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed");
    setNotes(notes.filter((n) => n.id !== id));
    router.refresh();
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-500" /> Notes
        </h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md bg-card">
          No notes yet. Capture meeting notes, decisions, and references here.
        </p>
      ) : (
        <ul className="grid gap-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border bg-card p-4">
              {editingId === n.id ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-semibold"
                  />
                  <Textarea
                    rows={6}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(n.id)}>
                      <Save className="h-4 w-4" /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{n.title}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(n)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        aria-label="Edit note"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(n.id)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        aria-label="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {n.author?.name ?? n.author?.email ?? "—"} · updated{" "}
                    {formatDate(n.updatedAt)}
                  </p>
                  {n.body && (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{n.body}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Notes, decisions, references…"
              />
            </div>
            <DialogFooter>
              <Button type="submit">Create note</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
