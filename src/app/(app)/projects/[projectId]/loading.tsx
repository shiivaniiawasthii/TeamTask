import { HoneycombLoader } from "@/components/honeycomb-loader";

/**
 * This loading.tsx is the fallback for ALL routes under /projects/[projectId]
 * (board, list, sprints, milestones, members, notes, whiteboard) UNLESS a
 * specific sub-route has its own loading.tsx. The project layout (header +
 * tabs) stays visible — only the content area shows the loader.
 */
export default function Loading() {
  return <HoneycombLoader />;
}
