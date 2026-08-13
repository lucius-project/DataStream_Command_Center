// Static "what this measures" / "how it's calculated" copy for the 8
// standard-shaped Kpi tiles (components/business-health/KpiTile.tsx) in
// scope for the info-icon feature — 4 from Service Desk Health
// (lib/services/serviceDeskHealth.ts's getServiceDeskHealthKpis) and 4
// from the Org KPI strip (lib/services/techPerformance.ts's
// getTechOrgKpis). Deliberately NOT sourced from the Kpi object itself —
// `detail`/`benchmark` are live, per-render facts about the *current*
// value; this map is the fixed, per-metric explanation of what the
// metric *is*, authored once from the actual computation logic (not
// generated at runtime). Keyed by Kpi["key"].
export const KPI_INFO_CONTENT: Record<string, { what: string; calculation?: string }> = {
  responseSla: {
    what: "How quickly the team responds to a new ticket for the first time, measured against HaloPSA's own respond-by deadline for that ticket.",
    calculation:
      "Every currently open ticket with a response deadline counts once its outcome is decided — either it was actually responded to, or its deadline already passed with no response. A ticket not yet due and not yet responded has no verdict yet, so it's excluded rather than guessed at. Below a minimum sample size (admin-configurable) the percentage is hidden rather than shown as a shaky number from too few tickets.",
  },
  resolutionSla: {
    what: "How often tickets actually get closed by HaloPSA's fix-by deadline, over a rolling recent window rather than just today's closes (a single day is almost always too small a sample to mean anything).",
    calculation:
      "Looks at every ticket closed within the window (window length is admin-configurable) that had a fix-by target. A closure counts as met if it happened at or before that deadline.",
  },
  techAging: {
    what: "Open tickets that have been sitting a long time and that a technician can actually act on right now — tickets waiting on a customer or vendor reply are excluded, since those aren't a technician workload problem.",
    calculation:
      "Age is business hours elapsed since the ticket was opened, not wall-clock hours, so a ticket sitting overnight doesn't accumulate 'age' the way one sitting all day does. This tile counts only tickets aged past 24 business hours; the bucket breakdown (1-3 days / 3-7 days / 7+ days) underneath shows how old the oldest ones are.",
  },
  answerRate: {
    what: "The share of inbound phone calls the team actually answered today, across the whole hunt group.",
    calculation: "Answered calls ÷ total inbound calls received today, from the phone system's own call log.",
  },
  teamUtilization: {
    what: "How many of the team's expected work hours have actually been logged this week, pro-rated to how far through the work-week it currently is — not compared against a full week's worth of hours on a Tuesday.",
    calculation:
      "Logged hours ÷ (expected weekly hours × fraction of the work-week elapsed so far). The trend line compares against last week's final, complete-week total, since that's a different kind of number than a still-in-progress week.",
  },
  ticketHealth: {
    what: "A quick read on whether any individual technician is currently overloaded with high-priority or aging work — deliberately not a team average, since an average can hide one person drowning while everyone else is fine.",
    calculation:
      "Red if any one technician has more than 2 open P1 tickets or more than 4 aging tickets. Yellow if any technician has any P1 or aging ticket at all. Green otherwise.",
  },
  pickupRate: {
    what: "The share of inbound calls the team answered this week — a longer window than the daily Call Answer Rate tile above, and reported at the whole-team level since one ring on a shared hunt group can't be pinned to a single technician who 'should' have picked it up.",
    calculation: "Answered calls ÷ total inbound calls this week.",
  },
  avgPickupTime: {
    what: "How long an inbound caller waits, on average, once the phone actually starts ringing — a different question than Pickup Rate above, which is only about whether the call gets answered at all.",
    calculation:
      "Average ring duration across every answered inbound call this week that has ring-time data. There's no cited industry benchmark for this one (unlike, say, SLA percentages) — the target shown is a reasonable judgment call, not an external standard.",
  },
};
