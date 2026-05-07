import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { SprintsView } from "@/components/sprints-view";

export default async function SprintsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      sprints: {
        orderBy: { startDate: "asc" },
        include: {
          tasks: {
            orderBy: [{ status: "asc" }, { position: "asc" }],
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              endDate: true,
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <SprintsView
      projectId={project.id}
      initialSprints={project.sprints.map((s) => ({
        ...s,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        tasks: s.tasks.map((t) => ({
          ...t,
          endDate: t.endDate?.toISOString() ?? null,
        })),
      }))}
      members={project.members.map((m) => m.user)}
    />
  );
}
