import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { canManageMembers, requireUser } from "@/lib/session";
import { sendInvitationEmail } from "@/server/email/notifications";
import { generateTempPassword } from "@/lib/email-policy";
import { createNotifications } from "@/server/notifications";

const schema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  role: z
    .enum(["ADMIN", "PROJECT_MANAGER", "LEAD", "MEMBER"])
    .default("MEMBER"),
  // Access duration in days. null/undefined = no expiry. Min 30 (admin can
  // still override below in the UI; this is a sanity floor).
  accessDurationDays: z
    .union([z.number().int().min(30).max(3650), z.null()])
    .optional(),
});

const EXPIRY_DAYS = 7;

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await requireUser();
  if (!(await canManageMembers(params.projectId, user.id))) {
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
  if (!(await canManageMembers(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  // Membership expiry: applies to the ProjectMember row, not the Invitation.
  // null = no expiry; otherwise N days from now.
  const memberExpiresAt =
    typeof parsed.data.accessDurationDays === "number"
      ? new Date(
          Date.now() + parsed.data.accessDurationDays * 24 * 60 * 60 * 1000,
        )
      : null;
  const created: {
    email: string;
    status: "invited" | "already_member";
  }[] = [];

  // Look up the project once for the notification message.
  const projectForNotice = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { name: true },
  });

  for (const rawEmail of parsed.data.emails) {
    const email = rawEmail.toLowerCase().trim();

    // NOTE: per policy, invites are allowed to ANY email domain. Only
    // self-registration is locked to @cognifai.in. So we do NOT check
    // isAllowedEmail here — the sender's permission to invite was already
    // validated via canManageMembers above.

    // Find or create the user. New users get a system-generated temp password
    // (the email contains it). They'll be forced to change it on first login.
    //
    // Re-invite case: if a user already exists but hasn't activated yet
    // (mustChangePassword still true — e.g. they missed the first email,
    // or were removed and re-invited), rotate their temp password so the
    // new email has working credentials.
    let userRow = await prisma.user.findUnique({ where: { email } });
    let tempPassword: string | null = null;
    if (!userRow) {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      userRow = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: null,
          mustChangePassword: true,
        },
      });
    } else if (userRow.mustChangePassword) {
      // Existing stub user who never activated — rotate creds so the email
      // we're about to send actually works.
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await prisma.user.update({
        where: { id: userRow.id },
        data: { passwordHash },
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
        expiresAt: memberExpiresAt,
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

    sendInvitationEmail(invitationId, tempPassword ?? undefined).catch((e) =>
      console.error("invite email", e),
    );

    // In-app notification for the invitee. They'll see it next time they log
    // in (or right away if they have an existing active session in another
    // project).
    await createNotifications({
      userIds: [userRow.id],
      actorId: user.id,
      type: "INVITED",
      title: `You were invited to ${projectForNotice?.name ?? "a project"}`,
      message: memberExpiresAt
        ? `Access expires ${memberExpiresAt.toDateString()}. Check your email to set a password.`
        : "Check your email to set a password.",
      link: `/projects/${params.projectId}/board`,
    });

    created.push({ email, status: "invited" });
  }

  return NextResponse.json({ results: created });
}
