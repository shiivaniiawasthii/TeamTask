"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UserPlus,
  Trash2,
  Mail,
  Shield,
  Send,
  CalendarClock,
  Infinity as InfinityIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  expiresAt: string | null;
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

// Duration presets for the invite + extend flows. "custom" lets admin pick a
// date. "lifetime" sets expiresAt to null. Server enforces min 30 days.
type DurationPreset = "30" | "90" | "180" | "365" | "lifetime" | "custom";

const DURATION_OPTIONS: { value: DurationPreset; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
  { value: "lifetime", label: "No expiry" },
  { value: "custom", label: "Custom date…" },
];

function presetToExpiry(
  preset: DurationPreset,
  customDate: string,
): { days: number | null; expiresAtIso: string | null } {
  if (preset === "lifetime") return { days: null, expiresAtIso: null };
  if (preset === "custom") {
    if (!customDate) return { days: null, expiresAtIso: null };
    const d = new Date(customDate);
    const days = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { days, expiresAtIso: d.toISOString() };
  }
  const days = Number(preset);
  const expiresAtIso = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000,
  ).toISOString();
  return { days, expiresAtIso };
}

function expiryStatus(iso: string | null): {
  label: string;
  variant: "ok" | "warn" | "expired" | "none";
} {
  if (!iso) return { label: "Lifetime", variant: "none" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", variant: "expired" };
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 7) return { label: `${days}d left`, variant: "warn" };
  if (days <= 30) return { label: `${days}d left`, variant: "warn" };
  return { label: formatDate(iso), variant: "ok" };
}

const EXPIRY_STYLE: Record<string, string> = {
  ok: "bg-muted text-muted-foreground border-border",
  warn: "bg-orange-100 text-orange-800 border-orange-200",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  none: "bg-muted/50 text-muted-foreground border-border",
};

export function MembersView({
  projectId,
  projectName,
  currentUserId,
  isAdmin,
  members: initialMembers,
  invitations: initialInvitations,
}: {
  projectId: string;
  projectName: string;
  currentUserId: string;
  isAdmin: boolean;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);

  // ─── Poll the members page so accepted invites disappear / new joiners
  // appear without the admin having to manually reload. router.refresh()
  // is a server-component refresh — cheap (single page query). 10s matches
  // the notification bell cadence. Also refresh on tab focus.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000);
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  // Invite dialog state.
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [duration, setDuration] = useState<DurationPreset>("365");
  const [customDate, setCustomDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Extend-access dialog state (per-member).
  const [extendingUserId, setExtendingUserId] = useState<string | null>(null);
  const [extendDuration, setExtendDuration] = useState<DurationPreset>("365");
  const [extendCustomDate, setExtendCustomDate] = useState("");
  const extendingMember = members.find((m) => m.userId === extendingUserId);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const list = emails
      .split(/[,\s\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return toast.error("Enter at least one email");

    const { days } = presetToExpiry(duration, customDate);
    if (duration === "custom" && (!days || days < 30)) {
      return toast.error("Custom expiry must be at least 30 days from today");
    }

    setSubmitting(true);
    const res = await fetch(`/api/projects/${projectId}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        emails: list,
        role,
        accessDurationDays: days,
      }),
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

    setInvitations((prev) => [
      ...prev,
      ...results
        .filter((r) => r.status === "invited")
        .map((r) => ({
          id: `temp-${Date.now()}-${Math.random()}`,
          email: r.email,
          role,
          expiresAt: new Date(Date.now() + (days ?? 365) * 24 * 60 * 60 * 1000).toISOString(),
          invitedBy: "You",
        })),
    ]);

    toast.success(
      `Sent ${invited} invitation${invited === 1 ? "" : "s"}` +
        (skipped > 0 ? ` (${skipped} skipped — already member or invited)` : ""),
    );
    setOpen(false);
    setEmails("");
    setRole("MEMBER");
    setDuration("365");
    setCustomDate("");
    router.refresh();
  }

  async function changeRole(userId: string, newRole: Role) {
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m)),
    );
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to update role");
      setMembers(initialMembers);
      return;
    }
    router.refresh();
  }

  async function saveExtend() {
    if (!extendingUserId) return;
    const { expiresAtIso, days } = presetToExpiry(extendDuration, extendCustomDate);
    if (extendDuration === "custom" && (!days || days < 30)) {
      return toast.error("Custom expiry must be at least 30 days from today");
    }
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === extendingUserId
          ? { ...m, expiresAt: expiresAtIso }
          : m,
      ),
    );
    const res = await fetch(
      `/api/projects/${projectId}/members/${extendingUserId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: expiresAtIso }),
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to update access");
      setMembers(initialMembers);
      return;
    }
    toast.success("Access updated");
    setExtendingUserId(null);
    setExtendDuration("365");
    setExtendCustomDate("");
    router.refresh();
  }

  async function removeMember(userId: string, name: string | null, email: string) {
    if (!confirm(`Remove ${name ?? email} from this project?`)) return;
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to remove");
      setMembers((prev) => [...prev, { userId, name, email, image: null, role: "MEMBER", joinedAt: new Date().toISOString(), expiresAt: null }]);
      return;
    }
    router.refresh();
  }

  async function cancelInvite(id: string) {
    if (!confirm("Cancel this invitation?")) return;
    setInvitations((prev) => prev.filter((i) => i.id !== id));
    const res = await fetch(`/api/projects/${projectId}/invitations/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const original = initialInvitations.find((i) => i.id === id);
      if (original) setInvitations((prev) => [...prev, original]);
      toast.error("Failed");
      return;
    }
    toast.success("Invitation cancelled");
    router.refresh();
  }

  async function resendInvite(id: string, email: string) {
    const res = await fetch(
      `/api/projects/${projectId}/invitations/${id}/resend`,
      { method: "POST" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to resend");
      return;
    }
    toast.success(`Invitation re-sent to ${email}`);
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

      <section className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-3 py-2 font-normal">Email</th>
              <th className="px-3 py-2 font-normal">Role</th>
              <th className="px-3 py-2 font-normal">Joined</th>
              <th className="px-3 py-2 font-normal">Access</th>
              {isAdmin && <th className="px-3 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const status = expiryStatus(m.expiresAt);
              return (
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
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge className={EXPIRY_STYLE[status.variant]}>
                        {status.variant === "none" ? (
                          <InfinityIcon className="h-3 w-3 mr-1" />
                        ) : (
                          <CalendarClock className="h-3 w-3 mr-1" />
                        )}
                        {status.label}
                      </Badge>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setExtendingUserId(m.userId);
                            setExtendDuration("365");
                            setExtendCustomDate("");
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
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
              );
            })}
          </tbody>
        </table>
      </section>

      {isAdmin && invitations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Mail className="h-4 w-4" /> Pending invitations
          </h3>
          <div className="rounded-md border bg-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => resendInvite(i.id, i.email)}
                          className="text-muted-foreground hover:text-foreground p-1"
                          aria-label="Resend invitation"
                          title="Resend invitation"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => cancelInvite(i.id)}
                          className="text-muted-foreground hover:text-destructive p-1"
                          aria-label="Cancel invitation"
                          title="Cancel invitation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
            <div className="space-y-2">
              <Label>Access duration</Label>
              <Select
                value={duration}
                onValueChange={(v) => setDuration(v as DurationPreset)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {duration === "custom" && (
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  required
                />
              )}
              <p className="text-xs text-muted-foreground">
                Minimum 30 days. Choose "No expiry" for permanent access.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send invitations"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={extendingUserId !== null}
        onOpenChange={(v) => !v && setExtendingUserId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Update access for {extendingMember?.name ?? extendingMember?.email ?? "member"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current:{" "}
              <span className="font-medium text-foreground">
                {expiryStatus(extendingMember?.expiresAt ?? null).label}
              </span>
            </p>
            <div className="space-y-2">
              <Label>New access duration</Label>
              <Select
                value={extendDuration}
                onValueChange={(v) => setExtendDuration(v as DurationPreset)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {extendDuration === "custom" && (
                <Input
                  type="date"
                  value={extendCustomDate}
                  onChange={(e) => setExtendCustomDate(e.target.value)}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Minimum 30 days from today.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setExtendingUserId(null)}>
              Cancel
            </Button>
            <Button onClick={saveExtend}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
