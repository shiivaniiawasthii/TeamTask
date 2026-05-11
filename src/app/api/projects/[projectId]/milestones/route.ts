import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canViewProject, requireUser } from "@/lib/session";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["UPCOMING", "REACHED", "MISSED"]).default("UPCOMING"),
  // Multi-sprint association (new). Backward-compat: also accept legacy sprintId.
  sprintIds: z.array(z.string()).optional(),
  sprintId: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  if (!(await canViewProject(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const milestones = await prisma.milestone.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { tasks: true } },
      sprintLinks: {
        include: { sprint: { select: { id: true, name: true, status: true } } },
      },
    },
  });
  // Flatten sprintLinks → sprints for the client.
  return NextResponse.json(
    milestones.map((m) => ({
      ...m,
      sprints: m.sprintLinks.map((l) => l.sprint),
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  if (!(await canViewProject(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Resolve sprint links: prefer sprintIds[]; fall back to legacy sprintId.
  const sprintIds =
    parsed.data.sprintIds && parsed.data.sprintIds.length > 0
      ? parsed.data.sprintIds
      : parsed.data.sprintId
        ? [parsed.data.sprintId]
        : [];

  const milestone = await prisma.milestone.create({
    data: {
      projectId: params.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      status: parsed.data.status,
      // Keep the legacy single FK populated to the first sprint for backward compat.
      sprintId: sprintIds[0] ?? null,
      sprintLinks: {
        create: sprintIds.map((sprintId) => ({ sprintId })),
      },
    },
    include: {
      sprintLinks: {
        include: { sprint: { select: { id: true, name: true, status: true } } },
      },
    },
  });
  return NextResponse.json({
    ...milestone,
    sprints: milestone.sprintLinks.map((l) => l.sprint),
  });
}
