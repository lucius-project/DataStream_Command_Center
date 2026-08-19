"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ClientText } from "@/components/ClientText";

// Minutes/hours-ago only (no seconds) — matches the granularity every
// other "Xh ago"/"Xm ago" caption in this app already uses (see
// components/devices/DeviceRow.tsx), not a new convention.
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Stale-while-revalidate for pages whose own render is entirely DB reads
// (fast) but whose freshness depends on a live HaloPSA/NinjaOne/United
// Cloud sync (slow — several seconds, sometimes more). The page paints
// instantly from whatever's already in the database; this fires the
// matching sync route right after mount and calls router.refresh() when
// it's done, so the page picks up fresh data without ever blocking the
// first paint on it. See SyncStatus's schema comment and
// app/api/tech-performance/sync/route.ts.
export function BackgroundSync({
  syncPath,
  lastSyncedAt,
  hadLastError,
}: {
  syncPath: string;
  // ISO string (Server Components can't hand a client component a Date),
  // null when this sync group has never completed cleanly.
  lastSyncedAt: string | null;
  // Whether the most recent attempt (successful or not) recorded an
  // error — the page's own banner shows the actual error text; this is
  // just enough to pick the right one-line state below.
  hadLastError: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  // Fires once per mount, not once per render — router.refresh() re-runs
  // the server component and hands this component fresh props, but
  // doesn't remount it, so this effect (empty deps) must not refire or
  // it would loop forever.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(syncPath, { method: "POST" });
        if (!cancelled && !res.ok) setUnreachable(true);
      } catch {
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) {
          setSyncing(false);
          router.refresh();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncPath, router]);

  return (
    <div className="flex items-center gap-1.5 font-data text-[11px] text-text-faint">
      <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
      {syncing ? (
        <span>Syncing latest data…</span>
      ) : unreachable ? (
        <span className="text-status-warn">Couldn&apos;t reach the server to sync — showing the last synced data.</span>
      ) : lastSyncedAt ? (
        <span>
          Synced <ClientText compute={() => relativeTime(lastSyncedAt)} />
        </span>
      ) : hadLastError ? (
        <span className="text-status-warn">Last sync attempt failed — showing older data.</span>
      ) : (
        <span>Not synced yet</span>
      )}
    </div>
  );
}
