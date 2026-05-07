import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["UPCOMING", "REACHED", "MISSED"]).optional(),
});

async function ensureMember(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; milestoneId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const milestone = await prisma.milestone.update({
    where: { id: params.milestoneId },
    data: {
      ...parsed.data,
      dueDate:
        typeof parsed.data.dueDate === "undefined"
          ? undefined
          : parsed.data.dueDate
            ? new Date(parsed.data.dueDate)
            : null,
    },
  });
  return NextResponse.json(milestone);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; milestoneId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.milestone.delete({ where: { id: params.milestoneId } });
  return NextResponse.json({ ok: true });
}
