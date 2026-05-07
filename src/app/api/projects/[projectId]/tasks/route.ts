import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendAssignmentEmail } from "@/server/email/notifications";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.projectId, userId: user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const lastInCol = await prisma.task.findFirst({
    where: { projectId: params.projectId, status: data.status },
    orderBy: { position: "desc" },
  });

  const task = await prisma.task.create({
    data: {
      projectId: params.projectId,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      assigneeId: data.assigneeId || null,
      sprintId: data.sprintId || null,
      milestoneId: data.milestoneId || null,
      creatorId: user.id,
      position: (lastInCol?.position ?? -1) + 1,
    },
    include: { assignee: true, project: true },
  });

  if (task.assignee) {
    sendAssignmentEmail(task).catch((e) => console.error("assignment email", e));
  }

  return NextResponse.json(task);
}
