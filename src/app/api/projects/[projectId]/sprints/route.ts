import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1),
  goal: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).default("PLANNED"),
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

  const sprints = await prisma.sprint.findMany({
    where: { projectId: params.projectId },
    orderBy: { startDate: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
  return NextResponse.json(sprints);
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

  const sprint = await prisma.sprint.create({
    data: {
      projectId: params.projectId,
      name: parsed.data.name,
      goal: parsed.data.goal,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      status: parsed.data.status,
    },
  });
  return NextResponse.json(sprint);
}
