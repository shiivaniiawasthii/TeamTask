import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});

async function ensureMember(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; noteId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const note = await prisma.note.update({
    where: { id: params.noteId },
    data: parsed.data,
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(note);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; noteId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.note.delete({ where: { id: params.noteId } });
  return NextResponse.json({ ok: true });
}
