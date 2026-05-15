import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { canManageMembers, requireUser } from "@/lib/session";
import { sendInvitationEmail } from "@/server/email/notifications";
import { generateTempPassword } from "@/lib/email-policy";

/**
 * Resend a pending invitation.
 *
 * What this does:
 *   1. Confirm the requester can manage members (ADMIN or PROJECT_MANAGER).
 *   2. Confirm the invitation is still PENDING.
 *   3. Reset the invitee's temp password (rotate, since we can't recover the
 *      original — we only stored the hash) and bump the expiry by 7 days.
 *   4. Re-send the invitation email with the new credentials.
 *
 * The previous temp password becomes invalid the moment we rotate the hash —
 * which is correct, since "missed the email" implies it was never used and
 * rotating costs nothing.
 */
const EXPIRY_DAYS = 7;

export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string; invitationId: string } },
) {
  const user = await requireUser();
  if (!(await canManageMembers(params.projectId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inv = await prisma.invitation.findUnique({
    where: { id: params.invitationId },
    select: {
      id: true,
      email: true,
      projectId: true,
      status: true,
    },
  });
  if (!inv || inv.projectId !== params.projectId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (inv.status !== "PENDING") {
    return NextResponse.json(
      { error: `Invitation is already ${inv.status.toLowerCase()}.` },
      { status: 400 },
    );
  }

  // Rotate the temp password on the invitee's user row.
  const userRow = await prisma.user.findUnique({
    where: { email: inv.email },
    select: { id: true, mustChangePassword: true },
  });

  let tempPassword: string | undefined;
  if (userRow) {
    // Only rotate if the user hasn't already activated their account.
    // (If they accepted but the invite row was somehow left PENDING, we
    // shouldn't reset their real password.)
    if (userRow.mustChangePassword) {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await prisma.user.update({
        where: { id: userRow.id },
        data: { passwordHash, mustChangePassword: true },
      });
    }
  }

  // Push the expiry forward and bump createdAt so the pending list reflects
  // the resend in chronological order.
  await prisma.invitation.update({
    where: { id: inv.id },
    data: {
      expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await sendInvitationEmail(inv.id, tempPassword).catch((e) =>
    console.error("invite email (resend)", e),
  );

  return NextResponse.json({ ok: true });
}
