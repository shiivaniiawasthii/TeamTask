import { HoneycombLoader } from "@/components/honeycomb-loader";

// Top-level loading state for any (app) route (e.g. /dashboard, /projects).
// Renders the moment a link is clicked while the server component fetches.
export default function Loading() {
  return <HoneycombLoader />;
}
