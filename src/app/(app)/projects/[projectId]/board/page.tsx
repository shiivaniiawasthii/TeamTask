import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { task?: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }],
        include: {
          assignee: { select: { id: true, name: true, email: true, image: true } },
          subtasks: {
            select: { id: true, title: true, done: true },
            orderBy: { position: "asc" },
          },
          sprint: { select: { id: true, name: true } },
          milestone: { select: { id: true, title: true } },
          _count: { select: { comments: true } },
        },
      },
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <KanbanBoard
      project={project}
      members={project.members.map((m) => m.user)}
      initialTaskId={searchParams.task}
    />
  );
}
