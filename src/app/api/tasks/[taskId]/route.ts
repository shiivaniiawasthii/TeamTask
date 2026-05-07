import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendAssignmentEmail } from "@/server/email/notifications";

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
});

function toDate(v: string | null | undefined) {
  if (typeof v === "undefined") return undefined;
  return v ? new Date(v) : null;
}

async function canAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { members: { where: { userId } } } } },
  });
  if (!task) return null;
  if (task.project.members.length === 0) return null;
  return task;
}

export async function GET(_req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const allowed = await canAccess(params.taskId, user.id);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      assignee: { select: { id: true, name: true, email: true, image: true } },
      creator: { select: { id: true, name: true, email: true } },
      subtasks: { orderBy: { position: "asc" } },
      sprint: { select: { id: true, name: true } },
      milestone: { select: { id: true, title: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true, image: true } } },
      },
      project: { select: { id: true, key: true, name: true } },
    },
  });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const existing = await canAccess(params.taskId, user.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const newAssignee = parsed.data.assigneeId;
  const assigneeChanged =
    typeof newAssignee !== "undefined" && newAssignee !== existing.assigneeId;

  const updated = await prisma.task.update({
    where: { id: params.taskId },
    data: {
      ...parsed.data,
      startDate: toDate(parsed.data.startDate),
      endDate: toDate(parsed.data.endDate),
      // Reset reminder if end date changes.
      endReminderSentAt:
        typeof parsed.data.endDate !== "undefined" ? null : undefined,
    },
    include: { assignee: true, project: true },
  });

  if (assigneeChanged && updated.assignee) {
    sendAssignmentEmail(updated).catch((e) => console.error("assignment email", e));
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const existing = await canAccess(params.taskId, user.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.task.delete({ where: { id: params.taskId } });
  return NextResponse.json({ ok: true });
}
