import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendAssignmentEmail } from "@/server/email/notifications";
import { createNotifications } from "@/server/notifications";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeIds: z.array(z.string()).optional(),
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

  // Resolve the list of assignees: prefer assigneeIds[], fall back to assigneeId.
  const assigneeIds = data.assigneeIds && data.assigneeIds.length > 0
    ? data.assigneeIds
    : data.assigneeId
      ? [data.assigneeId]
      : [];

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
      // Legacy single assignee = first in list (for backward-compat reads).
      assigneeId: assigneeIds[0] ?? null,
      sprintId: data.sprintId || null,
      milestoneId: data.milestoneId || null,
      creatorId: user.id,
      position: (lastInCol?.position ?? -1) + 1,
      assignees: {
        create: assigneeIds.map((userId) => ({ userId })),
      },
    },
    include: {
      assignees: { include: { user: true } },
      project: true,
    },
  });

  // Email each assignee.
  for (const a of task.assignees) {
    sendAssignmentEmail({
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      assigneeId: a.userId,
      assignee: { email: a.user.email, name: a.user.name },
      project: { name: task.project.name },
    }).catch((e) => console.error("assignment email", e));
  }

  // In-app notification for each assignee. Mirrors what the PATCH route does
  // when assignees are added later — without this, freshly-created tasks
  // would email the assignee but leave their notification bell empty.
  if (task.assignees.length > 0) {
    await createNotifications({
      userIds: task.assignees.map((a) => a.userId),
      actorId: user.id,
      type: "ASSIGNED",
      title: `Assigned to "${task.title}"`,
      message: `In ${task.project.name}`,
      link: `/projects/${task.projectId}/board?task=${task.id}`,
    }).catch((e) => console.error("task created notification", e));
  }

  return NextResponse.json(task);
}
