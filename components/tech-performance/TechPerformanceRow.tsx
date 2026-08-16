import { AlertTriangle } from "lucide-react";
import { paceSeverity, SEVERITY_FILL, SEVERITY_TEXT } from "@/lib/hoursSeverity";
import type { TechPerformance } from "@/lib/services/techPerformance";
import {
  TECH_ROLE_LABELS,
  type TechRole,
  type TechPerformanceScoreResult,
  type TechServiceMetrics,
  type TechSlaMetric,
  type TechCardTicketData,
  type TechCardRow,
} from "@/lib/services/techPerformanceScore";
import type { TechRemoteSummary } from "@/lib/services/remoteSessions";
import type { TechTimeCoverageSummary } from "@/lib/services/activityCorrelation";
import type { TimelineEntry } from "@/lib/services/activityCorrelation";
import type { KpiTrend } from "@/lib/services/businessHealth";
import { Stat, GroupLabel, StatusPill, DailyHoursBars } from "./shared";
import { DrilldownStat } from "./DrilldownStat";
import { TechScoreBadge } from "./TechScoreBadge";
import { ActivityTimelineModal } from "./ActivityTimelineModal";
import { GenerateTechEmailButton } from "./GenerateTechEmailButton";
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
// All three locked lists collapsed behind one disclosure at the bottom
// of the card (see the <details> below) instead of scattered inline —
// six always-gray "not tracked" chips were most of what made the card
// hard to scan at a glance; the info is still one click away, grouped by
// the same section it used to sit inside.
const UNAVAILABLE_METRIC_COUNT = QUALITY_LOCKED.length + SERVICE_LOCKED.length + PHONE_LOCKED.length;
function minutesLabel(seconds: number): string {
  return `${Math.round((seconds / 60) * 10) / 10}m`;
}

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

// Exported — TechComparisonTable.tsx reuses these for the same SLA%
// cells, one formatting/threshold rule rather than a second copy.
export function slaDisplay(m: TechSlaMetric): string {
  if (m.status === "available") return `${m.pct}%`;
  if (m.status === "insufficient_sample") return `${m.eligible} sample`;
  return "—";
}

export function slaTone(m: TechSlaMetric): "warn" | "critical" | undefined {
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
  scoreTrend,
  serviceMetrics,
  cardData,
  remote,
  callMatchRows,
  sessionMatchRows,
  timeCoverage,
  timeCoverageRows,
  timelineEntries,
}: {
  tech: TechPerformance;
  todayIndex: number;
  role: TechRole;
  scoreResult: TechPerformanceScoreResult;
  // "vs 7d ago" trend on the Performance Score badge (Phase 10) — omitted
  // (not fabricated) until TechScoreDaily has 7+ days of real history,
  // see getTechScoreTrendArrow's own comment.
  scoreTrend?: KpiTrend;
  serviceMetrics: TechServiceMetrics;
  // Pre-computed server-side (see buildTechCardTicketData in
  // techPerformanceScore.ts) — every "how old is this ticket"
  // calculation already happened before this component ever rendered,
  // since reading the current time directly inside a component body is
  // an impure operation the React Compiler's purity rule forbids.
  cardData: TechCardTicketData;
  remote: TechRemoteSummary;
  // Calls / remote sessions matched to this tech's tickets (see
  // lib/services/activityCorrelation.ts) — inferred from tech/client/
  // timing signals only, never a confirmed join. Already filtered to
  // this tech and already built into drillable rows server-side.
  callMatchRows: TechCardRow[];
  sessionMatchRows: TechCardRow[];
  // Interaction time (deduped phone + remote) vs. logged hours — NOT a
  // productivity measure, see activityCorrelation.ts's header comment.
  timeCoverage: TechTimeCoverageSummary;
  timeCoverageRows: TechCardRow[];
  timelineEntries: TimelineEntry[];
}) {
  const sev = paceSeverity(tech.pacePct);
  const { priorityCounts } = cardData;

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          {/* A real heading, not a styled span — with a dozen+ tech cards
              on this page, screen-reader heading-navigation (the H key)
              is the only practical way to jump between them. */}
          <h3 className="font-display text-base font-medium text-text">{tech.person}</h3>
          <span className="font-data text-[10px] tracking-wide text-text-muted uppercase">{TECH_ROLE_LABELS[role]}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkline trend={tech.trend} />
          <ActivityTimelineModal techLabel={tech.person} entries={timelineEntries} />
          <GenerateTechEmailButton person={tech.person} />
          <TechScoreBadge person={tech.person} result={scoreResult} trend={scoreTrend} />
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
            <span className="flex flex-wrap gap-x-2.5">
              <DrilldownStat
                value={callMatchRows.length}
                label="matched to tickets"
                title={`${tech.person} — Calls Matched to Tickets (inferred, not confirmed)`}
                rows={callMatchRows}
                emptyMessage="No calls matched to a ticket this week — matching is inferred from tech, client, and timing only; HaloPSA doesn't expose which contact called on a given ticket."
              />
            </span>
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
          </div>
        </div>
        <div>
          <div>
            <GroupLabel>Remote Support</GroupLabel>
            <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
              {remote.sessions === 0 && remote.failedSessions === 0 ? (
                <span className="text-text-faint">No remote sessions tracked yet for {tech.person}.</span>
              ) : (
                <>
                  <span className="flex flex-wrap gap-x-2.5">
                    <Stat value={remote.sessions} label="sessions" />
                    <Stat value={remote.uniqueDeviceIds.size} label="devices" />
                    {remote.failedSessions > 0 && <Stat value={remote.failedSessions} label="failed" tone="warn" />}
                  </span>
                  <span className="flex flex-wrap gap-x-2.5">
                    <Stat value={minutesLabel(remote.grossSeconds)} label="gross time" />
                    <Stat value={minutesLabel(remote.uniqueSeconds)} label="unique time" />
                  </span>
                  <span className="flex flex-wrap gap-x-2.5">
                    <DrilldownStat
                      value={sessionMatchRows.length}
                      label="matched to tickets"
                      title={`${tech.person} — Remote Sessions Matched to Tickets (inferred, not confirmed)`}
                      rows={sessionMatchRows}
                      emptyMessage="No remote sessions matched to a ticket this week — matching needs the session's client linked to NinjaOne (see Team Detail above) plus tech/timing signals."
                    />
                  </span>
                  {remote.durationStatus === "available" && (
                    <span className="flex flex-wrap gap-x-2.5">
                      <Stat value={minutesLabel(remote.medianDurationSeconds!)} label="median session" />
                      <Stat value={minutesLabel(remote.p90DurationSeconds!)} label="P90 session" />
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-3">
            {/* Phone + remote combined, so it belongs outside the
                remote-sessions-only branch above — a tech with zero
                remote sessions this week can still have real phone
                interaction time to compare against logged hours. */}
            <GroupLabel>Time Coverage</GroupLabel>
            <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
              <DrilldownStat
                value={timeCoverage.pct !== null ? `${timeCoverage.pct}%` : "—"}
                label="of logged hours"
                tone={timeCoverage.status === "review" ? "warn" : undefined}
                title={`${tech.person} — Time Coverage (not a productivity measure)`}
                rows={timeCoverageRows}
                emptyMessage="No days this week have both logged hours and phone/remote activity to compare."
              />
            </div>
          </div>
        </div>
      </div>

      <details className="mt-3 border-t border-border pt-2 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none font-data text-[10px] tracking-wide text-text-faint uppercase hover:text-text-muted">
          Unavailable metrics ({UNAVAILABLE_METRIC_COUNT})
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <GroupLabel>Quality</GroupLabel>
            <div className="mt-1">
              <LockedStrip locked={QUALITY_LOCKED} />
            </div>
          </div>
          <div>
            <GroupLabel>Service</GroupLabel>
            <div className="mt-1">
              <LockedStrip locked={SERVICE_LOCKED} />
            </div>
          </div>
          <div>
            <GroupLabel>Phone</GroupLabel>
            <div className="mt-1">
              <LockedStrip locked={PHONE_LOCKED} />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
