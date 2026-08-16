"use client";

import { useEffect, useState } from "react";
import type { TicketTrend } from "@/lib/services/serviceDeskHealth";
import { Modal } from "@/components/shared/Modal";

// Same three-way rule as LABEL_TEXT_CLASS (NetTicketChangeTile.tsx):
// negative net (closing more than creating) is Gaining Ground/green,
// zero is Keeping Pace/yellow, positive is Losing Ground/red — so a red
// "+7" here means the same thing it does on every other net-change tile
// in the app, not a new color scale invented for this chart.
function netColorClass(net: number | null): string {
  if (net === null) return "text-text-faint";
  if (net < 0) return "text-status-ok";
  if (net === 0) return "text-status-warn";
  return "text-status-critical";
}

// Two series per day (created/closed), not a single value — unlike the
// Health/Tech Score trends, "ticket trend" only means something as a
// pair (backlog direction is the relationship between them, not either
// number alone). Scaled to the window's shared max so bar heights stay
// comparable day to day, same reasoning getCallAnswerRateTrend's monthly
// bars already use for a shared scale. The net figure printed above each
// pair is the same number the bars themselves imply (created bar taller
// than closed = positive net), just spelled out so it doesn't have to be
// read off two bar heights.
function Bars({ days }: { days: TicketTrend["days"] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.created ?? 0, d.closed ?? 0]));
  return (
    <div className="flex items-end gap-1">
      {days.map((d) => {
        const hasData = d.created !== null;
        const createdPct = hasData ? Math.min(100, ((d.created ?? 0) / max) * 100) : 0;
        const closedPct = hasData ? Math.min(100, ((d.closed ?? 0) / max) * 100) : 0;
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <span className={`font-data text-[9px] font-semibold ${netColorClass(d.net)}`}>
              {d.net === null ? "—" : d.net > 0 ? `+${d.net}` : d.net}
            </span>
            <div
              className="relative flex h-24 w-full items-end gap-0.5 overflow-hidden rounded-sm bg-panel-raised px-0.5"
              title={
                hasData
                  ? `${d.label}: ${d.created} created, ${d.closed} closed, net ${d.net! >= 0 ? "+" : ""}${d.net}`
                  : `${d.label}: no history yet`
              }
            >
              <div
                className={`w-1/2 rounded-sm ${hasData ? "bg-status-info" : "bg-border-strong"}`}
                style={{ height: hasData ? `${createdPct}%` : "6%" }}
              />
              <div
                className={`w-1/2 rounded-sm ${hasData ? "bg-status-ok" : "bg-border-strong"}`}
                style={{ height: hasData ? `${closedPct}%` : "6%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TicketTrendModal({ onClose }: { onClose: () => void }) {
  const [trend, setTrend] = useState<TicketTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/service-desk/ticket-trend")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trend data.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal title="Ticket Trend" subtitle="Created vs. closed per day, last 30 days" onClose={onClose} maxWidthClassName="max-w-2xl">
      {error && (
        <div className="rounded-md border border-status-critical/40 bg-status-critical-dim px-3 py-2 text-sm text-status-critical">
          {error}
        </div>
      )}

      {!error && !trend && <div className="py-8 text-center text-sm text-text-muted">Loading…</div>}

      {trend && (
        <>
          <div className="flex items-center gap-4 font-data text-[11px] text-text-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-status-info" /> Created
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-status-ok" /> Closed
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <Bars days={trend.days} />
            </div>
          </div>
          <div className="font-data text-[11px] text-text-faint">
            Gray bars mean no history was recorded that day — this table only started tracking recently, so
            history builds up going forward rather than being backfilled. Hover a bar for the exact counts and net
            change.
          </div>
        </>
      )}
    </Modal>
  );
}
