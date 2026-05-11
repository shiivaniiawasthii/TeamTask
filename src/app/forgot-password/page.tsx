"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        toast.error(data.error ?? "Failed to send reset link.");
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError("Network error. Check your connection and try again.");
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">Forgot password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email — we'll send you a reset link.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-md border bg-accent/30 p-3 text-sm">
            <p className="font-medium">Check your inbox.</p>
            <p className="text-muted-foreground mt-1">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
              The link expires in 1 hour. Check your spam folder if it doesn't arrive
              within a few minutes.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending reset link..." : "Send reset link"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              First-time requests can take a few seconds — please don't refresh.
            </p>
          </>
        )}

        <div className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline">
            Back to sign in
          </Link>
        </div>
      </form>
    </main>
  );
}
