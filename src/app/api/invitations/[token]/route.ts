import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createNotifications } from "@/server/notifications";
import { sendInvitationAcceptedEmail } from "@/server/email/notifications";

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
    return NextResponse.json(
      { error: "Invitation no longer valid" },
      { status: 400 },
    );
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

  // Look up everyone we need to notify in one shot.
  const [admins, accepter, projectMeta] = await Promise.all([
    prisma.projectMember.findMany({
      where: {
        projectId: inv.projectId,
        role: { in: ["ADMIN", "PROJECT_MANAGER"] },
      },
      select: { userId: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    }),
    prisma.project.findUnique({
      where: { id: inv.projectId },
      select: { name: true },
    }),
  ]);

  const accepterName = accepter?.name ?? accepter?.email ?? "Someone";
  const projectName = projectMeta?.name ?? "the project";

  // 1) Admins + project managers: "Alice joined the project"
  await createNotifications({
    userIds: admins.map((m) => m.userId),
    actorId: user.id,
    type: "INVITED",
    title: `${accepterName} joined ${projectName}`,
    link: `/projects/${inv.projectId}/members`,
  });

  // 2) The original inviter (if not already covered as admin/PM): "Alice
  // accepted your invitation" — gives the actual sender direct feedback.
  await createNotifications({
    userIds: [inv.invitedById],
    actorId: user.id,
    type: "INVITED",
    title: `${accepterName} accepted your invitation`,
    message: `To ${projectName}`,
    link: `/projects/${inv.projectId}/members`,
  });

  // 3) The accepter themselves: welcome ping in their bell. Confirms the
  // accept worked and gives them a one-click path into the project.
  await createNotifications({
    userIds: [user.id],
    type: "INVITED",
    title: `Welcome to ${projectName}`,
    message: "You're now a member. Click to open the board.",
    link: `/projects/${inv.projectId}/board`,
  });

  // Email admins (existing behaviour).
  sendInvitationAcceptedEmail(
    inv.projectId,
    accepterName,
    accepter?.email ?? inv.email,
  ).catch((e) => console.error("invitation accepted email", e));

  return NextResponse.json({ ok: true, projectId: inv.projectId });
}
