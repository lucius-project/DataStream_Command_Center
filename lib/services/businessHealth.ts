// Business Health KPI layer — the CEO-cockpit rollup. Every function here
// is DB-only (Prisma reads + existing read-only services), zero network
// I/O, which is what makes getBusinessHealthSnapshot() safe to also expose
// as a chat tool (see app/api/business-health/chat/route.ts). Syncing
// happens in app/business-health/page.tsx before this is called, not here.
//
// Thresholds are grounded in published MSP benchmarks where one exists
// (tech utilization 70-90% optimal, gross margin 50-60% healthy — Splashtop
// "Top 12 KPIs", Rev.io "MSP KPI Playbook", SuperOps); where no industry
// figure exists (ticket backlog size, SLA compliance %, seat mismatch,
// missed call rate) each function's comment says so explicitly rather than
// implying a benchmark that doesn't exist.

import { prisma } from "@/lib/prisma";
import { bandHigherIsBetter, type KpiStatus } from "@/lib/kpiStatus";
import { weekFractionElapsed } from "@/lib/dateUtils";
import { getDispatchTickets, getLoadPerTech, getTimeGaps } from "@/lib/services/operations";
import { getDeviceHealthSummary } from "@/lib/services/deviceHealth";
import { getCallActivitySummary } from "@/lib/services/callActivity";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getNinjaRmmConnectionInfo, getUnitedCloudCredentialStatus } from "@/lib/services/integrations";
import { ATTENTION_TYPE_RANK } from "@/lib/services/commandFlow";
import type { AttentionType } from "@/app/generated/prisma/client";

// Optional week-over-week comparison — omitted entirely (not a zeroed
// object) when there's no honest prior-period figure to compare against
// yet, e.g. Tech Performance's Ticket Health KPI has nothing to diff
// against for its very first week after TicketLoadWeekly started being
// recorded (see techPerformance.ts) — every week after that has real
// history to compare, so it simply doesn't set this until then rather
// than fabricating a flat trend. `goodDirection` lets the tile color the
// arrow correctly for metrics where "up" is bad (e.g. avg pickup time).
export type KpiTrend = {
  direction: "up" | "down" | "flat";
  changeLabel: string;
  goodDirection: "up" | "down";
};

export type Kpi = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  status: KpiStatus;
  detail: string;
  benchmark: string;
  href: string;
  trend?: KpiTrend;
};

export type ActionItem = {
  id: string;
  severity: "red" | "yellow";
  title: string;
  detail: string;
  href: string;
};

export type LockedKpi = { label: string; blockedBy: string };

export type BusinessHealthSnapshot = {
  kpis: Kpi[];
  actions: ActionItem[];
  locked: LockedKpi[];
  coverage: {
    clientsTotal: number;
    clientsWithFinancials: number;
    financialsAsOf: Date | null;
    clientsWithSeatChecks: number;
    seatChecksAsOf: Date | null;
  };
  generatedAt: Date;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Individual KPIs
// ---------------------------------------------------------------------------

async function kpiTechUtilization(): Promise<Kpi> {
  const { tech } = await getTimeGaps();
  const logged = tech.reduce((sum, t) => sum + t.loggedHours, 0);
  const expectedFull = tech.reduce((sum, t) => sum + t.expectedHours, 0);
  const fraction = weekFractionElapsed();
  const expectedToDate = expectedFull * fraction;

  if (tech.length === 0 || expectedToDate <= 0) {
    return {
      key: "utilization",
      label: "Tech Utilization",
      value: null,
      display: "—",
      status: "unavailable",
      detail: "No time entries synced for this week — visit Operations to trigger a HaloPSA sync.",
      benchmark: "healthy range 70–90%",
      href: "/tech-performance",
    };
  }

  const pct = (logged / expectedToDate) * 100;
  let status: KpiStatus;
  if (pct > 110 || pct < 50) status = "red";
  else if (pct >= 90 || pct < 70) status = "yellow";
  else status = "green";

  const dayOfWeek = Math.min(Math.round(fraction * 5), 5);
  return {
    key: "utilization",
    label: "Tech Utilization",
    value: round1(pct),
    display: `${Math.round(pct)}%`,
    status,
    detail: `${round1(logged)}h logged vs ${round1(expectedToDate)}h expected to date · ${tech.length} techs · day ${dayOfWeek} of 5`,
    benchmark: "healthy range 70–90%",
    href: "/tech-performance",
  };
}

async function kpiGrossMargin(): Promise<Kpi> {
  const [agg, clientCount] = await Promise.all([
    prisma.clientFinancials.aggregate({
      _sum: { netProfit: true, revenueThisMonth: true },
      _count: true,
      _max: { updatedAt: true },
    }),
    prisma.client.count(),
  ]);

  const revenue = agg._sum.revenueThisMonth ?? 0;
  const netProfit = agg._sum.netProfit ?? 0;
  const count = agg._count;

  if (count === 0 || revenue <= 0) {
    return {
      key: "grossMargin",
      label: "Gross Margin",
      value: null,
      display: "—",
      status: "unavailable",
      detail: "QuickBooks not linked to any client. Link a QuickBooks customer on a client's profile to unlock.",
      benchmark: "healthy range 50–60%",
      href: "/clients",
    };
  }

  const pct = (netProfit / revenue) * 100;
  const status = bandHigherIsBetter(pct, 50, 30);
  const asOf = agg._max.updatedAt ? agg._max.updatedAt.toLocaleDateString() : "—";
  return {
    key: "grossMargin",
    label: "Gross Margin",
    value: round1(pct),
    display: `${Math.round(pct)}%`,
    status,
    detail: `${count} of ${clientCount} clients have synced financials · labor cost estimated from a blended payroll rate · as of ${asOf}`,
    benchmark: "healthy range 50–60%",
    href: "/clients",
  };
}

async function kpiTicketBacklog(): Promise<Kpi> {
  const [tickets, load] = await Promise.all([getDispatchTickets(), getLoadPerTech()]);
  const now = Date.now();
  const total = tickets.length;
  const p1Count = tickets.filter((t) => t.priority === "P1").length;
  const agingCount = tickets.filter((t) => now - t.openedAt.getTime() > 24 * 60 * 60 * 1000).length;
  const p1Aging = tickets.filter(
    (t) => t.priority === "P1" && now - t.openedAt.getTime() > 24 * 60 * 60 * 1000,
  ).length;
  // Techs with zero open tickets don't inflate available capacity.
  const techCount = Math.max(load.length, 1);

  let status: KpiStatus;
  if (p1Aging > 0 || total > 15 * techCount) status = "red";
  else if (p1Count > 0 || agingCount > total * 0.25 || total > 10 * techCount) status = "yellow";
  else status = "green";

  return {
    key: "ticketBacklog",
    label: "Ticket Backlog",
    value: total,
    display: `${total}`,
    status,
    detail: `${p1Count} P1 · ${agingCount} aging >24h · ${techCount} techs assigned`,
    benchmark: "capacity-based default, not an industry figure",
    href: "/tech-performance",
  };
}

async function kpiSlaCompliance(): Promise<Kpi> {
  const tickets = await getDispatchTickets();
  if (tickets.length === 0) {
    return {
      key: "slaCompliance",
      label: "SLA Compliance",
      value: 100,
      display: "100%",
      status: "green",
      detail: "No open tickets right now.",
      benchmark: "default target 98%, not a universal industry figure",
      href: "/tech-performance",
    };
  }

  const openIds = tickets.map((t) => t.id);
  const breachFlags = await prisma.attentionFlag.findMany({
    where: { type: "SLA_BREACH", status: "OPEN", ticketId: { in: openIds } },
    select: { ticketId: true },
  });
  const breached = new Set(breachFlags.map((f) => f.ticketId)).size;
  const pct = ((tickets.length - breached) / tickets.length) * 100;
  const status = bandHigherIsBetter(pct, 98, 90);

  return {
    key: "slaCompliance",
    label: "SLA Compliance",
    value: round1(pct),
    display: `${Math.round(pct)}%`,
    status,
    detail: `${breached} of ${tickets.length} open tickets flagged >24h past response SLA`,
    benchmark: "default target 98%, not a universal industry figure — measures this app's own SLA_BREACH flag, not a contractual SLA",
    href: "/tech-performance",
  };
}

async function getRankedOpenFlags() {
  const now = new Date();
  const flags = await prisma.attentionFlag.findMany({
    where: {
      status: "OPEN",
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
    include: { ticket: true },
  });
  return flags.sort((a, b) => {
    const rank = ATTENTION_TYPE_RANK[a.type] - ATTENTION_TYPE_RANK[b.type];
    if (rank !== 0) return rank;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

async function kpiEscalations(flags: Awaited<ReturnType<typeof getRankedOpenFlags>>): Promise<Kpi> {
  const escalations = flags.filter((f) => f.type === "ESCALATION" || f.type === "CEO_REVIEW");
  const ceoReview = escalations.filter((f) => f.type === "CEO_REVIEW").length;
  const escalation = escalations.filter((f) => f.type === "ESCALATION").length;
  const count = escalations.length;

  let status: KpiStatus;
  if (ceoReview > 0 || count >= 5) status = "red";
  else if (count >= 1) status = "yellow";
  else status = "green";

  return {
    key: "escalations",
    label: "Escalations",
    value: count,
    display: `${count}`,
    status,
    detail: `${ceoReview} CEO review · ${escalation} escalation${escalation === 1 ? "" : "s"} · unresolved, not re-raised after resolve/snooze`,
    benchmark: "",
    href: "/command-flow",
  };
}

async function kpiDeviceHealth(): Promise<Kpi> {
  const [summary, connection] = await Promise.all([getDeviceHealthSummary(), getNinjaRmmConnectionInfo()]);

  if (summary.total === 0) {
    return {
      key: "deviceHealth",
      label: "Device Fleet",
      value: null,
      display: "—",
      status: "unavailable",
      detail: connection.connected ? "No devices synced yet." : "NinjaRMM not connected.",
      benchmark: "healthy range ≥98% online",
      href: "/devices",
    };
  }

  const pct = (summary.online / summary.total) * 100;
  const status = bandHigherIsBetter(pct, 98, 90);
  return {
    key: "deviceHealth",
    label: "Device Fleet",
    value: round1(pct),
    display: `${Math.round(pct)}%`,
    status,
    detail: `${summary.offline} of ${summary.total} devices offline · point-in-time, so an evening reading is naturally lower`,
    benchmark: "healthy range ≥98% online",
    href: "/devices",
  };
}

async function kpiSeatReconciliation(): Promise<Kpi> {
  const [rows, clientCount] = await Promise.all([
    prisma.seatReconciliation.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.client.count(),
  ]);

  if (rows.length === 0) {
    return {
      key: "seatReconciliation",
      label: "Seat Reconciliation",
      value: null,
      display: "—",
      status: "unavailable",
      detail: "No client has both a NinjaRMM organization and an antivirus agreement item linked yet.",
      benchmark: "",
      href: "/clients",
    };
  }

  const mismatches = rows.filter((r) => r.installedCount !== r.billedQuantity);
  const worst = [...mismatches].sort((a, b) => {
    const pctA = Math.abs(a.installedCount - a.billedQuantity) / Math.max(a.billedQuantity, 1);
    const pctB = Math.abs(b.installedCount - b.billedQuantity) / Math.max(b.billedQuantity, 1);
    return pctB - pctA;
  })[0];
  const worstPct = worst
    ? Math.abs(worst.installedCount - worst.billedQuantity) / Math.max(worst.billedQuantity, 1)
    : 0;

  let status: KpiStatus;
  if (worstPct > 0.2 || mismatches.length >= 3) status = "red";
  else if (mismatches.length >= 1) status = "yellow";
  else status = "green";

  const detail =
    mismatches.length === 0
      ? `No mismatches across ${rows.length} of ${clientCount} clients checked`
      : `${mismatches.length} mismatch(es) across ${rows.length} of ${clientCount} clients checked · worst: ${worst!.client.name} ${worst!.installedCount} installed vs ${worst!.billedQuantity} billed`;

  return {
    key: "seatReconciliation",
    label: "Seat Reconciliation",
    value: mismatches.length,
    display: `${mismatches.length}`,
    status,
    detail,
    benchmark: "",
    href: "/clients",
  };
}

// Framed as the positive metric (answer rate) rather than missed-call
// rate — same underlying numbers, but "92% answered" reads at a glance
// as good/bad correctly with bandHigherIsBetter, matching every other
// rate-shaped KPI on this page (Gross Margin, SLA Compliance). Thresholds
// (90/80) match the pickup-rate bands already used on Tech Performance's
// org KPI strip and Call Activity, so "answer rate" means the same
// percentage everywhere in the app.
async function kpiAnswerRate(): Promise<Kpi> {
  // Directory failure (getContactDirectory) shouldn't block this KPI —
  // it only narrows what excludeFalseMisses can catch (queue-abandons
  // specifically; simultaneous-ring duplicate legs need no directory at
  // all), same "degrade, don't break" handling as everywhere else this
  // directory is consumed.
  const [directory, connection] = await Promise.all([
    getContactDirectory().catch(() => null),
    getUnitedCloudCredentialStatus(),
  ]);
  const summary = await getCallActivitySummary(directory);

  // Scoped to inbound (see CallActivitySummary.inboundToday) — an
  // outbound call the other party didn't pick up isn't a team
  // responsiveness failure, and would otherwise pollute this
  // percentage's denominator with calls that always "succeed" from our
  // own side.
  if (summary.inboundToday === 0) {
    return {
      key: "answerRate",
      label: "Call Answer Rate",
      value: null,
      display: "—",
      status: "unavailable",
      detail: connection.configured ? "No inbound calls yet today." : "United Cloud not connected.",
      benchmark: "healthy range 90%+",
      href: "/calls",
    };
  }

  const answered = summary.inboundToday - summary.missedToday;
  const pct = (answered / summary.inboundToday) * 100;
  const status = bandHigherIsBetter(pct, 90, 80);
  const mins = Math.round(summary.avgDurationSeconds / 60);
  return {
    key: "answerRate",
    label: "Call Answer Rate",
    value: round1(pct),
    display: `${Math.round(pct)}%`,
    status,
    detail: `${answered} of ${summary.inboundToday} inbound calls answered today · avg ${mins}m`,
    benchmark: "healthy range 90%+",
    href: "/calls",
  };
}

// ---------------------------------------------------------------------------
// Locked KPIs — honestly named gaps, never faked
// ---------------------------------------------------------------------------

export const LOCKED_KPIS: LockedKpi[] = [
  { label: "CSAT / NPS", blockedBy: "No survey tool connected (e.g. HaloPSA satisfaction surveys or a standalone CSAT tool)." },
  { label: "Client Churn Rate", blockedBy: "No client lifecycle or cancellation data — Client has no start/end date or status field." },
  { label: "MRR", blockedBy: "AgreementItem carries name/contractType/quantity but no dollar amounts. Needs HaloPSA contract pricing or QuickBooks recurring invoices." },
  { label: "CAC / CLV", blockedBy: "No marketing spend or acquisition tracking — the Marketing Automation module is not built." },
  { label: "Patch / Endpoint Compliance", blockedBy: "NinjaRMM integration reads online/offline and antivirus seat counts only; patch status is not fetched." },
  { label: "First Response Time", blockedBy: "TicketSnapshot has openedAt and lastUpdatedAt but no first-response timestamp from HaloPSA." },
];

// ---------------------------------------------------------------------------
// Prioritized action list — capped at 6 so it never needs to scroll
// ---------------------------------------------------------------------------

const REMEDIATION: Record<string, string> = {
  utilization: "Tech utilization is out of the healthy band — check workload distribution",
  grossMargin: "Gross margin is below target — review the lowest-margin clients",
  ticketBacklog: "Ticket backlog needs triage — a P1 has aged past a day, or the queue has outgrown the team",
  slaCompliance: "SLA compliance has dropped — review breached tickets",
  escalations: "Escalations need attention — a CEO review or a backlog of unresolved escalations is open",
  deviceHealth: "Device fleet health has dropped — check offline devices",
  seatReconciliation: "Seat reconciliation has drifted — installed vs billed counts don't match",
  answerRate: "Call answer rate is low today",
};

function buildActions(
  kpis: Kpi[],
  flags: Awaited<ReturnType<typeof getRankedOpenFlags>>,
): ActionItem[] {
  const actions: ActionItem[] = [];

  for (const kpi of kpis) {
    if (kpi.status === "red") {
      actions.push({
        id: `kpi-${kpi.key}`,
        severity: "red",
        title: REMEDIATION[kpi.key] ?? `${kpi.label} needs attention`,
        detail: kpi.detail,
        href: kpi.href,
      });
    }
  }

  for (const flag of flags.slice(0, 2)) {
    actions.push({
      id: `flag-${flag.id}`,
      severity: flag.type === "ESCALATION" || flag.type === "CEO_REVIEW" ? "red" : "yellow",
      title: flag.description,
      detail: flag.ticket ? `Ticket: ${flag.ticket.summary}` : flag.type,
      href: "/command-flow",
    });
  }

  for (const kpi of kpis) {
    if (kpi.status === "yellow") {
      actions.push({
        id: `kpi-${kpi.key}`,
        severity: "yellow",
        title: REMEDIATION[kpi.key] ?? `${kpi.label} is worth a look`,
        detail: kpi.detail,
        href: kpi.href,
      });
    }
  }

  return actions.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export async function getBusinessHealthSnapshot(): Promise<BusinessHealthSnapshot> {
  const [utilization, grossMargin, ticketBacklog, slaCompliance, flags, deviceHealth, seatReconciliation, answerRate, clientsTotal, financialsAgg, seatAgg] =
    await Promise.all([
      kpiTechUtilization(),
      kpiGrossMargin(),
      kpiTicketBacklog(),
      kpiSlaCompliance(),
      getRankedOpenFlags(),
      kpiDeviceHealth(),
      kpiSeatReconciliation(),
      kpiAnswerRate(),
      prisma.client.count(),
      prisma.clientFinancials.aggregate({ _count: true, _max: { updatedAt: true } }),
      prisma.seatReconciliation.aggregate({ _count: true, _max: { updatedAt: true } }),
    ]);

  const escalations = await kpiEscalations(flags);

  const kpis = [
    utilization,
    grossMargin,
    ticketBacklog,
    slaCompliance,
    escalations,
    deviceHealth,
    seatReconciliation,
    answerRate,
  ];

  return {
    kpis,
    actions: buildActions(kpis, flags),
    locked: LOCKED_KPIS,
    coverage: {
      clientsTotal,
      clientsWithFinancials: financialsAgg._count,
      financialsAsOf: financialsAgg._max.updatedAt,
      clientsWithSeatChecks: seatAgg._count,
      seatChecksAsOf: seatAgg._max.updatedAt,
    },
    generatedAt: new Date(),
  };
}

// Exported for the chat tool that filters by AttentionType (see
// app/api/business-health/chat/route.ts get_attention_flags tool).
export type { AttentionType };
