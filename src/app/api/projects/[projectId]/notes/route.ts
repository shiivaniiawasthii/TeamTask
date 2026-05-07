import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
});

async function ensureMember(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const notes = await prisma.note.findMany({
    where: { projectId: params.projectId },
    orderBy: { updatedAt: "desc" },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(notes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  const member = await ensureMember(params.projectId, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const note = await prisma.note.create({
    data: {
      projectId: params.projectId,
      authorId: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
    },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(note);
}
