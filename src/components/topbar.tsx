"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";
import { LogOut, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";

// Maps the stored role string to a human label + chip style. The same role
// vocabulary appears on Members; keeping the styles aligned makes the navbar
// chip read as the same concept.
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  LEAD: "Lead",
  MEMBER: "Member",
};

const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-primary/15 text-primary border-primary/30",
  PROJECT_MANAGER: "bg-accent/40 text-accent-foreground border-accent",
  LEAD: "bg-muted text-foreground border-border",
  MEMBER: "bg-muted text-muted-foreground border-border",
};

export function TopBar({
  user,
}: {
  user: { email: string; name?: string | null; role?: string | null };
}) {
  const role = user.role ?? "MEMBER";
  const roleLabel = ROLE_LABEL[role] ?? role;
  const roleStyle = ROLE_STYLE[role] ?? ROLE_STYLE.MEMBER;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="text-sm text-muted-foreground" />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <ThemeToggle />
        <Avatar>
          <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
        <div className="hidden sm:block leading-tight">
          <div className="text-sm font-medium flex items-center gap-2">
            <span>{user.name ?? user.email}</span>
            {role !== "MEMBER" && (
              <Badge className={`${roleStyle} text-[10px] py-0 px-1.5`}>
                {role === "ADMIN" && <Shield className="h-2.5 w-2.5 mr-0.5" />}
                {roleLabel}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
