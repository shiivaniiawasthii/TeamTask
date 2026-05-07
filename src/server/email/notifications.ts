import { prisma } from "@/lib/prisma";
import { replyToForTask, sendMail } from "./mailer";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

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

export async function sendCommentEmail(taskId: string, authorId: string, body: string) {
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
  if (task.assignee && task.assignee.id !== authorId) recipients.add(task.assignee.email);
  if (task.creator && task.creator.id !== authorId) recipients.add(task.creator.email);

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

export async function sendInvitationEmail(invitationId: string) {
  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: {
      project: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!inv) return;
  const url = `${APP_URL}/accept-invite/${inv.token}`;
  const inviterName = inv.invitedBy.name ?? inv.invitedBy.email;
  await sendMail({
    to: inv.email,
    subject: `${inviterName} invited you to ${inv.project.name}`,
    html: `
      <p>Hi,</p>
      <p><strong>${escapeHtml(inviterName)}</strong> invited you to join
        <strong>${escapeHtml(inv.project.name)}</strong> as
        <strong>${inv.role}</strong> on Team Tasks.</p>
      <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invitation →</a></p>
      <p style="font-size:12px;color:#6b7280">This invitation expires on
        ${inv.expiresAt.toDateString()}. Or paste this link into your browser:<br/>${url}</p>
    `,
    text: `${inviterName} invited you to join "${inv.project.name}" as ${inv.role}.\n\nAccept: ${url}\n\nExpires ${inv.expiresAt.toDateString()}.`,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
