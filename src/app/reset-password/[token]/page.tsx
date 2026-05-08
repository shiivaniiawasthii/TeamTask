"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [info, setInfo] = useState<{ email: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    fetch(`/api/auth/reset-password/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(j.error ?? "Invalid link");
          return null;
        }
        return r.json();
      })
      .then((d) => d && setInfo(d))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/auth/reset-password/${params.token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Reset failed");
      return;
    }
    const { email } = (await res.json()) as { email: string };
    toast.success("Password updated. Signing you in…");
    await signIn("credentials", { email, password, redirect: false });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <h1 className="text-2xl font-semibold">Reset password</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-sm text-muted-foreground">
              Reset links expire after 1 hour. You can request a new one.
            </p>
            <Link href="/forgot-password" className="text-sm text-primary underline">
              Send another reset link
            </Link>
          </>
        ) : info ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Setting a new password for <strong>{info.email}</strong>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </form>
        ) : null}

        <div className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
