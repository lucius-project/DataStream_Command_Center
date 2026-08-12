import { AlertTriangle } from "lucide-react";
import { paceSeverity, SEVERITY_FILL, SEVERITY_TEXT } from "@/lib/hoursSeverity";
import type { TechPerformance } from "@/lib/services/techPerformance";
import type {
  TechRole,
  TechPerformanceScoreResult,
  TechServiceMetrics,
  TechSlaMetric,
  TechCardTicketData,
} from "@/lib/services/techPerformanceScore";
import { Stat, GroupLabel, StatusPill, DailyHoursBars } from "./shared";
import { DrilldownStat } from "./DrilldownStat";
import { TechScoreBadge } from "./TechScoreBadge";
import { LockedStrip } from "@/components/business-health/LockedStrip";

// Confirmed genuinely unavailable per-technician, not just unbuilt — see
// techPerformanceScore.ts's header comment for the reasoning behind
// each. Same evidence standard as the org-level LockedStrip in
// ServiceDeskHealthSection.tsx.
const QUALITY_LOCKED = [
  { label: "CSAT", blockedBy: "HaloPSA satisfaction surveys aren't enabled on this account (confirmed live)." },
  { label: "Reopen Rate", blockedBy: "Needs a full close→reopen→close history; this app only retains the most recent close per ticket." },
  { label: "Escalation Rate", blockedBy: "Needs HaloPSA's per-ticket Actions history — deferred to avoid the rate-limited per-ticket fan-out." },
];
const SERVICE_LOCKED = [
  { label: "First Touch Resolution", blockedBy: "Needs reassignment history from HaloPSA's per-ticket Actions feed — deferred to a later phase." },
];
const PHONE_LOCKED = [
  { label: "Missed Calls", blockedBy: "The phone system rings the whole team at once — an unanswered call can't be attributed to one technician." },
  { label: "Answer %", blockedBy: "Same hunt-group limitation — see Missed Calls. Team-wide answer rate is on the KPI strip above." },
];
const REMOTE_SUPPORT_LOCKED = [
  { label: "Remote Sessions", blockedBy: "Deferred to Phase 8 (NinjaOne integration) per the implementation roadmap." },
  { label: "Unique Remote Time", blockedBy: "Deferred to Phase 8 (NinjaOne integration) per the implementation roadmap." },
  { label: "Remote Clients", blockedBy: "Deferred to Phase 8 (NinjaOne integration) per the implementation roadmap." },
  { label: "Remote Devices", blockedBy: "Deferred to Phase 8 (NinjaOne integration) per the implementation roadmap." },
];

function Sparkline({ trend }: { trend: TechPerformance["trend"] }) {
  if (trend.length < 2) return null;

  const width = 72;
  const height = 20;
  const max = Math.max(1, ...trend.map((t) => Math.max(t.loggedHours, t.expectedHours)));
  const points = trend
    .map((t, i) => {
      const x = trend.length > 1 ? (i / (trend.length - 1)) * width : 0;
      const y = height - (t.loggedHours / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="hidden h-5 w-[72px] shrink-0 opacity-70 sm:block"
      role="img"
      aria-label={`Weekly logged hours over the last ${trend.length} weeks`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-series-1)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Replaces the old vague "Falling Behind" framing for the pace metric
// itself (see the spec's "FIX CURRENT UTILIZATION METRIC" note) — the
// overall StatusPill can still legitimately read red for a P1/aging
// reason, but the pace number's own label never implies "poor
// performance" just because hours are below target on, say, a Monday.
function paceLabel(pctOfExpectedToDate: number): string {
  if (pctOfExpectedToDate < 5) return "MISSING TIME";
  const sev = paceSeverity(pctOfExpectedToDate);
  if (sev === "ok") return "ON PACE";
  if (pctOfExpectedToDate > 100) return "ABOVE EXPECTED";
  return "TIME ENTRY BELOW TARGET";
}

function slaDisplay(m: TechSlaMetric): string {
  if (m.status === "available") return `${m.pct}%`;
  if (m.status === "insufficient_sample") return `${m.eligible} sample`;
  return "—";
}

function slaTone(m: TechSlaMetric): "warn" | "critical" | undefined {
  if (m.status !== "available" || m.pct === null) return undefined;
  if (m.pct >= 90) return undefined;
  if (m.pct >= 75) return "warn";
  return "critical";
}

function slaDetail(m: TechSlaMetric, windowLabel: string): string {
  if (m.status === "available") return `${m.met}/${m.eligible} met their ${windowLabel} target`;
  if (m.status === "insufficient_sample") return `Only ${m.eligible} eligible ${windowLabel === "response" ? "tickets" : "closures"} — below the 5-ticket minimum sample`;
  return `No ${windowLabel === "response" ? "tickets with a response target" : "closed tickets with a resolution target"} yet`;
}

export function TechPerformanceRow({
  tech,
  todayIndex,
  role,
  scoreResult,
  serviceMetrics,
  cardData,
}: {
  tech: TechPerformance;
  todayIndex: number;
  role: TechRole;
  scoreResult: TechPerformanceScoreResult;
  serviceMetrics: TechServiceMetrics;
  // Pre-computed server-side (see buildTechCardTicketData in
  // techPerformanceScore.ts) — every "how old is this ticket"
  // calculation already happened before this component ever rendered,
  // since reading the current time directly inside a component body is
  // an impure operation the React Compiler's purity rule forbids.
  cardData: TechCardTicketData;
}) {
  const sev = paceSeverity(tech.pacePct);
  const { priorityCounts } = cardData;

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-base font-medium text-text">{tech.person}</span>
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">{role}</span>
        </div>
        <div className="flex items-center gap-3">
          <Sparkline trend={tech.trend} />
          <TechScoreBadge person={tech.person} result={scoreResult} />
          <StatusPill status={tech.status} />
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <GroupLabel>Time Utilization</GroupLabel>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className={`font-display text-2xl font-semibold ${SEVERITY_TEXT[sev]}`}>
              {Math.round(tech.pacePct)}%
            </span>
            <span className={`font-data text-[10px] font-semibold tracking-wide ${SEVERITY_TEXT[sev]}`}>
              {paceLabel(tech.pacePct)}
            </span>
            <span className="font-data text-xs text-text-faint">
              {tech.loggedHours}h logged · {tech.expectedHoursToDate}h expected to date
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
            <div
              className={`h-full rounded-full ${SEVERITY_FILL[sev]}`}
              style={{ width: `${Math.min(100, tech.pacePct)}%` }}
            />
          </div>
        </div>
      </div>

      {tech.flag && (
        <div className={`mt-2 flex items-center gap-1.5 font-data text-xs ${SEVERITY_TEXT[sev]}`}>
          <AlertTriangle size={13} />
          {tech.flag}
        </div>
      )}

      <DailyHoursBars dailyHours={tech.dailyHours} todayIndex={todayIndex} indent={false} />

      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div>
          <GroupLabel>Tickets</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            <span className="flex flex-wrap gap-x-2.5">
              <DrilldownStat
                value={cardData.openCount}
                label="open"
                title={`${tech.person} — Open Tickets`}
                rows={cardData.openRows}
                emptyMessage="No open tickets."
              />
              <DrilldownStat
                value={serviceMetrics.closedThisWeek}
                label="closed this wk"
                title={`${tech.person} — Closed This Week`}
                rows={cardData.closedRows}
                emptyMessage="Nothing closed yet this week."
              />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <DrilldownStat
                value={cardData.agingCount}
                label="aging 24h+"
                tone={cardData.agingCount > 0 ? "warn" : undefined}
                title={`${tech.person} — Aging Tickets (24h+)`}
                rows={cardData.agingRows}
                emptyMessage="No tickets aging past 24 hours."
              />
              <DrilldownStat
                value={serviceMetrics.staleCount}
                label="stale"
                tone={serviceMetrics.staleCount > 0 ? "warn" : undefined}
                title={`${tech.person} — Stale Tickets (24 business hours, no action)`}
                rows={cardData.staleRows}
                emptyMessage="Nothing stale."
              />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <DrilldownStat
                value={cardData.onHoldCount}
                label="on hold"
                title={`${tech.person} — On Hold Tickets`}
                rows={cardData.onHoldRows}
                emptyMessage="Nothing on hold."
              />
            </span>
            <span className="flex flex-wrap gap-x-2.5 text-text-faint">
              <span>
                P1 <span className={priorityCounts.P1 > 0 ? "text-status-critical" : "text-text"}>{priorityCounts.P1}</span>
              </span>
              <span>
                P2 <span className="text-text">{priorityCounts.P2}</span>
              </span>
              <span>
                P3 <span className="text-text">{priorityCounts.P3}</span>
              </span>
              <span>
                P4 <span className="text-text">{priorityCounts.P4}</span>
              </span>
            </span>
          </div>
        </div>
        <div>
          <GroupLabel>Calls</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={tech.callsInbound} label="in" />
              <Stat value={tech.callsOutbound} label="out" />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={tech.avgAnswerSeconds ?? "—"} label="avg ring (s)" />
              <Stat value={tech.avgTalkMinutes} label="avg talk (min)" />
            </span>
            <div className="mt-1">
              <LockedStrip locked={PHONE_LOCKED} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div>
          <GroupLabel>Service</GroupLabel>
          <div className="mt-1 flex flex-col gap-1 font-data text-[11px]">
            <DrilldownStat
              value={slaDisplay(serviceMetrics.responseSla)}
              label="response SLA"
              tone={slaTone(serviceMetrics.responseSla)}
              title={`${tech.person} — Response SLA Misses`}
              rows={cardData.responseMissRows}
              emptyMessage={slaDetail(serviceMetrics.responseSla, "response")}
            />
            <DrilldownStat
              value={slaDisplay(serviceMetrics.resolutionSla)}
              label="resolution SLA (30d)"
              tone={slaTone(serviceMetrics.resolutionSla)}
              title={`${tech.person} — Resolution SLA Misses`}
              rows={cardData.resolutionMissRows}
              emptyMessage={slaDetail(serviceMetrics.resolutionSla, "resolution")}
            />
            <Stat
              value={serviceMetrics.medianFirstResponseHours !== null ? `${Math.round(serviceMetrics.medianFirstResponseHours * 10) / 10}h` : "—"}
              label="median first response"
            />
            <LockedStrip locked={SERVICE_LOCKED} />
          </div>
        </div>
        <div>
          <GroupLabel>Quality</GroupLabel>
          <div className="mt-1">
            <LockedStrip locked={QUALITY_LOCKED} />
          </div>
          <div className="mt-3">
            <GroupLabel>Remote Support</GroupLabel>
            <div className="mt-1">
              <LockedStrip locked={REMOTE_SUPPORT_LOCKED} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
