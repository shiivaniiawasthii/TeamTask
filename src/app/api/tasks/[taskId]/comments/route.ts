import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendCommentEmail } from "@/server/email/notifications";
import { createNotifications } from "@/server/notifications";

const schema = z.object({ body: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      project: { include: { members: { where: { userId: user.id } } } },
      assignees: { select: { userId: true } },
      creator: { select: { id: true } },
    },
  });
  if (!task || task.project.members.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const comment = await prisma.comment.create({
    data: {
      taskId: params.taskId,
      authorId: user.id,
      body: parsed.data.body,
      source: "web",
    },
    include: { author: { select: { id: true, name: true, email: true, image: true } } },
  });

  sendCommentEmail(task.id, user.id, parsed.data.body).catch((e) =>
    console.error("comment email", e),
  );

  // In-app notify all assignees + creator (the helper drops the actor).
  const recipientIds = [
    ...task.assignees.map((a) => a.userId),
    task.creator?.id,
  ].filter((id): id is string => !!id);

  await createNotifications({
    userIds: recipientIds,
    actorId: user.id,
    type: "COMMENT",
    title: `New comment on "${(task as any).title ?? "a task"}"`,
    message: parsed.data.body.slice(0, 140),
    link: `/projects/${task.projectId}/board?task=${task.id}`,
  });

  return NextResponse.json(comment);
}
