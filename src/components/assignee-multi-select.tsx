"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

type Member = { id: string; name: string | null; email: string };

export function AssigneeMultiSelect({
  members,
  value,
  onChange,
  placeholder = "Add assignees…",
}: {
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = members.filter((m) => value.includes(m.id));
  const filtered = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.name ?? "").toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "min-h-9 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm cursor-pointer flex items-center gap-1 flex-wrap",
        )}
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          selected.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 bg-accent/40 border border-accent text-accent-foreground rounded-full pl-1 pr-2 py-0.5 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[9px]">
                  {initials(m.name, m.email)}
                </AvatarFallback>
              </Avatar>
              <span>{m.name ?? m.email}</span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="opacity-60 hover:opacity-100"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md text-sm">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="w-full px-3 py-2 bg-transparent border-b outline-none text-sm"
          />
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            )}
            {filtered.map((m) => {
              const selectedNow = value.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30",
                      selectedNow && "bg-accent/20",
                    )}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {initials(m.name, m.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">
                      {m.name ?? m.email}
                      {m.name && (
                        <span className="text-muted-foreground text-xs ml-1">
                          ({m.email})
                        </span>
                      )}
                    </span>
                    {selectedNow && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
