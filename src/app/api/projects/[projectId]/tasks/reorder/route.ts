import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"]),
      position: z.number().int().nonnegative(),
    }),
  ),
});

export async function POST(
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

  await prisma.$transaction(
    parsed.data.updates.map((u) =>
      prisma.task.update({
        where: { id: u.id },
        data: { status: u.status, position: u.position },
      }),
    ),
  );
  return NextResponse.json({ ok: true });
}
