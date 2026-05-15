import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canManageMembers, requireUser } from "@/lib/session";
import { createNotifications } from "@/server/notifications";

const patchSchema = z
  .object({
    role: z.enum(["ADMIN", "PROJECT_MANAGER", "LEAD", "MEMBER"]).optional(),
    // ISO date string or null. null clears expiry (lifetime access).
    expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .refine((d) => d.role !== undefined || d.expiresAt !== undefined, {
    message: "Provide role or expiresAt",
  });

async function adminCount(projectId: string) {
  return prisma.projectMember.count({
    where: { projectId, role: "ADMIN" },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; userId: string } },
) {
  const user = await requireUser();
  if (!(await canManageMembers(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    target.role === "ADMIN" &&
    parsed.data.role !== undefined &&
    parsed.data.role !== "ADMIN"
  ) {
    if ((await adminCount(params.projectId)) <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last admin" },
        { status: 400 },
      );
    }
  }

  // Build update payload from whichever fields the caller sent.
  const updateData: { role?: string; expiresAt?: Date | null } = {};
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.expiresAt !== undefined) {
    updateData.expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;
    // Enforce min 30 days from now when extending (admin can still set null
    // for lifetime, which bypasses the floor).
    if (
      updateData.expiresAt &&
      updateData.expiresAt.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
    ) {
      return NextResponse.json(
        { error: "Access expiry must be at least 30 days from now" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
    data: updateData,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; userId: string } },
) {
  const user = await requireUser();
  if (!(await canManageMembers(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "ADMIN" && (await adminCount(params.projectId)) <= 1) {
    return NextResponse.json(
      { error: "Cannot remove the last admin" },
      { status: 400 },
    );
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
  });

  // Notify the removed user. Link points to /dashboard since they no longer
  // have access to the project.
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { name: true },
  });
  await createNotifications({
    userIds: [params.userId],
    actorId: user.id,
    type: "UNASSIGNED",
    title: `You were removed from ${project?.name ?? "a project"}`,
    message: "You no longer have access to this project.",
    link: "/dashboard",
  });

  return NextResponse.json({ ok: true });
}
