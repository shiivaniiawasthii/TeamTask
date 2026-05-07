import { EmailClient, EmailMessage } from "@azure/communication-email";

let client: EmailClient | null = null;

function getClient(): EmailClient | null {
  if (client) return client;
  const conn = process.env.AZURE_COMM_EMAIL_CONNECTION_STRING;
  if (!conn) {
    console.warn(
      "[mailer] AZURE_COMM_EMAIL_CONNECTION_STRING missing — emails will be no-ops",
    );
    return null;
  }
  client = new EmailClient(conn);
  return client;
}

/**
 * Build a unique reply-to address for a task.
 * Uses sub-addressing: <local>+task-<id>@<domain>
 */
export function replyToForTask(taskId: string) {
  const local = process.env.EMAIL_DOMAIN_LOCAL ?? "DoNotReply";
  const domain = process.env.EMAIL_DOMAIN ?? "cognifai.in";
  return `${local}+task-${taskId}@${domain}`;
}

/** Pull a task id back out of an inbound To/Delivered-To/Envelope-To address. */
export function taskIdFromAddress(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const m = addr.toLowerCase().match(/\+task-([a-z0-9]+)@/);
  return m?.[1] ?? null;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  inReplyTo?: string;
}) {
  const c = getClient();
  if (!c) {
    console.warn("[mailer] Skipping email (no client):", opts.subject);
    return { id: "skipped" };
  }
  const senderAddress = process.env.EMAIL_FROM ?? "DoNotReply@cognifai.in";

  const message: EmailMessage = {
    senderAddress,
    content: {
      subject: opts.subject,
      plainText: opts.text ?? stripHtml(opts.html),
      html: opts.html,
    },
    recipients: {
      to: [{ address: opts.to }],
    },
    replyTo: opts.replyTo ? [{ address: opts.replyTo }] : undefined,
  };

  const poller = await c.beginSend(message);
  const result = await poller.pollUntilDone();
  return { id: result.id };
}
