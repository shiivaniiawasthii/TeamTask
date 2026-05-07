import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).optional(),
});

async function canAccess(subtaskId: string, userId: string) {
  const sub = await prisma.subtask.findUnique({
    where: { id: subtaskId },
    include: {
      task: { include: { project: { include: { members: { where: { userId } } } } } },
    },
  });
  if (!sub || sub.task.project.members.length === 0) return null;
  return sub;
}

export async function PATCH(req: NextRequest, { params }: { params: { subtaskId: string } }) {
  const user = await requireUser();
  const sub = await canAccess(params.subtaskId, user.id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const updated = await prisma.subtask.update({
    where: { id: params.subtaskId },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { subtaskId: string } }) {
  const user = await requireUser();
  const sub = await canAccess(params.subtaskId, user.id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.subtask.delete({ where: { id: params.subtaskId } });
  return NextResponse.json({ ok: true });
}
