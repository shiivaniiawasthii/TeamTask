import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  inviteToken: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, name, password, inviteToken } = parsed.data;
  const lowered = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lowered } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  let invitation: Awaited<ReturnType<typeof prisma.invitation.findUnique>> = null;
  if (inviteToken) {
    invitation = await prisma.invitation.findUnique({ where: { token: inviteToken } });
    if (!invitation || invitation.status !== "PENDING") {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 });
    }
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
    }
    if (invitation.email.toLowerCase() !== lowered) {
      return NextResponse.json(
        { error: `Invitation is for ${invitation.email}` },
        { status: 400 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: lowered, name, passwordHash },
    select: { id: true, email: true, name: true },
  });

  let projectId: string | undefined;
  if (invitation) {
    await prisma.projectMember.create({
      data: { projectId: invitation.projectId, userId: user.id, role: invitation.role },
    });
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    projectId = invitation.projectId;
  }

  return NextResponse.json({ ...user, projectId });
}
