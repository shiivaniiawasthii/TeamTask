import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Role model
 *
 *   Workspace-level (User.role):  ADMIN | MEMBER
 *     - Workspace ADMIN can view & administer EVERY project,
 *       regardless of explicit ProjectMember rows.
 *
 *   Project-level (ProjectMember.role):
 *     ADMIN           — full project control (delete project, manage members)
 *     PROJECT_MANAGER — manage members, edit project, manage sprints/milestones
 *     LEAD            — manage sprints/milestones/tasks (no member admin)
 *     MEMBER          — edit own tasks, comment, view
 */

export type ProjectRole = "ADMIN" | "PROJECT_MANAGER" | "LEAD" | "MEMBER";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id: string; email: string; name?: string } | undefined) ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Is the user a workspace-level admin? Bypasses project membership checks. */
export async function isWorkspaceAdmin(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role === "ADMIN";
}

export async function getProjectRole(projectId: string, userId: string) {
  // Workspace admins act as project admins everywhere.
  if (await isWorkspaceAdmin(userId)) return "ADMIN" as const;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return (m?.role as ProjectRole | undefined) ?? null;
}

/** Can the user see this project at all? */
export async function canViewProject(projectId: string, userId: string) {
  if (await isWorkspaceAdmin(userId)) return true;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return !!m;
}

export async function isProjectAdmin(projectId: string, userId: string) {
  return (await getProjectRole(projectId, userId)) === "ADMIN";
}

/** ADMIN or PROJECT_MANAGER — can manage members + edit project. */
export async function canManageMembers(projectId: string, userId: string) {
  const role = await getProjectRole(projectId, userId);
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

/** ADMIN, PM, or LEAD — can manage sprints, milestones, tasks org-wide. */
export async function canManagePlanning(projectId: string, userId: string) {
  const role = await getProjectRole(projectId, userId);
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "LEAD";
}
