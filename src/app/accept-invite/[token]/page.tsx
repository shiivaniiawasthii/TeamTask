"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type InviteInfo = {
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  project: { id: string; name: string; key: string; color: string };
  invitedBy: { name: string | null; email: string };
};

export default function AcceptInvitePage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(j.error ?? "Invitation not found");
          return null;
        }
        return r.json() as Promise<InviteInfo>;
      })
      .then((data) => {
        if (data) setInfo(data);
      })
      .finally(() => setLoading(false));
  }, [params.token]);

  async function accept() {
    setSubmitting(true);
    const res = await fetch(`/api/invitations/${params.token}`, { method: "POST" });
    setSubmitting(false);
    if (res.status === 401) {
      router.push(
        `/login?callbackUrl=${encodeURIComponent(`/accept-invite/${params.token}`)}`,
      );
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Could not accept");
      return;
    }
    const { projectId } = (await res.json()) as { projectId: string };
    toast.success("Joined!");
    router.push(`/projects/${projectId}/board`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading invitation…</p>
        ) : error ? (
          <>
            <h1 className="text-xl font-semibold">Invitation unavailable</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link href="/" className="text-sm text-primary underline">
              Go home
            </Link>
          </>
        ) : info ? (
          <>
            <h1 className="text-xl font-semibold">You've been invited</h1>
            <p className="text-sm text-muted-foreground">
              <strong>{info.invitedBy.name ?? info.invitedBy.email}</strong> invited
              you to join{" "}
              <strong style={{ color: info.project.color }}>{info.project.name}</strong>{" "}
              as a <strong>{info.role}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              This invitation is for <strong>{info.email}</strong>. Make sure you're
              signed in as that user.
            </p>
            <div className="flex gap-2 pt-2">
              <Button onClick={accept} disabled={submitting}>
                {submitting ? "Accepting…" : "Accept invitation"}
              </Button>
              <Link
                href={`/register?invite=${params.token}`}
                className="text-sm text-primary underline self-center"
              >
                New user? Sign up
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
