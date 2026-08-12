import type { TechCallStat } from "@/lib/services/callActivity";

// Quick "who's actually taking calls today" readout — sits right above
// the call log so it doesn't require a trip to Tech Performance for the
// same-day signal. Deliberately narrower than that page's weekly
// breakdown: just in/out/missed counts, no ring time or talk time, kept
// tight so it reads as a companion to the "calls today" tiles above it,
// not a second dashboard.
export function TechCallSummary({ stats }: { stats: TechCallStat[] }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-panel p-4">
      <div className="font-data text-[10px] tracking-wide text-text-faint uppercase">By tech today</div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.person}>
            <div className="font-display text-sm font-medium text-text">{s.person}</div>
            <div className="mt-0.5 font-data text-[11px]">
              <span className="text-text">{s.inbound}</span> <span className="text-text-faint">in</span>
              {"  "}
              <span className="text-text">{s.outbound}</span> <span className="text-text-faint">out</span>
              {s.missed > 0 && (
                <>
                  {"  "}
                  <span className="text-status-critical">{s.missed}</span>{" "}
                  <span className="text-text-faint">missed</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
