/**
 * Periodic worker that scans for tasks whose due date is within the
 * configured window and sends a reminder email if one hasn't been sent yet.
 *
 * Run with: npm run email:cron
 * Recommended: invoke once an hour from cron / a scheduled job.
 */
import { PrismaClient } from "@prisma/client";
import { sendDueReminderEmail } from "./notifications";

const prisma = new PrismaClient();

async function main() {
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
    select: { id: true, title: true },
  });

  console.log(`[due-cron] ${candidates.length} reminders to send`);
  for (const t of candidates) {
    try {
      await sendDueReminderEmail(t.id);
      console.log(`[due-cron] sent reminder for ${t.id} — ${t.title}`);
    } catch (e) {
      console.error(`[due-cron] failed reminder ${t.id}`, e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
