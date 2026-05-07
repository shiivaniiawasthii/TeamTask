import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).optional(),
});

async function ensureMember(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; sprintId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sprint = await prisma.sprint.update({
    where: { id: params.sprintId },
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
  });
  return NextResponse.json(sprint);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; sprintId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.sprint.delete({ where: { id: params.sprintId } });
  return NextResponse.json({ ok: true });
}
