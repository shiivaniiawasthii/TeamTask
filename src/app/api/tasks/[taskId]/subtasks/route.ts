import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({ title: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { project: { include: { members: { where: { userId: user.id } } } } },
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
  return NextResponse.json(sub);
}
