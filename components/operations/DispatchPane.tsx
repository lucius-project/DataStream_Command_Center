"use client";

import { AlertTriangle } from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import { ClientText } from "@/components/ClientText";
import type { TicketSnapshot } from "@/app/generated/prisma/client";
import type { TechLoad } from "@/lib/services/operations";

function formatRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function slaLabel(slaDueAt: Date | null): { text: string; breached: boolean } | null {
  if (!slaDueAt) return null;
  const ms = slaDueAt.getTime() - Date.now();
  const hours = Math.abs(Math.round(ms / (60 * 60 * 1000)));
  if (ms < 0) return { text: `SLA breached ${hours}h ago`, breached: true };
  if (hours < 24) return { text: `SLA due in ${hours}h`, breached: hours < 2 };
  return { text: `SLA due in ${Math.round(hours / 24)}d`, breached: false };
}

export function DispatchPane({
  tickets,
  load,
}: {
  tickets: TicketSnapshot[];
  load: TechLoad[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {load.map((l) => (
          <div
            key={l.tech}
            className="flex min-w-[110px] shrink-0 flex-col gap-0.5 rounded-lg border border-border bg-panel px-3 py-2"
          >
            <span className="font-display text-sm font-medium text-text">{l.tech}</span>
            <span className="font-data text-xs text-text-muted">{l.openCount} open</span>
            {(l.p1Count > 0 || l.agingCount > 0) && (
              <span className="font-data text-[11px] text-status-warn">
                {l.p1Count > 0 && `${l.p1Count} P1`}
                {l.p1Count > 0 && l.agingCount > 0 && " · "}
                {l.agingCount > 0 && `${l.agingCount} aging`}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {tickets.map((t) => {
          const sla = slaLabel(t.slaDueAt);
          return (
            <div
              key={t.id}
              className="rounded-lg border border-border bg-panel p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={t.priority} />
                  <span className="font-data text-xs text-text-faint">{t.haloTicketId}</span>
                </div>
                <span className="shrink-0 font-data text-[11px] text-text-faint">
                  <ClientText
                    compute={() => formatRelative(t.openedAt)}
                    fallback={t.openedAt.toISOString()}
                  />
                </span>
              </div>
              <div className="mt-1.5 text-sm text-text">{t.summary}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-[11px] text-text-muted">
                <span>{t.assignedTech}</span>
                <span className="text-text-faint">{t.status}</span>
                {sla && (
                  <span
                    className={`flex items-center gap-1 ${sla.breached ? "text-status-critical" : "text-text-faint"}`}
                  >
                    {sla.breached && <AlertTriangle size={11} />}
                    <ClientText compute={() => sla.text} fallback="" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && (
          <div className="rounded-lg border border-border bg-panel p-6 text-center text-sm text-text-muted">
            No open tickets.
          </div>
        )}
      </div>
    </div>
  );
}
