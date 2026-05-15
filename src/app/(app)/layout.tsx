import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Force password change on first login. We do this here (server layout)
  // rather than via middleware so we have a real DB session in the request.
  // While we're at it, pull `role` too so the TopBar can display it without
  // a second roundtrip.
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true, role: true },
  });
  if (account?.mustChangePassword) {
    redirect("/change-password");
  }

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, key: true, color: true },
  });

  return (
    <div className="flex min-h-screen bg-background">
      {/* Refresh server data when the tab regains focus (zero-cost real-time). */}
      <RefreshOnFocus />
      <Sidebar projects={projects} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={{ ...user, role: account?.role ?? "MEMBER" }} />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
