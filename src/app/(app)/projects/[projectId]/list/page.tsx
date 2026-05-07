import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ListView } from "@/components/list-view";

export default async function ListPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }],
        include: {
          assignee: { select: { id: true, name: true, email: true, image: true } },
          sprint: { select: { id: true, name: true } },
          milestone: { select: { id: true, title: true } },
          _count: { select: { comments: true, subtasks: true } },
        },
      },
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <ListView
      projectId={project.id}
      currentUserId={user.id}
      initialTasks={project.tasks.map((t) => ({
        ...t,
        startDate: t.startDate?.toISOString() ?? null,
        endDate: t.endDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })) as any}
      members={project.members.map((m) => m.user)}
    />
  );
}
