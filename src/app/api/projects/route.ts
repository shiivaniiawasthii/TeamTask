import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/),
  color: z.string().default("#6366f1"),
});

export async function GET() {
  const user = await requireUser();
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const exists = await prisma.project.findUnique({ where: { key: parsed.data.key } });
  if (exists) return NextResponse.json({ error: "Key already in use" }, { status: 409 });

  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      members: { create: { userId: user.id, role: "ADMIN" } },
      whiteboard: { create: {} },
    },
  });
  return NextResponse.json(project);
}
