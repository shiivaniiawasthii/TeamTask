import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { NotesView } from "@/components/notes-view";

export default async function NotesPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: {
      notes: {
        orderBy: { updatedAt: "desc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <NotesView
      projectId={project.id}
      initialNotes={project.notes.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      }))}
    />
  );
}
