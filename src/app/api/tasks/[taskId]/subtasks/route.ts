import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createNotifications } from "@/server/notifications";

const schema = z.object({ title: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      project: { include: { members: { where: { userId: user.id } } } },
      assignees: { select: { userId: true } },
    },
  });
  if (!task || task.project.members.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const last = await prisma.subtask.findFirst({
    where: { taskId: params.taskId },
    orderBy: { position: "desc" },
  });
  const sub = await prisma.subtask.create({
    data: {
      taskId: params.taskId,
      title: parsed.data.title,
      position: (last?.position ?? -1) + 1,
    },
  });

  // Notify assignees that a subtask was added (not the user who added it).
  await createNotifications({
    userIds: task.assignees.map((a) => a.userId),
    actorId: user.id,
    type: "SUBTASK_CREATED",
    title: `New subtask: "${parsed.data.title.slice(0, 80)}"`,
    message: `On "${(task as any).title ?? "a task"}"`,
    link: `/projects/${task.projectId}/board?task=${task.id}`,
  });

  return NextResponse.json(sub);
}
