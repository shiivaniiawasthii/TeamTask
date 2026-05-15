import { prisma } from "@/lib/prisma";

/**
 * Create one in-app notification per recipient.
 *
 * `userIds` is deduped automatically. The `actorId` (the user who caused the
 * event) is excluded so people don't get notified about their own actions.
 *
 * This is the SINGLE entry point for in-app notifications — call this anywhere
 * an event should appear in someone's bell dropdown. Pair it with the
 * corresponding email-sending function where appropriate.
 */
export async function createNotifications(opts: {
  userIds: string[];
  actorId?: string;
  type:
    | "ASSIGNED"
    | "UNASSIGNED"
    | "STATUS_CHANGE"
    | "TASK_EDITED"
    | "COMMENT"
    | "SUBTASK_CREATED"
    | "DUE_DATE_CHANGED"
    | "SPRINT_CREATED"
    | "SPRINT_UPDATED"
    | "COMPLETED"
    | "INVITED";
  title: string;
  message?: string;
  link: string;
}) {
  // Dedupe + drop the actor.
  const targets = Array.from(
    new Set(opts.userIds.filter((id) => !!id && id !== opts.actorId)),
  );
  if (targets.length === 0) return;

  await prisma.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: opts.type,
      title: opts.title,
      message: opts.message ?? null,
      link: opts.link,
    })),
  });
}
