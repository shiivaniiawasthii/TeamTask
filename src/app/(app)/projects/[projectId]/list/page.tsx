import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ListView } from "@/components/list-view";

/**
 * Server-side pagination so we never load thousands of tasks into a single
 * client component. Driven by ?page=&pageSize= query params.
 */
const ALLOWED_PAGE_SIZES = [10, 25, 50] as const;

export default async function ListPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { page?: string; pageSize?: string };
}) {
  const user = await requireUser();

  // First confirm project access (separate cheap query).
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });
  if (!project) notFound();

  const pageSize = ALLOWED_PAGE_SIZES.includes(
    Number(searchParams.pageSize) as (typeof ALLOWED_PAGE_SIZES)[number],
  )
    ? Number(searchParams.pageSize)
    : 25;
  const pageRaw = Math.max(1, Number(searchParams.page) || 1);

  // Fetch total count + paginated slice in parallel.
  const [totalCount, tasks] = await Promise.all([
    prisma.task.count({ where: { projectId: project.id } }),
    prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: [{ status: "asc" }, { position: "asc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true } },
        sprint: { select: { id: true, name: true } },
        milestone: { select: { id: true, title: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
      skip: (pageRaw - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(pageRaw, totalPages);

  return (
    <ListView
      projectId={project.id}
      currentUserId={user.id}
      initialTasks={tasks.map((t) => ({
        ...t,
        startDate: t.startDate?.toISOString() ?? null,
        endDate: t.endDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })) as any}
      members={project.members.map((m) => m.user)}
      pagination={{ page, pageSize, totalCount, totalPages }}
    />
  );
}
