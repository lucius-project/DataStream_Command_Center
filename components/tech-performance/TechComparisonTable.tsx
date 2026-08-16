import { paceSeverity, SEVERITY_TEXT } from "@/lib/hoursSeverity";
import type { TechStatus } from "@/lib/services/techPerformance";
import {
  TECH_ROLE_LABELS,
  type TechRole,
  type TechSlaMetric,
  type TechPerformanceScoreResult,
  type TechCardRow,
} from "@/lib/services/techPerformanceScore";
import type { KpiTrend } from "@/lib/services/businessHealth";
import { slaDisplay, slaTone } from "./TechPerformanceRow";
import { StatusPill } from "./shared";
import { DrilldownStat } from "./DrilldownStat";
import { TechScoreBadge } from "./TechScoreBadge";

export type TechComparisonEntry = {
  person: string;
  role: TechRole;
  status: TechStatus;
  scoreResult: TechPerformanceScoreResult;
  scoreTrend?: KpiTrend;
  pacePct: number;
  openCount: number;
  openRows: TechCardRow[];
  agingCount: number;
  agingRows: TechCardRow[];
  staleCount: number;
  staleRows: TechCardRow[];
  responseSla: TechSlaMetric;
  responseMissRows: TechCardRow[];
  resolutionSla: TechSlaMetric;
  resolutionMissRows: TechCardRow[];
  callsInbound: number;
  callsOutbound: number;
};

// Headline-only, deliberately not every metric the per-tech cards below
// show (remote sessions, time coverage, median first response, P1-P4
// breakdown, etc.) — this is a quick side-by-side scan, one screen
// width; a card's own drilldowns are still the place for the full
// detail behind any of these numbers. Techs as columns ("side by
// side"), metrics as rows, so a manager reads across a row to compare
// one number across the whole team at a glance. Every number backed by
// a real list (open/aging/stale/SLA misses) reuses the exact same
// DrilldownStat popup and row data the per-tech cards already use below
// — never a second, differently-computed count. Performance Score
// reuses TechScoreBadge directly (its own breakdown + trend pop-outs),
// not a third copy of that modal. Status and Calls have no underlying
// list to pop open (same as on the cards themselves), so they stay
// plain text/pills.
export function TechComparisonTable({ entries }: { entries: TechComparisonEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="w-full min-w-[640px] text-left font-data text-xs">
        <caption className="sr-only">
          Technician comparison across {entries.length} technician{entries.length === 1 ? "" : "s"}
        </caption>
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th scope="col" className="py-1.5 pr-3 pl-3 font-normal">
              Metric
            </th>
            {entries.map((e) => (
              <th key={e.person} scope="col" className="py-1.5 pr-3 font-normal">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-sm font-medium text-text">{e.person}</span>
                  <span className="text-[10px] tracking-wide text-text-faint uppercase">{TECH_ROLE_LABELS[e.role]}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Status</td>
            {entries.map((e) => (
              <td key={e.person} className="py-1.5 pr-3">
                <StatusPill status={e.status} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Performance Score</td>
            {entries.map((e) => (
              <td key={e.person} className="py-1.5 pr-3">
                <TechScoreBadge person={e.person} result={e.scoreResult} trend={e.scoreTrend} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Pace (time entry)</td>
            {entries.map((e) => {
              const sev = paceSeverity(e.pacePct);
              return (
                <td key={e.person} className={`py-1.5 pr-3 font-semibold ${SEVERITY_TEXT[sev]}`}>
                  {Math.round(e.pacePct)}%
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Open tickets</td>
            {entries.map((e) => (
              <td key={e.person} className="py-1.5 pr-3">
                <DrilldownStat
                  value={e.openCount}
                  label=""
                  title={`${e.person} — Open Tickets`}
                  rows={e.openRows}
                  emptyMessage="No open tickets."
                />
              </td>
            ))}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Aging (24h+)</td>
            {entries.map((e) => (
              <td key={e.person} className="py-1.5 pr-3">
                <DrilldownStat
                  value={e.agingCount}
                  label=""
                  tone={e.agingCount > 0 ? "warn" : undefined}
                  title={`${e.person} — Aging Tickets (24h+)`}
                  rows={e.agingRows}
                  emptyMessage="No tickets aging past 24 hours."
                />
              </td>
            ))}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Stale</td>
            {entries.map((e) => (
              <td key={e.person} className="py-1.5 pr-3">
                <DrilldownStat
                  value={e.staleCount}
                  label=""
                  tone={e.staleCount > 0 ? "warn" : undefined}
                  title={`${e.person} — Stale Tickets (24 business hours, no action)`}
                  rows={e.staleRows}
                  emptyMessage="Nothing stale."
                />
              </td>
            ))}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Response SLA</td>
            {entries.map((e) => {
              const tone = slaTone(e.responseSla);
              return (
                <td key={e.person} className="py-1.5 pr-3">
                  <DrilldownStat
                    value={slaDisplay(e.responseSla)}
                    label=""
                    tone={tone}
                    title={`${e.person} — Response SLA Misses`}
                    rows={e.responseMissRows}
                    emptyMessage="No response SLA misses."
                  />
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Resolution SLA</td>
            {entries.map((e) => {
              const tone = slaTone(e.resolutionSla);
              return (
                <td key={e.person} className="py-1.5 pr-3">
                  <DrilldownStat
                    value={slaDisplay(e.resolutionSla)}
                    label=""
                    tone={tone}
                    title={`${e.person} — Resolution SLA Misses`}
                    rows={e.resolutionMissRows}
                    emptyMessage="No resolution SLA misses."
                  />
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-3 pl-3 text-text-muted">Calls (in / out)</td>
            {entries.map((e) => (
              <td key={e.person} className="py-1.5 pr-3 text-text">
                {e.callsInbound} / {e.callsOutbound}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
