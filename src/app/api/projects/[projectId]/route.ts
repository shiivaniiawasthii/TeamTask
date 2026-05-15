import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canManageMembers, isProjectAdmin, requireUser } from "@/lib/session";
import { createNotifications } from "@/server/notifications";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #6366f1")
    .optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  // ADMIN or PROJECT_MANAGER can edit project metadata.
  if (!(await canManageMembers(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.project.update({
    where: { id: params.projectId },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  if (!(await isProjectAdmin(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Capture member list and project name BEFORE delete (cascade wipes them).
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      name: true,
      members: { select: { userId: true } },
    },
  });

  await prisma.project.delete({ where: { id: params.projectId } });

  if (project) {
    // Notify everyone who was a member, except the admin who deleted it.
    // Link goes to /dashboard since the project URL is now 404.
    await createNotifications({
      userIds: project.members.map((m) => m.userId),
      actorId: user.id,
      type: "TASK_EDITED",
      title: `Project deleted: ${project.name}`,
      message: "This project and all its tasks have been removed.",
      link: "/dashboard",
    });
  }

  return NextResponse.json({ ok: true });
}
