import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { WhiteboardClient } from "@/components/whiteboard-client";

export default async function WhiteboardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, members: { some: { userId: user.id } } },
    include: { whiteboard: true },
  });
  if (!project) notFound();

  let snapshot: any = null;
  if (project.whiteboard?.snapshot) {
    try {
      snapshot = JSON.parse(project.whiteboard.snapshot);
    } catch {
      snapshot = null;
    }
  }

  return (
    <WhiteboardClient projectId={project.id} initialSnapshot={snapshot} />
  );
}
