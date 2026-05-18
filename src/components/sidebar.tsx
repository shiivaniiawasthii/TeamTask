"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FolderKanban, Plus, X } from "lucide-react";
import { useState, useEffect } from "react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Logo } from "@/components/logo";
import { useMobileNav } from "@/lib/use-mobile-nav";

type Project = { id: string; name: string; key: string; color: string };

function SidebarBody({
  projects,
  pathname,
  onNewProject,
  onNavigate,
}: {
  projects: Project[];
  pathname: string | null;
  onNewProject: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-4 py-4 border-b">
        <Link href="/dashboard" onClick={onNavigate}>
          <Logo size={120} />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/30 transition-colors",
            pathname === "/dashboard" && "bg-accent/40 text-accent-foreground",
          )}
        >
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </Link>

        <div className="pt-4 pb-1 px-3 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
          <span>Projects</span>
          <button
            onClick={onNewProject}
            className="rounded p-1 hover:bg-accent/30 text-muted-foreground"
            aria-label="New project"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {projects.length === 0 && (
          <p className="px-3 text-xs text-muted-foreground">No projects yet.</p>
        )}

        {projects.map((p) => {
          const active = pathname?.startsWith(`/projects/${p.id}`);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}/board`}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent/30 transition-colors",
                active && "bg-accent/40 font-medium text-accent-foreground",
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {p.key}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar({ projects }: { projects: Project[] }) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const mobileOpen = useMobileNav((s) => s.open);
  const setMobileOpen = useMobileNav((s) => s.setOpen);

  // Auto-close the mobile drawer on route change so the user lands on the new
  // page with the nav out of the way.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
        <SidebarBody
          projects={projects}
          pathname={pathname}
          onNewProject={() => setCreateOpen(true)}
        />
      </aside>

      {/* Mobile drawer — same content, slid in from the left over a scrim. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col border-r bg-card shadow-xl animate-in slide-in-from-left">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 p-1.5 rounded hover:bg-accent/30 z-10"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarBody
              projects={projects}
              pathname={pathname}
              onNewProject={() => setCreateOpen(true)}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
