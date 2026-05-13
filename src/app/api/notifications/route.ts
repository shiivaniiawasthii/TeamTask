import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * GET /api/notifications
 *
 * Returns the current user's most recent notifications + unread count.
 * Used by the bell dropdown in the top nav.
 *
 * Query params:
 *   ?limit=20  (default 20, max 100)
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 20 : limitRaw), 100);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);

  return NextResponse.json({ items, unreadCount });
}

/**
 * POST /api/notifications/mark-read
 *
 * Body: { ids?: string[] }  — mark specific notifications read
 *       { all: true }       — mark every unread one read
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));

  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: { userId: user.id, id: { in: body.ids } },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
