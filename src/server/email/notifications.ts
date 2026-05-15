import { prisma } from "@/lib/prisma";
import { replyToForTask, sendMail } from "./mailer";

/**
 * Resolve the canonical app URL for building email links.
 *
 * In production, we read NEXTAUTH_URL (e.g. https://app.cognifai.in).
 * If that env var is missing or wrong, every email link would 404 ("Deployment
 * Not Found" on Vercel when the URL points to a deleted preview).
 *
 * Fallback chain:
 *   1. NEXTAUTH_URL (explicit, set by us)
 *   2. APP_URL (allow opt-in override)
 *   3. https://${VERCEL_URL} (auto-set by Vercel on every deployment)
 *   4. http://localhost:3000 (dev)
 */
function resolveAppUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const APP_URL = resolveAppUrl();

function taskUrl(projectId: string, taskId: string) {
  return `${APP_URL}/projects/${projectId}/board?task=${taskId}`;
}

function footer(taskId: string) {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
    <p style="font-size:12px;color:#6b7280">
      Tip: reply to this email to add a comment on this task. The reply-to address
      is unique to this task — keep it intact.
    </p>
  `;
}

export async function sendAssignmentEmail(task: {
  id: string;
  title: string;
  projectId: string;
  assigneeId: string | null;
  assignee?: { email: string; name: string | null } | null;
  project?: { name: string } | null;
}) {
  if (!task.assigneeId) return;
  const assignee =
    task.assignee ??
    (await prisma.user.findUnique({
      where: { id: task.assigneeId },
      select: { email: true, name: true },
    }));
  if (!assignee?.email) return;
  const project =
    task.project ??
    (await prisma.project.findUnique({
      where: { id: task.projectId },
      select: { name: true },
    }));

  const url = taskUrl(task.projectId, task.id);
  await sendMail({
    to: assignee.email,
    subject: `[${project?.name ?? "Team Tasks"}] You were assigned: ${task.title}`,
    replyTo: replyToForTask(task.id),
    html: `
      <p>Hi ${assignee.name ?? ""},</p>
      <p>You've been assigned a task in <strong>${project?.name ?? "a project"}</strong>:</p>
      <p style="font-size:16px;font-weight:600">${escapeHtml(task.title)}</p>
      <p><a href="${url}">Open in Team Tasks →</a></p>
      ${footer(task.id)}
    `,
    text: `You were assigned: ${task.title}\n\nOpen: ${url}\n\nReply to this email to add a comment.`,
  });
}

export async function sendCommentEmail(
  taskId: string,
  authorId: string,
  body: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, email: true, name: true } },
      creator: { select: { id: true, email: true, name: true } },
    },
  });
  if (!task) return;

  const recipients = new Set<string>();
  if (task.assignee && task.assignee.id !== authorId)
    recipients.add(task.assignee.email);
  if (task.creator && task.creator.id !== authorId)
    recipients.add(task.creator.email);

  if (recipients.size === 0) return;

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { name: true, email: true },
  });

  const url = taskUrl(task.project.id, task.id);
  await Promise.all(
    Array.from(recipients).map((to) =>
      sendMail({
        to,
        subject: `[${task.project.name}] New comment on: ${task.title}`,
        replyTo: replyToForTask(task.id),
        html: `
          <p><strong>${escapeHtml(author?.name ?? author?.email ?? "Someone")}</strong> commented on <strong>${escapeHtml(task.title)}</strong>:</p>
          <blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;color:#374151">
            ${escapeHtml(body).replace(/\n/g, "<br/>")}
          </blockquote>
          <p><a href="${url}">View task →</a></p>
          ${footer(task.id)}
        `,
        text: `${author?.name ?? author?.email ?? "Someone"} commented on ${task.title}:\n\n${body}\n\nView: ${url}`,
      }),
    ),
  );
}

export async function sendDueReminderEmail(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { email: true, name: true } },
    },
  });
  if (!task || !task.assignee?.email || !task.endDate) return;
  const url = taskUrl(task.project.id, task.id);
  await sendMail({
    to: task.assignee.email,
    subject: `[${task.project.name}] Due ${task.endDate.toDateString()}: ${task.title}`,
    replyTo: replyToForTask(task.id),
    html: `
      <p>Reminder: <strong>${escapeHtml(task.title)}</strong> ends on
        <strong>${task.endDate.toDateString()}</strong>.</p>
      <p><a href="${url}">Open task →</a></p>
      ${footer(task.id)}
    `,
    text: `Ends ${task.endDate.toDateString()}: ${task.title}\n${url}`,
  });

  await prisma.task.update({
    where: { id: taskId },
    data: { endReminderSentAt: new Date() },
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string | null,
  token: string,
  expiresAt: Date,
) {
  const url = `${APP_URL}/reset-password/${token}`;
  return sendMail({
    to: email,
    subject: "Reset your password",
    html: `
      <p>Hi ${name ? escapeHtml(name) : ""},</p>
      <p>We received a request to reset your password. Click the button below to set a new one:</p>
      <p><a href="${url}" style="display:inline-block;background:#7c2d77;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Reset password →</a></p>
      <p style="font-size:12px;color:#6b7280">
        This link expires on ${expiresAt.toDateString()} ${expiresAt.toTimeString().slice(0, 5)}.
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <p style="font-size:12px;color:#6b7280">Or paste this link into your browser:<br/>${url}</p>
    `,
    text: `Reset your password: ${url}\n\nExpires ${expiresAt.toISOString()}.\n\nIf you didn't request this, ignore this email.`,
  });
}

export async function sendCompletionEmail(
  taskId: string,
  completedById: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, email: true, name: true } },
      assignees: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  if (!task) return;

  const completedBy = await prisma.user.findUnique({
    where: { id: completedById },
    select: { name: true, email: true },
  });

  const recipients = new Map<string, { email: string; name: string | null }>();
  for (const a of task.assignees) {
    if (a.user.id !== completedById)
      recipients.set(a.user.email, { email: a.user.email, name: a.user.name });
  }
  if (task.creator && task.creator.id !== completedById) {
    recipients.set(task.creator.email, {
      email: task.creator.email,
      name: task.creator.name,
    });
  }
  if (recipients.size === 0) return;

  const url = taskUrl(task.project.id, task.id);
  const completerName = completedBy?.name ?? completedBy?.email ?? "Someone";

  await Promise.all(
    Array.from(recipients.values()).map((r) =>
      sendMail({
        to: r.email,
        subject: `[${task.project.name}] ✅ Completed: ${task.title}`,
        replyTo: replyToForTask(task.id),
        html: `
          <p>Hi ${r.name ?? ""},</p>
          <p><strong>${escapeHtml(completerName)}</strong> marked this task as
            <strong>Done</strong>:</p>
          <p style="font-size:16px;font-weight:600">${escapeHtml(task.title)}</p>
          <p><a href="${url}">View task →</a></p>
          ${footer(task.id)}
        `,
        text: `${completerName} marked done: ${task.title}\n\n${url}`,
      }),
    ),
  );
}

/**
 * Generic per-task activity notification.
 *
 * Used for status changes, title/description edits, priority changes, etc. —
 * any update that's NOT already covered by a dedicated email (assignment,
 * completion, comment, due reminder).
 *
 * Sends to every current assignee EXCEPT the actor (no self-notify).
 * The `summary` should be a complete, human-readable sentence describing the
 * change (e.g. "Alice changed the status from TODO to IN_PROGRESS").
 */
export async function sendTaskActivityEmail(opts: {
  taskId: string;
  actorId: string;
  summary: string;
  details?: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: {
      project: { select: { id: true, name: true } },
      assignees: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  if (!task) return;

  // Only notify other assignees — skip the user who made the change.
  const recipients = task.assignees
    .map((a) => a.user)
    .filter((u) => u.id !== opts.actorId && !!u.email);
  if (recipients.length === 0) return;

  const url = taskUrl(task.project.id, task.id);

  await Promise.all(
    recipients.map((r) =>
      sendMail({
        to: r.email,
        subject: `[${task.project.name}] Update: ${task.title}`,
        replyTo: replyToForTask(task.id),
        html: `
          <p>Hi ${r.name ? escapeHtml(r.name) : ""},</p>
          <p>${escapeHtml(opts.summary)}</p>
          <p style="font-size:16px;font-weight:600">${escapeHtml(task.title)}</p>
          ${opts.details ? `<blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;color:#374151">${escapeHtml(opts.details)}</blockquote>` : ""}
          <p><a href="${url}">View task →</a></p>
          ${footer(task.id)}
        `,
        text: `${opts.summary}\n\n${task.title}\n\n${url}`,
      }),
    ),
  );
}

/**
 * Sent when a task is past its due date and the work isn't DONE yet.
 * Triggered by the cron — fires once per task (marked via overdueReminderSentAt).
 */
export async function sendOverdueReminderEmail(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      assignees: {
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });
  if (!task || !task.endDate) return;

  const recipients = task.assignees.map((a) => a.user).filter((u) => !!u.email);
  if (recipients.length === 0) return;

  const url = taskUrl(task.project.id, task.id);
  const dueStr = task.endDate.toDateString();

  await Promise.all(
    recipients.map((r) =>
      sendMail({
        to: r.email,
        subject: `[${task.project.name}] ⚠️ Overdue: ${task.title}`,
        replyTo: replyToForTask(task.id),
        html: `
          <p>Hi ${r.name ? escapeHtml(r.name) : ""},</p>
          <p>This task is <strong style="color:#b91c1c">overdue</strong>.
            It was due on <strong>${dueStr}</strong> and is still open.</p>
          <p style="font-size:16px;font-weight:600">${escapeHtml(task.title)}</p>
          <p><a href="${url}">Open task →</a></p>
          ${footer(task.id)}
        `,
        text: `Overdue: ${task.title} (was due ${dueStr})\n\n${url}`,
      }),
    ),
  );

  // Mark sent so subsequent cron runs don't resend.
  await prisma.task.update({
    where: { id: taskId },
    data: { overdueReminderSentAt: new Date() },
  });
}

export async function sendInvitationEmail(
  invitationId: string,
  tempPassword?: string,
) {
  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: {
      project: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!inv) return;
  const acceptUrl = `${APP_URL}/accept-invite/${inv.token}`;
  const loginUrl = `${APP_URL}/login`;
  const inviterName = inv.invitedBy.name ?? inv.invitedBy.email;

  // If we generated a temp password for a new user, show their credentials
  // and direct them to sign in (they'll be forced to change the password).
  // If they're an existing user, just send the accept link.
  const credentialsBlock = tempPassword
    ? `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:16px 0">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Your temporary credentials:</p>
        <p style="margin:0;font-family:monospace;font-size:14px">
          Email: <strong>${escapeHtml(inv.email)}</strong><br/>
          Password: <strong>${escapeHtml(tempPassword)}</strong>
        </p>
        <p style="margin:8px 0 0;font-size:12px;color:#6b7280">
          You'll be asked to set a new password on first sign-in.
        </p>
      </div>
    `
    : "";

  const primaryUrl = tempPassword ? loginUrl : acceptUrl;
  const buttonLabel = tempPassword ? "Sign in →" : "Accept invitation →";

  await sendMail({
    to: inv.email,
    subject: `${inviterName} invited you to ${inv.project.name}`,
    html: `
      <p>Hi,</p>
      <p><strong>${escapeHtml(inviterName)}</strong> invited you to join
        <strong>${escapeHtml(inv.project.name)}</strong> as
        <strong>${inv.role}</strong> on CognifAI.</p>
      ${credentialsBlock}
      <p><a href="${primaryUrl}" style="display:inline-block;background:#7c2d77;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${buttonLabel}</a></p>
      <p style="font-size:12px;color:#6b7280">This invitation expires on
        ${inv.expiresAt.toDateString()}. Or paste this link into your browser:<br/>${primaryUrl}</p>
    `,
    text:
      `${inviterName} invited you to join "${inv.project.name}" as ${inv.role}.\n\n` +
      (tempPassword
        ? `Temporary credentials:\nEmail: ${inv.email}\nPassword: ${tempPassword}\n\nSign in: ${loginUrl}\n\n`
        : `Accept: ${acceptUrl}\n\n`) +
      `Expires ${inv.expiresAt.toDateString()}.`,
  });
}

export async function sendInvitationAcceptedEmail(
  projectId: string,
  accepterName: string,
  accepterEmail: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) return;

  const admins = await prisma.projectMember.findMany({
    where: {
      projectId,
      role: { in: ["ADMIN", "PROJECT_MANAGER"] },
    },
    include: { user: { select: { email: true, name: true } } },
  });

  const memberUrl = `${APP_URL}/projects/${projectId}/members`;
  const adminEmails = admins
    .map((m) => m.user.email)
    .filter(Boolean) as string[];

  if (adminEmails.length === 0) return;

  await Promise.all(
    adminEmails.map((email) =>
      sendMail({
        to: email,
        subject: `${accepterName} joined ${project.name}`,
        html: `
          <p>Hi,</p>
          <p><strong>${escapeHtml(accepterName)}</strong> (${escapeHtml(accepterEmail)}) accepted the invitation to join <strong>${escapeHtml(project.name)}</strong>.</p>
          <p><a href="${memberUrl}" style="display:inline-block;background:#7c2d77;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View members →</a></p>
        `,
        text: `${accepterName} (${accepterEmail}) joined ${project.name}.\n\nView members: ${memberUrl}`,
      }),
    ),
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
