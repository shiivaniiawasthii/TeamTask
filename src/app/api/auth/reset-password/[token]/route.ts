import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  password: z.string().min(8),
});

async function findValid(token: string) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!row) return { error: "Invalid token", row: null };
  if (row.usedAt) return { error: "Token already used", row: null };
  if (row.expiresAt < new Date()) return { error: "Token expired", row: null };
  return { error: null, row };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { error, row } = await findValid(params.token);
  if (error || !row)
    return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ email: row.user.email, expiresAt: row.expiresAt });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { error, row } = await findValid(params.token);
  if (error || !row) return NextResponse.json({ error }, { status: 400 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: row.userId },
    data: { passwordHash },
  });
  await prisma.passwordResetToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  // Invalidate any other unused tokens for this user.
  await prisma.passwordResetToken.updateMany({
    where: { userId: row.userId, usedAt: null, id: { not: row.id } },
    data: { usedAt: new Date() },
  });

  return NextResponse.json({ ok: true, email: row.user.email });
}
