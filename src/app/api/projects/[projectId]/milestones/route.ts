import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["UPCOMING", "REACHED", "MISSED"]).default("UPCOMING"),
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

  const milestones = await prisma.milestone.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { tasks: true } } },
  });
  return NextResponse.json(milestones);
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

  const milestone = await prisma.milestone.create({
    data: {
      projectId: params.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      status: parsed.data.status,
    },
  });
  return NextResponse.json(milestone);
}
