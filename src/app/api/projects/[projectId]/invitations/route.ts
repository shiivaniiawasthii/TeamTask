import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isProjectAdmin, requireUser } from "@/lib/session";
import { sendInvitationEmail } from "@/server/email/notifications";

const schema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

const EXPIRY_DAYS = 7;

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  if (!(await isProjectAdmin(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const invitations = await prisma.invitation.findMany({
    where: { projectId: params.projectId, status: "PENDING" },
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(invitations);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  if (!(await isProjectAdmin(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const created: { email: string; status: "invited" | "already_member" | "already_invited" }[] = [];

  for (const rawEmail of parsed.data.emails) {
    const email = rawEmail.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: params.projectId, userId: existingUser.id } },
      });
      if (existingMember) {
        created.push({ email, status: "already_member" });
        continue;
      }
    }

    const existingInvite = await prisma.invitation.findFirst({
      where: { projectId: params.projectId, email, status: "PENDING" },
    });
    if (existingInvite) {
      created.push({ email, status: "already_invited" });
      continue;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const inv = await prisma.invitation.create({
      data: {
        email,
        projectId: params.projectId,
        role: parsed.data.role,
        token,
        invitedById: user.id,
        expiresAt,
      },
    });
    sendInvitationEmail(inv.id).catch((e) => console.error("invite email", e));
    created.push({ email, status: "invited" });
  }

  return NextResponse.json({ results: created });
}
