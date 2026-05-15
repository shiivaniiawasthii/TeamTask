import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createNotifications } from "@/server/notifications";

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

  // Tell project admins that the invitee accepted — drives the real-time
  // "remove from pending / add to members list" experience: when the admin's
  // bell polls, they see the notification and a click takes them to /members.
  const admins = await prisma.projectMember.findMany({
    where: {
      projectId: inv.projectId,
      role: { in: ["ADMIN", "PROJECT_MANAGER"] },
    },
    select: { userId: true },
  });
  const accepter = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true },
  });
  const accepterName = accepter?.name ?? accepter?.email ?? "Someone";
  await createNotifications({
    userIds: admins.map((m) => m.userId),
    actorId: user.id,
    type: "ASSIGNED",
    title: `${accepterName} joined the project`,
    link: `/projects/${inv.projectId}/members`,
  });

  return NextResponse.json({ ok: true, projectId: inv.projectId });
}
