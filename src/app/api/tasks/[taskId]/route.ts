import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  sendAssignmentEmail,
  sendCompletionEmail,
} from "@/server/email/notifications";

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeIds: z.array(z.string()).optional(),
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
    include: {
      project: { include: { members: { where: { userId } } } },
      assignees: true,
    },
  });
  if (!task) return null;
  if (task.project.members.length === 0) return null;
  return task;
}

const assigneeUserSelect = { id: true, name: true, email: true, image: true } as const;

export async function GET(_req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const allowed = await canAccess(params.taskId, user.id);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      assignees: { include: { user: { select: assigneeUserSelect } } },
      assignee: { select: assigneeUserSelect },
      creator: { select: { id: true, name: true, email: true } },
      subtasks: { orderBy: { position: "asc" } },
      sprint: { select: { id: true, name: true } },
      milestone: { select: { id: true, title: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: assigneeUserSelect } },
      },
      project: { select: { id: true, key: true, name: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const assigneesUsers = task.assignees.map((a) => a.user);
  return NextResponse.json({
    ...task,
    assignees: assigneesUsers,
    assignee: task.assignee ?? assigneesUsers[0] ?? null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const existing = await canAccess(params.taskId, user.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const wasDone = existing.status === "DONE";
  const becomingDone = parsed.data.status === "DONE";

  const prevAssigneeIds = new Set(existing.assignees.map((a) => a.userId));
  let newAssigneeIds: Set<string> | null = null;
  if (parsed.data.assigneeIds) {
    newAssigneeIds = new Set(parsed.data.assigneeIds);
  } else if (typeof parsed.data.assigneeId !== "undefined") {
    newAssigneeIds = new Set(parsed.data.assigneeId ? [parsed.data.assigneeId] : []);
  }

  // Sync the legacy assigneeId to the first new assignee (or null).
  const firstNewAssigneeId =
    newAssigneeIds && newAssigneeIds.size > 0
      ? Array.from(newAssigneeIds)[0]
      : newAssigneeIds
        ? null
        : undefined;

  const updateData: any = {
    ...parsed.data,
    startDate: toDate(parsed.data.startDate),
    endDate: toDate(parsed.data.endDate),
    endReminderSentAt:
      typeof parsed.data.endDate !== "undefined" ? null : undefined,
  };
  delete updateData.assigneeIds;
  if (typeof firstNewAssigneeId !== "undefined") {
    updateData.assigneeId = firstNewAssigneeId;
  }

  const updated = await prisma.task.update({
    where: { id: params.taskId },
    data: updateData,
  });

  // Sync the join table if the assignee list changed.
  if (newAssigneeIds) {
    const toAdd = Array.from(newAssigneeIds).filter((id) => !prevAssigneeIds.has(id));
    const toRemove = Array.from(prevAssigneeIds).filter((id) => !newAssigneeIds!.has(id));

    if (toRemove.length > 0) {
      await prisma.taskAssignee.deleteMany({
        where: { taskId: params.taskId, userId: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await prisma.taskAssignee.createMany({
        data: toAdd.map((userId) => ({ taskId: params.taskId, userId })),
      });
      // Email each newly-assigned user.
      const newUsers = await prisma.user.findMany({
        where: { id: { in: toAdd } },
        select: { id: true, email: true, name: true },
      });
      const project = await prisma.project.findUnique({
        where: { id: updated.projectId },
        select: { name: true },
      });
      for (const u of newUsers) {
        sendAssignmentEmail({
          id: updated.id,
          title: updated.title,
          projectId: updated.projectId,
          assigneeId: u.id,
          assignee: { email: u.email, name: u.name },
          project: project ?? null,
        }).catch((e) => console.error("assignment email", e));
      }
    }
  }

  // Completion email when status flips to DONE.
  if (!wasDone && becomingDone) {
    sendCompletionEmail(updated.id, user.id).catch((e) =>
      console.error("completion email", e),
    );
  }

  // Return the updated task with both assignee and assignees populated.
  const refreshed = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      assignees: { include: { user: { select: assigneeUserSelect } } },
      assignee: { select: assigneeUserSelect },
    },
  });
  const assigneesUsers = refreshed!.assignees.map((a) => a.user);
  return NextResponse.json({
    ...updated,
    assignees: assigneesUsers,
    assignee: refreshed!.assignee ?? assigneesUsers[0] ?? null,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const existing = await canAccess(params.taskId, user.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.task.delete({ where: { id: params.taskId } });
  return NextResponse.json({ ok: true });
}
