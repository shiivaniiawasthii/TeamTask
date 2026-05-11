import { EmailClient, EmailMessage } from "@azure/communication-email";

/**
 * Eagerly instantiate the Azure Communication Services EmailClient at module
 * load. This avoids paying construction cost on the first request after a
 * serverless cold start (every Vercel function invocation that needs to send
 * email otherwise pays this on the first .beginSend() call).
 */
function buildClient(): EmailClient | null {
  const conn = process.env.AZURE_COMM_EMAIL_CONNECTION_STRING;
  if (!conn) {
    console.warn(
      "[mailer] AZURE_COMM_EMAIL_CONNECTION_STRING missing — emails will be no-ops",
    );
    return null;
  }
  try {
    return new EmailClient(conn);
  } catch (e) {
    console.error("[mailer] Failed to construct EmailClient:", e);
    return null;
  }
}

// Eager singleton (per Node.js process / serverless function instance).
const client: EmailClient | null = buildClient();

export function replyToForTask(taskId: string) {
  const local = process.env.EMAIL_DOMAIN_LOCAL ?? "DoNotReply";
  const domain = process.env.EMAIL_DOMAIN ?? "cognifai.in";
  return `${local}+task-${taskId}@${domain}`;
}

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

export type SendMailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send an email. Returns a typed result instead of throwing so callers can
 * report meaningful errors to users.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  inReplyTo?: string;
}): Promise<SendMailResult> {
  if (!client) {
    console.warn("[mailer] No client configured — skipped:", opts.subject);
    return { ok: false, error: "Email service not configured on the server." };
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

  try {
    const poller = await client.beginSend(message);
    const result = await poller.pollUntilDone();
    return { ok: true, id: result.id };
  } catch (e: any) {
    console.error("[mailer] beginSend failed for", opts.to, ":", e?.message ?? e);
    return {
      ok: false,
      error: e?.message ?? "Failed to send email — please try again.",
    };
  }
}
