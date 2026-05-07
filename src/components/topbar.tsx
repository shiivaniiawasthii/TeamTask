"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar({ user }: { user: { email: string; name?: string | null } }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="text-sm text-muted-foreground" />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Avatar>
          <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
        <div className="hidden sm:block">
          <div className="text-sm font-medium">{user.name ?? user.email}</div>
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
