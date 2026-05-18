"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/projects/${projectId}/board`, label: "Board" },
    { href: `/projects/${projectId}/list`, label: "List" },
    { href: `/projects/${projectId}/sprints`, label: "Sprints" },
    { href: `/projects/${projectId}/milestones`, label: "Milestones" },
    { href: `/projects/${projectId}/notes`, label: "Notes" },
    { href: `/projects/${projectId}/whiteboard`, label: "Whiteboard" },
    { href: `/projects/${projectId}/members`, label: "Members" },
  ];
  return (
    <nav className="mt-4 flex gap-1 -mb-px overflow-x-auto no-scrollbar">
      {tabs.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "shrink-0 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap",
              active
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
