import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isProjectAdmin, requireUser } from "@/lib/session";
import { MembersView } from "@/components/members-view";

export default async function MembersPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      invitations: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { invitedBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!project) notFound();

  const isAdmin = await isProjectAdmin(params.projectId, user.id);

  return (
    <MembersView
      projectId={project.id}
      projectName={project.name}
      currentUserId={user.id}
      isAdmin={isAdmin}
      members={project.members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      }))}
      invitations={project.invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
        invitedBy: i.invitedBy.name ?? i.invitedBy.email,
      }))}
    />
  );
}
