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
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  // Always respond the same way to avoid leaking which emails are registered.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.passwordHash) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });
    sendPasswordResetEmail(user.email, user.name, token, expiresAt).catch((e) =>
      console.error("password reset email", e),
    );
  }

  return NextResponse.json({ ok: true });
}
