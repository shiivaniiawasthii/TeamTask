"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get("invite") ?? null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invitations/${inviteToken}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) {
          setInviteEmail(d.email);
          setEmail(d.email);
          setProjectName(d.project?.name ?? null);
        }
      })
      .catch(() => {});
  }, [inviteToken]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password, inviteToken }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Failed to register");
      setLoading(false);
      return;
    }
    const { projectId } = (await res.json()) as { projectId?: string };
    await signIn("credentials", { email, password, redirect: false });
    router.push(projectId ? `/projects/${projectId}/board` : "/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm space-y-4"
    >
      <h1 className="text-2xl font-semibold">Create account</h1>
      {projectName && (
        <p className="text-sm text-muted-foreground rounded-md bg-accent/30 border border-accent p-3">
          You're joining <strong>{projectName}</strong> after you sign up.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!!inviteEmail}
        />
        {inviteEmail && (
          <p className="text-xs text-muted-foreground">
            Email is fixed by your invitation.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating..." : "Create account"}
      </Button>
      <div className="text-center text-sm text-muted-foreground">
        Already have one?{" "}
        <Link href="/login" className="text-primary underline">
          Sign in
        </Link>
      </div>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
