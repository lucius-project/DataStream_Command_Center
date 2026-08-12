import type { CallsPerClient } from "@/lib/services/callActivity";

// Top clients by call volume — a proxy for "who's actually calling in a
// lot," useful context for account management, not a performance metric
// on its own. Numbers that don't resolve to a known company (see
// unresolvedCalls) are counted honestly rather than dropped or guessed.
export function CallsPerClientPanel({ data }: { data: CallsPerClient }) {
  if (data.topClients.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-medium text-text">Calls per Client</span>
        <span className="font-data text-[11px] text-text-faint">last {data.windowDays} days, business hours</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 font-data text-[12px]">
        {data.topClients.map((c) => (
          <div key={c.companyName} className="flex items-center justify-between">
            <span className="text-text">{c.companyName}</span>
            <span className="text-text-faint">
              {c.calls} calls{c.missed > 0 ? ` · ${c.missed} missed` : ""}
            </span>
          </div>
        ))}
      </div>
      {data.unresolvedCalls > 0 && (
        <div className="mt-2 font-data text-[11px] text-text-faint">
          {data.unresolvedCalls} call{data.unresolvedCalls === 1 ? "" : "s"} from numbers not matched to a known client.
        </div>
      )}
    </div>
  );
}
