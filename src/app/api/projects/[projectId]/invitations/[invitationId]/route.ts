import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageMembers, requireUser } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; invitationId: string } },
) {
  const user = await requireUser();
  if (!(await canManageMembers(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.invitation.deleteMany({
    where: { id: params.invitationId, projectId: params.projectId },
  });
  return NextResponse.json({ ok: true });
}
