import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({ snapshot: z.any() });

export async function PUT(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.projectId, userId: user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const snapshotStr = JSON.stringify(parsed.data.snapshot ?? null);
  await prisma.whiteboard.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      snapshot: snapshotStr,
      updatedBy: user.id,
    },
    update: { snapshot: snapshotStr, updatedBy: user.id },
  });

  return NextResponse.json({ ok: true });
}
