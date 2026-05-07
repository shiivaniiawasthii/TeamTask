/**
 * Long-running IMAP poller. Run with:
 *   npm run email:poll
 *
 * Polls the inbox at IMAP_POLL_INTERVAL_MS, looks for new UNSEEN messages
 * sent to <local>+task-<id>@<domain>, parses the reply, and either:
 *  - appends a comment to the referenced task, or
 *  - falls back to creating a new task in the user's first shared project
 *    if the address has no task id.
 */
import Imap from "node-imap";
import { simpleParser, ParsedMail, AddressObject } from "mailparser";
import { PrismaClient } from "@prisma/client";
import { taskIdFromAddress } from "./mailer";

const prisma = new PrismaClient();

const HOST = process.env.IMAP_HOST!;
const PORT = Number(process.env.IMAP_PORT ?? 993);
const TLS = process.env.IMAP_TLS !== "false";
const USER = process.env.IMAP_USER!;
const PASS = process.env.IMAP_PASS!;
const MAILBOX = process.env.IMAP_MAILBOX ?? "INBOX";
const INTERVAL = Number(process.env.IMAP_POLL_INTERVAL_MS ?? 60000);

if (!HOST || !USER || !PASS) {
  console.error("[imap] Missing IMAP_HOST / IMAP_USER / IMAP_PASS — exiting");
  process.exit(1);
}

function connect() {
  return new Imap({
    user: USER,
    password: PASS,
    host: HOST,
    port: PORT,
    tls: TLS,
    tlsOptions: { rejectUnauthorized: false },
    keepalive: true,
  });
}

function addressList(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: string[] = [];
  for (const obj of arr) {
    for (const addr of obj.value) {
      if (addr.address) out.push(addr.address);
    }
  }
  return out;
}

/** Strip quoted reply text (lines starting with > and "On … wrote:" footer). */
function cleanReplyBody(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:\s*$/.test(line)) break;
    if (/^-----Original Message-----/.test(line)) break;
    if (/^From: /.test(line) && out.length > 0) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

async function findOrCreateUserByEmail(email: string) {
  const lower = email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: lower } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: lower, name: lower.split("@")[0] },
    });
  }
  return user;
}

async function handleMessage(parsed: ParsedMail) {
  const messageId = parsed.messageId;
  if (!messageId) return;

  const dup = await prisma.processedEmail.findUnique({ where: { messageId } });
  if (dup) return;

  const fromAddr = parsed.from?.value[0]?.address?.toLowerCase();
  if (!fromAddr) return;

  const candidates = [
    ...addressList(parsed.to),
    ...addressList(parsed.cc),
    ...addressList((parsed.headers.get("delivered-to") as any) ?? undefined),
    ...addressList((parsed.headers.get("envelope-to") as any) ?? undefined),
  ];

  let taskId: string | null = null;
  for (const a of candidates) {
    taskId = taskIdFromAddress(a);
    if (taskId) break;
  }

  const body = cleanReplyBody(parsed.text ?? "");
  if (!body) {
    console.log(`[imap] skipping empty body from ${fromAddr}`);
    return;
  }

  const user = await findOrCreateUserByEmail(fromAddr);

  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: { where: { userId: user.id } } } } },
    });
    if (!task) {
      console.warn(`[imap] task ${taskId} not found for ${fromAddr}`);
    } else if (task.project.members.length === 0) {
      console.warn(`[imap] ${fromAddr} is not a member of project ${task.projectId}; ignoring`);
    } else {
      await prisma.comment.create({
        data: {
          taskId: task.id,
          authorId: user.id,
          authorEmail: fromAddr,
          body,
          source: "email",
        },
      });
      console.log(`[imap] appended comment to task ${task.id} from ${fromAddr}`);
    }
  } else {
    // No task id — try to create a new task in any project the sender belongs to.
    const member = await prisma.projectMember.findFirst({
      where: { userId: user.id },
      include: { project: true },
    });
    if (!member) {
      console.warn(`[imap] ${fromAddr} has no projects; ignoring`);
    } else {
      const subject = parsed.subject?.replace(/^(Re:|Fwd?:)\s*/i, "").trim() || "Untitled task";
      const last = await prisma.task.findFirst({
        where: { projectId: member.projectId, status: "TODO" },
        orderBy: { position: "desc" },
      });
      const task = await prisma.task.create({
        data: {
          projectId: member.projectId,
          title: subject.slice(0, 200),
          description: body,
          status: "TODO",
          priority: "MEDIUM",
          creatorId: user.id,
          position: (last?.position ?? -1) + 1,
        },
      });
      console.log(
        `[imap] created task ${task.id} in project ${member.project.key} from ${fromAddr}`,
      );
    }
  }

  await prisma.processedEmail.create({
    data: { messageId, taskId: taskId ?? undefined },
  });
}

function fetchUnseen(imap: Imap): Promise<void> {
  return new Promise((resolve, reject) => {
    imap.search(["UNSEEN"], (err, uids) => {
      if (err) return reject(err);
      if (!uids || uids.length === 0) return resolve();
      const f = imap.fetch(uids, { bodies: "", markSeen: true });
      const tasks: Promise<void>[] = [];
      f.on("message", (msg) => {
        tasks.push(
          new Promise((res) => {
            const chunks: Buffer[] = [];
            msg.on("body", (stream) => {
              stream.on("data", (c: Buffer) => chunks.push(c));
            });
            msg.once("end", async () => {
              const buf = Buffer.concat(chunks);
              try {
                const parsed = await simpleParser(buf);
                await handleMessage(parsed);
              } catch (e) {
                console.error("[imap] parse error", e);
              }
              res();
            });
          }),
        );
      });
      f.once("error", reject);
      f.once("end", () => Promise.all(tasks).then(() => resolve()).catch(reject));
    });
  });
}

async function pollOnce() {
  await new Promise<void>((resolve, reject) => {
    const imap = connect();
    imap.once("ready", () => {
      imap.openBox(MAILBOX, false, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }
        fetchUnseen(imap)
          .then(() => {
            imap.end();
            resolve();
          })
          .catch((e) => {
            imap.end();
            reject(e);
          });
      });
    });
    imap.once("error", (e: Error) => reject(e));
    imap.connect();
  });
}

async function main() {
  console.log(`[imap] starting poller, interval=${INTERVAL}ms, mailbox=${MAILBOX}`);
  while (true) {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[imap] poll error", e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
