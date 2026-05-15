"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Triggers router.refresh() whenever the browser tab regains focus, but no
 * more often than once every `minIntervalMs` (default 5 seconds) so rapid
 * focus/blur doesn't hammer the server.
 *
 * router.refresh() re-runs every server component in the current route. That
 * picks up new projects in the sidebar, fresh task data on the board, updated
 * pending invitations on the members page — without any websocket, without
 * any cache invalidation logic in individual components.
 */
export function RefreshOnFocus({ minIntervalMs = 5_000 }: { minIntervalMs?: number }) {
  const router = useRouter();
  const lastRefreshed = useRef<number>(0);

  useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      if (now - lastRefreshed.current < minIntervalMs) return;
      lastRefreshed.current = now;
      router.refresh();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") maybeRefresh();
    }
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, minIntervalMs]);

  return null;
}
