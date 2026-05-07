"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import "@tldraw/tldraw/tldraw.css";

const Tldraw = dynamic(
  () => import("@tldraw/tldraw").then((m) => m.Tldraw),
  { ssr: false, loading: () => <div className="p-6 text-sm">Loading whiteboard…</div> },
);

export function WhiteboardClient({
  projectId,
  initialSnapshot,
}: {
  projectId: string;
  initialSnapshot: any;
}) {
  const [editor, setEditor] = useState<any>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const persist = useCallback(
    async (snapshot: any) => {
      try {
        await fetch(`/api/projects/${projectId}/whiteboard`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshot }),
        });
        setSavedAt(new Date());
      } catch (e) {
        console.error(e);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!editor) return;
    if (initialSnapshot && Object.keys(initialSnapshot).length > 0) {
      try {
        editor.store.loadSnapshot(initialSnapshot);
      } catch {
        // ignore corrupt snapshot
      }
    }
    const dispose = editor.store.listen(
      () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          persist(editor.store.getSnapshot());
        }, 1500);
      },
      { source: "user", scope: "document" },
    );
    return () => dispose();
  }, [editor, initialSnapshot, persist]);

  return (
    <div className="relative h-[calc(100vh-9rem)]">
      <div className="absolute top-2 right-3 z-10 text-xs text-muted-foreground bg-white/80 rounded px-2 py-1 border">
        {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Auto-saves on change"}
      </div>
      <Tldraw
        onMount={(ed) => setEditor(ed)}
        autoFocus={false}
        persistenceKey={`whiteboard-${projectId}`}
      />
    </div>
  );
}
