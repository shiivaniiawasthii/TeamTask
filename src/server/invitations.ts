import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/server/notifications";
import { sendInvitationAcceptedEmail } from "@/server/email/notifications";

/**
 * Reconcile PENDING invitations against actual project membership.
 *
 * Why this exists: the invite POST creates a `ProjectMember` row immediately
 * (so the invitee is assignable / mentionable right away) AND a PENDING
 * `Invitation` row. The only thing that flips the invite to ACCEPTED is the
 * user visiting `/invitations/<token>` after logging in.
 *
 * In practice, invitees usually skip that step — they log in with the temp
 * password and go straight to /dashboard. The result is an invitation stuck
 * at PENDING for someone who is, in every observable way, already a member.
 *
 * This helper fixes that by marking such invites ACCEPTED whenever it's safe
 * to do so, AND fires the same admin notification + email that the explicit
 * accept handler does — so admins find out (in-app + email) regardless of
 * which path the invitee took. Called from the members page server query and
 * from the invitations GET endpoint.
 */
export async function reconcilePendingInvitations(projectId: string) {
  const pending = await prisma.invitation.findMany({
    where: { projectId, status: "PENDING" },
    select: { id: true, email: true, invitedById: true },
  });
  if (pending.length === 0) return;

  // Lowercase + dedupe the emails we need to look up.
  const emails = Array.from(new Set(pending.map((p) => p.email.toLowerCase())));

  // Find which of those emails belong to a user who's already a member of
  // this project. We pull id + name + email so we can fire notifications
  // without a second roundtrip per accepter.
  const memberUsers = await prisma.user.findMany({
    where: {
      email: { in: emails, mode: "insensitive" },
      memberships: { some: { projectId } },
    },
    select: { id: true, name: true, email: true },
  });
  if (memberUsers.length === 0) return;

  const memberByEmail = new Map(
    memberUsers.map((u) => [u.email.toLowerCase(), u]),
  );
  const toAccept = pending.flatMap((p) => {
    const u = memberByEmail.get(p.email.toLowerCase());
    return u
      ? [{ invitationId: p.id, accepter: u, invitedById: p.invitedById }]
      : [];
  });
  if (toAccept.length === 0) return;

  // Find admins / PMs once + project name for nicer notification copy.
  const [adminMemberships, projectMeta] = await Promise.all([
    prisma.projectMember.findMany({
      where: {
        projectId,
        role: { in: ["ADMIN", "PROJECT_MANAGER"] },
      },
      select: { userId: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    }),
  ]);
  const adminUserIds = adminMemberships.map((m) => m.userId);
  const projectName = projectMeta?.name ?? "the project";

  // Per-row CAS update: only fire notifications for invites that THIS call
  // actually flipped from PENDING. If two tabs/polls race, only one wins per
  // row, so no one gets duplicate notifications/emails.
  await Promise.all(
    toAccept.map(async ({ invitationId, accepter, invitedById }) => {
      const result = await prisma.invitation.updateMany({
        where: { id: invitationId, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      // Lost the race — another caller already reconciled this invite.
      if (result.count === 0) return;

      const accepterName = accepter.name ?? accepter.email;

      // 1) Admins + project managers ("Alice joined the project").
      if (adminUserIds.length > 0) {
        await createNotifications({
          userIds: adminUserIds,
          actorId: accepter.id,
          type: "INVITED",
          title: `${accepterName} joined ${projectName}`,
          link: `/projects/${projectId}/members`,
        }).catch((e) => console.error("reconcile notify (admins)", e));
      }

      // 2) The original inviter ("Alice accepted your invitation").
      // Skipped if the inviter is also the accepter (sanity guard) — the
      // actorId filter in createNotifications handles this, but being
      // explicit makes the intent clear.
      if (invitedById && invitedById !== accepter.id) {
        await createNotifications({
          userIds: [invitedById],
          actorId: accepter.id,
          type: "INVITED",
          title: `${accepterName} accepted your invitation`,
          message: `To ${projectName}`,
          link: `/projects/${projectId}/members`,
        }).catch((e) => console.error("reconcile notify (inviter)", e));
      }

      // 3) The accepter themselves — welcome ping with a deep-link into the
      // project. This is the notification the new user sees first time they
      // open their bell.
      await createNotifications({
        userIds: [accepter.id],
        type: "INVITED",
        title: `Welcome to ${projectName}`,
        message: "You're now a member. Click to open the board.",
        link: `/projects/${projectId}/board`,
      }).catch((e) => console.error("reconcile notify (welcome)", e));

      // Email to admins (uses existing helper).
      await sendInvitationAcceptedEmail(
        projectId,
        accepterName,
        accepter.email,
      ).catch((e) => console.error("reconcile notify (email)", e));
    }),
  );
}
