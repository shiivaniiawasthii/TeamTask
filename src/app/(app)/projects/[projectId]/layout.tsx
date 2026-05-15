import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isProjectAdmin, requireUser } from "@/lib/session";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectActions } from "@/components/project-actions";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const user = await requireUser();
  // Gate on membership AND expiry. expiresAt = null means lifetime access.
  // Any value in the past blocks the user as if they weren't a member.
  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      members: {
        some: {
          userId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
    },
  });
  if (!project) notFound();

  const isAdmin = await isProjectAdmin(params.projectId, user.id);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-xl font-semibold">{project.name}</h1>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {project.key}
              </span>
            </div>
            {project.description && (
              <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
          <ProjectActions
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              color: project.color,
            }}
            isAdmin={isAdmin}
          />
        </div>
        <ProjectTabs projectId={project.id} />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}
