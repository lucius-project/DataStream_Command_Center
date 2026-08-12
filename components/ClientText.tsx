"use client";

import { useMounted } from "@/lib/useMounted";

// Renders `fallback` on both the server and the client's first paint (so
// hydration always matches), then swaps in the real value after mount.
// Use for anything that depends on the viewer's locale/timezone/clock —
// toLocaleString(), relative "3h ago" times, etc. — since the Docker
// container's locale/timezone won't generally match the browser's.
export function ClientText({
  compute,
  fallback = "",
}: {
  compute: () => string;
  fallback?: string;
}) {
  const mounted = useMounted();
  return <>{mounted ? compute() : fallback}</>;
}
