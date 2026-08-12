"use client";

import { MonitorCheck, MonitorX } from "lucide-react";
import { ClientText } from "@/components/ClientText";
import type { NinjaDevice } from "@/app/generated/prisma/client";

function formatLastContact(date: Date | null): string {
  if (!date) return "never";
  const ms = Date.now() - date.getTime();
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DeviceRow({ device }: { device: NinjaDevice }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3">
      <span className="shrink-0">
        {device.offline ? (
          <MonitorX size={16} className="text-status-critical" />
        ) : (
          <MonitorCheck size={16} className="text-status-ok" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text">{device.displayName}</div>
        <div className="mt-0.5 font-data text-[11px] text-text-faint">
          {device.osName && <>{device.osName} · </>}
          Last contact: <ClientText compute={() => formatLastContact(device.lastContact)} fallback="" />
        </div>
      </div>
      <span
        className={`shrink-0 rounded border px-1.5 py-0.5 font-data text-[10px] font-semibold tracking-wide uppercase ${
          device.offline
            ? "border-status-critical/40 bg-status-critical-dim text-status-critical"
            : "border-status-ok/40 bg-status-ok-dim text-status-ok"
        }`}
      >
        {device.offline ? "Offline" : "Online"}
      </span>
    </div>
  );
}
