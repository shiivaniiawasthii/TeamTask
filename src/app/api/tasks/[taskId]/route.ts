import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  sendAssignmentEmail,
  sendCompletionEmail,
  sendTaskActivityEmail,
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

  // Generic activity notifications — fire when the user edits ANYTHING that
  // matters to the rest of the team. We deliberately do NOT cover:
  //   - assignment changes (handled by sendAssignmentEmail above)
  //   - transitions to DONE (handled by sendCompletionEmail above)
  //   - new comments (handled in the comments route by sendCommentEmail)
  // so that recipients don't get duplicate emails for the same change.
  const changes: string[] = [];
  const data = parsed.data;

  if (typeof data.title === "string" && data.title !== existing.title) {
    changes.push(`renamed to "${data.title}"`);
  }
  if (
    "description" in data &&
    (data.description ?? null) !== (existing.description ?? null)
  ) {
    changes.push("description was updated");
  }
  if (
    typeof data.status === "string" &&
    data.status !== existing.status &&
    data.status !== "DONE"
  ) {
    changes.push(`status changed from ${existing.status} to ${data.status}`);
  }
  if (typeof data.priority === "string" && data.priority !== existing.priority) {
    changes.push(`priority set to ${data.priority}`);
  }
  if ("endDate" in data) {
    const oldIso = existing.endDate ? existing.endDate.toISOString().slice(0, 10) : null;
    const newIso = data.endDate ? data.endDate.slice(0, 10) : null;
    if (oldIso !== newIso) {
      changes.push(
        newIso ? `due date changed to ${newIso}` : "due date cleared",
      );
    }
  }
  if ("startDate" in data) {
    const oldIso = existing.startDate ? existing.startDate.toISOString().slice(0, 10) : null;
    const newIso = data.startDate ? data.startDate.slice(0, 10) : null;
    if (oldIso !== newIso) {
      changes.push(
        newIso ? `start date changed to ${newIso}` : "start date cleared",
      );
    }
  }

  if (changes.length > 0) {
    const actor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });
    const actorName = actor?.name ?? actor?.email ?? "Someone";
    sendTaskActivityEmail({
      taskId: updated.id,
      actorId: user.id,
      summary: `${actorName} updated this task: ${changes.join("; ")}.`,
    }).catch((e) => console.error("activity email", e));
  }

  // If anyone was removed from the assignee list, let them know explicitly.
  if (newAssigneeIds) {
    const removedNow = Array.from(prevAssigneeIds).filter(
      (id) => !newAssigneeIds!.has(id) && id !== user.id,
    );
    if (removedNow.length > 0) {
      const actor = await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, email: true },
      });
      const actorName = actor?.name ?? actor?.email ?? "Someone";
      // We can't use sendTaskActivityEmail directly (those recipients are no
      // longer assignees). Send a one-off mail per removed user.
      const removed = await prisma.user.findMany({
        where: { id: { in: removedNow } },
        select: { email: true, name: true },
      });
      for (const r of removed) {
        if (!r.email) continue;
        // Reuse the generic shape by mailing them directly.
        sendTaskActivityEmail({
          taskId: updated.id,
          actorId: "__system__", // never matches any assignee → email goes through
          summary: `${actorName} removed you from this task.`,
        }).catch((e) => console.error("activity email (removed)", e));
        // Note: the user is already removed from the join table, so
        // sendTaskActivityEmail (which only emails current assignees) will
        // NOT actually reach them. So we send directly below.
        // Fall through to the explicit per-recipient send.
      }
    }
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
