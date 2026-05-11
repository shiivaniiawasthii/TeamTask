"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, formatDate } from "@/lib/utils";

type Member = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  joinedAt: string;
};

type Role = "ADMIN" | "PROJECT_MANAGER" | "LEAD" | "MEMBER";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  LEAD: "Lead",
  MEMBER: "Member",
};

const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: "Full project control, including delete",
  PROJECT_MANAGER: "Manage members, edit project, plan work",
  LEAD: "Plan sprints and milestones; manage tasks",
  MEMBER: "View and edit assigned tasks; comment",
};

const ROLE_STYLE: Record<Role, string> = {
  ADMIN: "bg-primary/15 text-primary border-primary/30",
  PROJECT_MANAGER: "bg-accent/40 text-accent-foreground border-accent",
  LEAD: "bg-muted text-foreground border-border",
  MEMBER: "bg-muted text-muted-foreground border-border",
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy: string;
};

export function MembersView({
  projectId,
  projectName,
  currentUserId,
  isAdmin,
  members,
  invitations,
}: {
  projectId: string;
  projectName: string;
  currentUserId: string;
  isAdmin: boolean;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [submitting, setSubmitting] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const list = emails
      .split(/[,\s\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return toast.error("Enter at least one email");

    setSubmitting(true);
    const res = await fetch(`/api/projects/${projectId}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: list, role }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to send invites");
      return;
    }
    const { results } = (await res.json()) as {
      results: { email: string; status: string }[];
    };
    const invited = results.filter((r) => r.status === "invited").length;
    const skipped = results.length - invited;
    toast.success(
      `Sent ${invited} invitation${invited === 1 ? "" : "s"}` +
        (skipped > 0 ? ` (${skipped} skipped — already member or invited)` : ""),
    );
    setOpen(false);
    setEmails("");
    setRole("MEMBER");
    router.refresh();
  }

  async function changeRole(userId: string, newRole: Role) {
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to update role");
      return;
    }
    router.refresh();
  }

  async function removeMember(userId: string, name: string | null, email: string) {
    if (!confirm(`Remove ${name ?? email} from this project?`)) return;
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to remove");
      return;
    }
    router.refresh();
  }

  async function cancelInvite(id: string) {
    if (!confirm("Cancel this invitation?")) return;
    const res = await fetch(`/api/projects/${projectId}/invitations/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return toast.error("Failed");
    router.refresh();
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members</h2>
        {isAdmin && (
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite people
          </Button>
        )}
      </div>

      <section className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-3 py-2 font-normal">Email</th>
              <th className="px-3 py-2 font-normal">Role</th>
              <th className="px-3 py-2 font-normal">Joined</th>
              {isAdmin && <th className="px-3 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b last:border-b-0 hover:bg-muted/40">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback>{initials(m.name, m.email)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {m.name ?? m.email}
                      {m.userId === currentUserId && (
                        <span className="text-xs text-muted-foreground ml-2">(you)</span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{m.email}</td>
                <td className="px-3 py-2">
                  {isAdmin ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => changeRole(m.userId, v as Role)}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["ADMIN", "PROJECT_MANAGER", "LEAD", "MEMBER"] as Role[]).map(
                          (r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={ROLE_STYLE[m.role as Role] ?? ROLE_STYLE.MEMBER}>
                      {m.role === "ADMIN" && <Shield className="h-3 w-3 mr-1" />}
                      {ROLE_LABEL[m.role as Role] ?? m.role}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(m.joinedAt)}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2">
                    {m.userId !== currentUserId && (
                      <button
                        onClick={() => removeMember(m.userId, m.name, m.email)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isAdmin && invitations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Mail className="h-4 w-4" /> Pending invitations
          </h3>
          <div className="rounded-md border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-normal">Email</th>
                  <th className="px-3 py-2 font-normal">Role</th>
                  <th className="px-3 py-2 font-normal">Invited by</th>
                  <th className="px-3 py-2 font-normal">Expires</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-2">{i.email}</td>
                    <td className="px-3 py-2">
                      <Badge className={ROLE_STYLE[i.role as Role] ?? ROLE_STYLE.MEMBER}>
                        {ROLE_LABEL[i.role as Role] ?? i.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{i.invitedBy}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(i.expiresAt)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => cancelInvite(i.id)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        aria-label="Cancel invitation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite people to {projectName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={invite} className="space-y-4">
            <div className="space-y-2">
              <Label>Email addresses</Label>
              <Textarea
                rows={4}
                placeholder="alice@example.com, bob@example.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple addresses with commas, spaces, or new lines.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["MEMBER", "LEAD", "PROJECT_MANAGER", "ADMIN"] as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]} — {ROLE_DESCRIPTION[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send invitations"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
