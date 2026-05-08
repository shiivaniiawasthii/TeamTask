import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatDate, initials, priorityColor, statusLabel } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();

  const [projects, myTasks, allTasks] = await Promise.all([
    prisma.project.findMany({
      where: { members: { some: { userId: user.id } } },
      include: { _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: {
        assigneeId: user.id,
        status: { not: "DONE" },
        project: { members: { some: { userId: user.id } } },
      },
      include: {
        project: { select: { id: true, name: true, key: true, color: true } },
      },
      orderBy: [{ endDate: "asc" }, { priority: "asc" }],
      take: 10,
    }),
    prisma.task.findMany({
      where: { project: { members: { some: { userId: user.id } } } },
      select: { status: true, priority: true, endDate: true },
    }),
  ]);

  const total = allTasks.length;
  const byStatus = allTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const overdue = allTasks.filter(
    (t) => t.endDate && new Date(t.endDate) < new Date() && t.status !== "DONE",
  ).length;
  const dueSoon = allTasks.filter((t) => {
    if (!t.endDate || t.status === "DONE") return false;
    const days = (new Date(t.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 3;
  }).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total tasks" value={total} />
        <Stat
          label="In progress"
          value={(byStatus["IN_PROGRESS"] ?? 0) + (byStatus["IN_REVIEW"] ?? 0)}
        />
        <Stat label="Due in next 3 days" value={dueSoon} />
        <Stat label="Overdue" value={overdue} highlight={overdue > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold mb-3">My open tasks</h2>
          {myTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing on your plate. Nice.</p>
          ) : (
            <ul className="divide-y">
              {myTasks.map((t) => {
                const od = t.endDate && new Date(t.endDate) < new Date();
                return (
                  <li key={t.id} className="py-2">
                    <Link
                      href={`/projects/${t.project.id}/board?task=${t.id}`}
                      className="flex items-start gap-3 hover:bg-muted/40 p-2 rounded-md"
                    >
                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.project.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{t.project.key}</span>
                          <span>·</span>
                          <span>{statusLabel(t.status)}</span>
                          <span>·</span>
                          <Badge className={priorityColor(t.priority)}>{t.priority}</Badge>
                          {t.endDate && (
                            <span className={cn(od && "text-destructive font-medium")}>
                              · {formatDate(t.endDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold mb-3">Projects</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one from the sidebar.
            </p>
          ) : (
            <ul className="divide-y">
              {projects.map((p) => (
                <li key={p.id} className="py-2">
                  <Link
                    href={`/projects/${p.id}/board`}
                    className="flex items-center gap-3 hover:bg-muted/40 p-2 rounded-md"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.key}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p._count.tasks} tasks
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-3xl font-semibold",
          highlight && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}
