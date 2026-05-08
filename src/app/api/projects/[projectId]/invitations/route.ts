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
  const created: {
    email: string;
    status: "invited" | "already_member";
  }[] = [];

  for (const rawEmail of parsed.data.emails) {
    const email = rawEmail.toLowerCase().trim();

    // Find or create the user. If they don't exist, create a stub with no password.
    let userRow = await prisma.user.findUnique({ where: { email } });
    if (!userRow) {
      userRow = await prisma.user.create({
        data: { email, passwordHash: null, name: null },
      });
    }

    // Skip if already a member (re-inviting an existing member is a no-op).
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: params.projectId, userId: userRow.id },
      },
    });
    if (existingMember) {
      created.push({ email, status: "already_member" });
      continue;
    }

    // Add them as a project member RIGHT NOW so they're assignable immediately.
    await prisma.projectMember.create({
      data: {
        projectId: params.projectId,
        userId: userRow.id,
        role: parsed.data.role,
      },
    });

    // Reuse any existing pending invite, or create a fresh token.
    const existingInvite = await prisma.invitation.findFirst({
      where: { projectId: params.projectId, email, status: "PENDING" },
    });

    let invitationId: string;
    if (existingInvite) {
      invitationId = existingInvite.id;
    } else {
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
      invitationId = inv.id;
    }

    sendInvitationEmail(invitationId).catch((e) =>
      console.error("invite email", e),
    );
    created.push({ email, status: "invited" });
  }

  return NextResponse.json({ results: created });
}
