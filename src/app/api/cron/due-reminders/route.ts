import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDueReminderEmail } from "@/server/email/notifications";

/**
 * Optional HTTP-triggered alternative to the standalone due-cron script.
 * Hit this from any external cron service (Vercel Cron, GH Actions, etc.).
 * Protect with a shared secret via the CRON_SECRET env var.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hours = Number(process.env.DUE_REMINDER_HOURS ?? 24);
  const now = Date.now();
  const windowEnd = new Date(now + hours * 60 * 60 * 1000);

  const candidates = await prisma.task.findMany({
    where: {
      endDate: { not: null, lte: windowEnd, gte: new Date(now) },
      status: { not: "DONE" },
      assigneeId: { not: null },
      endReminderSentAt: null,
    },
    select: { id: true },
  });

  let sent = 0;
  for (const t of candidates) {
    try {
      await sendDueReminderEmail(t.id);
      sent++;
    } catch (e) {
      console.error("due reminder", e);
    }
  }
  return NextResponse.json({ scanned: candidates.length, sent });
}
