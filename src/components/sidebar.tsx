"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Logo } from "@/components/logo";

type Project = { id: string; name: string; key: string; color: string };

export function Sidebar({ projects }: { projects: Project[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="px-4 py-4 border-b">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <Link
          href="/dashboard"
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
            onClick={() => setOpen(true)}
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
              <span className="ml-auto text-[10px] text-muted-foreground">{p.key}</span>
            </Link>
          );
        })}
      </nav>
      <CreateProjectDialog open={open} onOpenChange={setOpen} />
    </aside>
  );
}
