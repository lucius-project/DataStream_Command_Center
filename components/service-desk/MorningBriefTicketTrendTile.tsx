"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { MorningBriefTicketTrend } from "@/lib/services/morningBrief";
import { LABEL_TEXT_CLASS } from "./NetTicketChangeTile";
import { TicketTrendModal } from "./TicketTrendModal";

// The tile formerly labeled "Yesterday" — now headlines the rolling
// 30-day net total instead of a single day's snapshot, matching "Ticket
// Trend" better than a one-day figure would. The (Nd) suffix only shows
// while real history (this table is never backfilled — see
// ServiceDeskHealthDaily's schema comment) is still short of a full 30
// days, so the common case reads as a clean 30-day total and only the
// early ramp-up period gets an honest caveat. Kept to one subtext line,
// same footprint as every other MorningBriefCard tile. Static content
// stays a plain div; only the trend icon needs its own client state,
// same "small client leaf" pattern MorningBriefHealthTile already uses.
export function MorningBriefTicketTrendTile({ ticketTrend }: { ticketTrend: MorningBriefTicketTrend | null }) {
  const [trendOpen, setTrendOpen] = useState(false);

  const subtext = ticketTrend
    ? `${ticketTrend.created} created · ${ticketTrend.closed} closed` +
      (ticketTrend.daysWithData < 30 ? ` (${ticketTrend.daysWithData}d)` : "")
    : "No data recorded";

  return (
    <>
      <div className="relative flex flex-col items-center gap-1 rounded-md border border-border bg-panel-raised p-3 text-center">
        <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Ticket Trend</span>
        <span
          className={`shrink-0 font-display text-xl font-semibold ${ticketTrend ? LABEL_TEXT_CLASS[ticketTrend.label] : "text-text-faint"}`}
        >
          {ticketTrend ? `${ticketTrend.net >= 0 ? "+" : ""}${ticketTrend.net}` : "—"}
        </span>
        <span className="font-data text-[10px] text-text-faint">{subtext}</span>
        <button
          type="button"
          aria-label="View ticket trend"
          onClick={() => setTrendOpen(true)}
          className="absolute top-1.5 right-1.5 rounded p-0.5 text-text-faint hover:bg-panel-raised hover:text-text"
        >
          <TrendingUp size={11} />
        </button>
      </div>
      {trendOpen && <TicketTrendModal onClose={() => setTrendOpen(false)} />}
    </>
  );
}
