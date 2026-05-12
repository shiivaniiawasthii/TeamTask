import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendDueReminderEmail,
  sendOverdueReminderEmail,
} from "@/server/email/notifications";

/**
 * Due-date reminder cron.
 *
 * Runs TWO scans on every invocation:
 *
 *  1. PRE-DUE: tasks whose endDate is within the next DUE_REMINDER_HOURS hours
 *     (default 24) and have NOT been notified yet (endReminderSentAt is null).
 *     sendDueReminderEmail() sets endReminderSentAt to make this idempotent.
 *
 *  2. OVERDUE: tasks whose endDate is BEHIND us by at least DUE_REMINDER_HOURS
 *     hours (default 24), still not DONE, and have NOT been overdue-notified
 *     yet (overdueReminderSentAt is null).
 *     sendOverdueReminderEmail() sets overdueReminderSentAt to dedupe.
 *
 * Auth: hit this endpoint from any external scheduler. Recommended to set
 * CRON_SECRET and pass it as either:
 *   - Authorization: Bearer <CRON_SECRET>   (Vercel Cron format)
 *   - x-cron-secret: <CRON_SECRET>          (legacy custom header)
 *
 * Both GET (Vercel Cron) and POST are supported.
 *
 * Recommended schedule: hourly. Set in vercel.json:
 *   { "crons": [{ "path": "/api/cron/due-reminders", "schedule": "0 * * * *" }] }
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → open (only safe in dev)
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  const custom = req.headers.get("x-cron-secret");
  return bearer === secret || custom === secret;
}

async function runScans() {
  const hours = Number(process.env.DUE_REMINDER_HOURS ?? 24);
  const now = new Date();
  const preDueWindow = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const overdueCutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);

  // ── 1. Pre-due reminders (24h before)
  const preDue = await prisma.task.findMany({
    where: {
      endDate: { not: null, lte: preDueWindow, gte: now },
      status: { not: "DONE" },
      endReminderSentAt: null,
      assignees: { some: {} }, // only tasks with at least one assignee
    },
    select: { id: true },
  });

  let preDueSent = 0;
  for (const t of preDue) {
    try {
      await sendDueReminderEmail(t.id);
      preDueSent++;
    } catch (e) {
      console.error("pre-due reminder", t.id, e);
    }
  }

  // ── 2. Overdue reminders (24h after)
  const overdue = await prisma.task.findMany({
    where: {
      endDate: { not: null, lte: overdueCutoff },
      status: { not: "DONE" },
      overdueReminderSentAt: null,
      assignees: { some: {} },
    },
    select: { id: true },
  });

  let overdueSent = 0;
  for (const t of overdue) {
    try {
      await sendOverdueReminderEmail(t.id);
      overdueSent++;
    } catch (e) {
      console.error("overdue reminder", t.id, e);
    }
  }

  return {
    preDue: { scanned: preDue.length, sent: preDueSent },
    overdue: { scanned: overdue.length, sent: overdueSent },
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runScans();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runScans();
  return NextResponse.json(result);
}
