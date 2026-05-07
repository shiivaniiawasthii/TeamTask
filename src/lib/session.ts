import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id: string; email: string; name?: string } | undefined) ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function getProjectRole(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

export async function isProjectAdmin(projectId: string, userId: string) {
  return (await getProjectRole(projectId, userId)) === "ADMIN";
}
