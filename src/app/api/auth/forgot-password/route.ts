import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/server/email/notifications";

const schema = z.object({
  email: z.string().email(),
});

const EXPIRY_MINUTES = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  // To avoid leaking which emails are registered, we always respond {ok:true}
  // when the email format is valid. But we DO need to wait for the email send
  // to complete — fire-and-forget is unsafe in serverless (the function can
  // be killed before the SDK finishes its HTTP call).
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    // No-op: don't reveal whether the email is registered. Add a small
    // artificial delay so the response time is similar to the "real" path.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const result = await sendPasswordResetEmail(
    user.email,
    user.name,
    token,
    expiresAt,
  );

  if (!result.ok) {
    // Email delivery failed — surface a meaningful error so the user knows to
    // retry instead of silently waiting for an email that never arrives.
    return NextResponse.json(
      {
        error:
          "We couldn't send the reset email. Please try again in a moment, or contact support.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
