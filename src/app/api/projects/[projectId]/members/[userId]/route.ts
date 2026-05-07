import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isProjectAdmin, requireUser } from "@/lib/session";

const patchSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

async function adminCount(projectId: string) {
  return prisma.projectMember.count({
    where: { projectId, role: "ADMIN" },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; userId: string } },
) {
  const user = await requireUser();
  if (!(await isProjectAdmin(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
    if ((await adminCount(params.projectId)) <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last admin" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
    data: { role: parsed.data.role },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; userId: string } },
) {
  const user = await requireUser();
  if (!(await isProjectAdmin(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "ADMIN" && (await adminCount(params.projectId)) <= 1) {
    return NextResponse.json(
      { error: "Cannot remove the last admin" },
      { status: 400 },
    );
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId: params.projectId, userId: params.userId } },
  });
  return NextResponse.json({ ok: true });
}
