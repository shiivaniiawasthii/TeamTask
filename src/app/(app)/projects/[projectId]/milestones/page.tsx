import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { MilestonesView } from "@/components/milestones-view";

export default async function MilestonesPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      milestones: {
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        include: {
          tasks: { select: { id: true, title: true, status: true } },
          sprintLinks: {
            include: { sprint: { select: { id: true, name: true, status: true } } },
          },
        },
      },
      sprints: {
        orderBy: { startDate: "asc" },
        select: { id: true, name: true, status: true },
      },
    },
  });
  if (!project) notFound();

  return (
    <MilestonesView
      projectId={project.id}
      allSprints={project.sprints}
      initialMilestones={project.milestones.map((m) => ({
        ...m,
        dueDate: m.dueDate?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        sprints: m.sprintLinks.map((l) => l.sprint),
      }))}
    />
  );
}
