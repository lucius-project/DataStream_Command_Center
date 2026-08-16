import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { FocusItem, Tier } from "@/lib/services/techFocus";
import { PriorityBadge } from "@/components/operations/PriorityBadge";

const TIER_BADGE_CLASS: Record<Tier, string> = {
  0: "border-status-critical/40 bg-status-critical-dim text-status-critical",
  1: "border-status-warn/40 bg-status-warn-dim text-status-warn",
  2: "border-status-info/40 bg-status-info-dim text-status-info",
  3: "border-accent/40 bg-accent-dim text-accent",
};

// One shared spreadsheet-row look for every FocusItem[] list in the app
// (Huddle Mode's per-tech tables, Needs Attention, SLA At Risk) — a
// FocusItem already carries the same five fields regardless of which
// service built it (slaFocusItems/alertFocusItems/trainingFocusItems in
// techFocus.ts), so the row markup only needs to exist once. Description
// and Ticket are separate <td> cells (not one nested inside the other) —
// a <table> cell boundary already keeps their two links from ever
// nesting, the invalid-HTML trap a shared-container card layout would
// hit.
function FocusTableRow({ item, rank }: { item: FocusItem; rank: number }) {
  return (
    <tr className="border-t border-border text-text">
      <td className="py-1.5 pr-3 pl-3 text-text-faint">{rank}</td>
      <td className="py-1.5 pr-3">{item.priority ? <PriorityBadge priority={item.priority} /> : <span className="text-text-faint">—</span>}</td>
      <td className="py-1.5 pr-3">
        {item.ticketTitle ? (
          item.ticketUrl ? (
            <a
              href={item.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 truncate text-accent hover:underline"
            >
              <ExternalLink size={11} className="shrink-0" />
              <span className="truncate">{item.ticketTitle}</span>
            </a>
          ) : (
            <span className="truncate text-text-faint">{item.ticketTitle}</span>
          )
        ) : (
          <span className="text-text-faint">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-text">
        {item.href ? (
          <Link href={item.href} className="hover:underline">
            {item.text}
          </Link>
        ) : (
          item.text
        )}
      </td>
      <td className="py-1.5 pr-3">
        {/* No whitespace-nowrap/truncate here on purpose — this column
            is deliberately narrow, so a long category name (e.g.
            "Utilization outside expected range") wraps across a couple
            lines instead of forcing the column wide or losing text to
            an ellipsis. Ticket/Breach are the columns meant to carry
            the reading width. */}
        <span
          className={`inline-block rounded border px-1 py-0.5 font-data text-[9px] font-semibold tracking-wide uppercase ${TIER_BADGE_CLASS[item.tier]}`}
        >
          {item.badge}
        </span>
      </td>
    </tr>
  );
}

// table-fixed + an explicit colgroup, not auto-sized columns — every
// caller renders its own separate <table> that would otherwise size
// columns off its own content, so "#" or "Ticket" could land at a
// different width per instance even though every FocusTable on the site
// is meant to line up as one consistent look.
export function FocusTable({ items }: { items: FocusItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] table-fixed text-left font-data text-xs">
        <caption className="sr-only">Priority-ordered focus items, {items.length} total</caption>
        <colgroup>
          {/* #, Priority, Type kept as narrow as their content allows;
              Ticket and Breach get the rest of the width — those two are
              what actually needs to be read at a glance. */}
          <col className="w-8" />
          <col className="w-11" />
          <col className="w-[36%]" />
          <col className="w-[38%]" />
          <col className="w-20" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th scope="col" className="py-1.5 pr-3 pl-3 font-normal">
              #
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              Priority
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              Ticket
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              Breach
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <FocusTableRow key={item.id} item={item} rank={i + 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
