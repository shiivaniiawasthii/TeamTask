import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canViewProject, requireUser } from "@/lib/session";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["UPCOMING", "REACHED", "MISSED"]).optional(),
  sprintIds: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; milestoneId: string } },
) {
  const user = await requireUser();
  if (!(await canViewProject(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Apply scalar updates first.
  const updateData: any = {
    ...parsed.data,
    dueDate:
      typeof parsed.data.dueDate === "undefined"
        ? undefined
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
  };
  delete updateData.sprintIds;
  // Keep legacy sprintId in sync with the first sprint in the new list.
  if (parsed.data.sprintIds) {
    updateData.sprintId = parsed.data.sprintIds[0] ?? null;
  }

  await prisma.milestone.update({
    where: { id: params.milestoneId },
    data: updateData,
  });

  // Sync the join table if sprintIds was provided.
  if (parsed.data.sprintIds) {
    await prisma.milestoneSprint.deleteMany({
      where: { milestoneId: params.milestoneId },
    });
    if (parsed.data.sprintIds.length > 0) {
      await prisma.milestoneSprint.createMany({
        data: parsed.data.sprintIds.map((sprintId) => ({
          milestoneId: params.milestoneId,
          sprintId,
        })),
      });
    }
  }

  const fresh = await prisma.milestone.findUnique({
    where: { id: params.milestoneId },
    include: {
      sprintLinks: {
        include: { sprint: { select: { id: true, name: true, status: true } } },
      },
    },
  });
  return NextResponse.json({
    ...fresh,
    sprints: fresh!.sprintLinks.map((l) => l.sprint),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; milestoneId: string } },
) {
  const user = await requireUser();
  if (!(await canViewProject(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.milestone.delete({ where: { id: params.milestoneId } });
  return NextResponse.json({ ok: true });
}
