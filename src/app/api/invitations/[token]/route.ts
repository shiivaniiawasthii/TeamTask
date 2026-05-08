import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const inv = await prisma.invitation.findUnique({
    where: { token: params.token },
    include: {
      project: { select: { id: true, name: true, key: true, color: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userRow = await prisma.user.findUnique({
    where: { email: inv.email },
    select: { passwordHash: true },
  });
  const userActivated = !!userRow?.passwordHash;

  return NextResponse.json({
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
    project: inv.project,
    invitedBy: inv.invitedBy,
    userActivated,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }
  const inv = await prisma.invitation.findUnique({
    where: { token: params.token },
  });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inv.status !== "PENDING") {
    return NextResponse.json({ error: "Invitation no longer valid" }, { status: 400 });
  }
  if (inv.expiresAt < new Date()) {
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
  }
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: `This invitation is for ${inv.email}` },
      { status: 403 },
    );
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: inv.projectId, userId: user.id } },
  });
  if (!existing) {
    await prisma.projectMember.create({
      data: { projectId: inv.projectId, userId: user.id, role: inv.role },
    });
  }
  await prisma.invitation.update({
    where: { id: inv.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

  return NextResponse.json({ ok: true, projectId: inv.projectId });
}
