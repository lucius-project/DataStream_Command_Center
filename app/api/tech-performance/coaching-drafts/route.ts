import { NextResponse } from "next/server";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { createDraftMessage } from "@/lib/integrations/graph";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getServiceDeskHealthSnapshot, getServiceDeskHealthWeekAgo, getSlaAtRiskTickets } from "@/lib/services/serviceDeskHealth";
import { getStaleTickets } from "@/lib/services/operations";
import { getTechPerformance, getYesterdayHoursByPerson, getCallStatsByTechYesterday } from "@/lib/services/techPerformance";
import { getTechServiceMetrics, computeTechPerformanceScore, roleFor, serviceMetricsFor, getTechScoreWeekAgo } from "@/lib/services/techPerformanceScore";
import { generateManagerAlerts } from "@/lib/services/managerAlerts";
import { getCallAnswerRateTrend } from "@/lib/services/callActivity";
import { getRemoteSessionCountsYesterday } from "@/lib/services/remoteSessions";
import { getOrgCoachingInsights, getTechCoachingInsights } from "@/lib/services/coaching";
import { getKpiSettings, getTechRoleConfigs } from "@/lib/services/kpiSettings";
import { getTechEmails } from "@/lib/services/techEmails";
import { slaFocusItems, alertFocusItems, trainingFocusItems, groupByTechnician, formatFocusItemsAsEmailHtml, type TechStats } from "@/lib/services/techFocus";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { prisma } from "@/lib/prisma";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

// Recomputes exactly what Huddle Mode's TechFocusSection already shows —
// same service calls app/tech-performance/huddle/page.tsx makes, not a
// second, differently-computed version — then drafts one HTML email per
// technician into lcraig@dsnets.com's own mailbox (never sent; see
// createDraftMessage's own comment on why that's guaranteed), styled
// like the tech's own widget with SOP-grounded remediation steps per
// item (see techFocus.ts's slaRemediation/ALERT_REMEDIATION). Every
// known tech gets a draft, even one with nothing flagged — this is
// framed as a positive daily check-in (yesterday's numbers + an
// appreciative note), not just an issue report, so a clean day still
// deserves an email. Manual trigger only, by design: this app has no
// scheduled-job infrastructure, and the user explicitly chose a button
// over building one just for this.
//
// An optional JSON body `{ technician }` scopes the run to a single tech
// (the per-card button on /tech-performance) instead of every known tech
// (the huddle page's "Generate Coaching Drafts" button, which sends no
// body). Everything upstream of the final send loop is still computed
// for the whole team either way — the per-tech items map already needs
// every tech's data to attribute alerts/SLA rows correctly, so scoping
// earlier would risk a single-tech run silently seeing different alert
// context than the same tech gets in a full run.
export async function POST(request: Request) {
  let technician: Tech | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.technician === "string" && (KNOWN_TECHS as readonly string[]).includes(body.technician)) {
      technician = body.technician as Tech;
    }
  } catch {
    // No body (or invalid JSON) — the "generate for all techs" button
    // sends no body at all, which is the normal case here.
  }

  try {
    // Best-effort, not blocking — a directory failure shouldn't stop
    // today's drafts from being generated (see this route's own header
    // comment on why a clean day still deserves an email), but the real
    // error is worth surfacing rather than silently discarding, same
    // reasoning as app/calls/page.tsx's directory handling.
    let directoryError: string | undefined;
    const directory = await getContactDirectory().catch((err) => {
      directoryError = err instanceof Error ? err.message : "Directory lookup failed.";
      return null;
    });

    const [healthSnapshot, healthWeekAgo, slaAtRisk, staleTickets, kpiSettings, techRoleConfigs, haloCredential] = await Promise.all([
      getServiceDeskHealthSnapshot(),
      getServiceDeskHealthWeekAgo(),
      getSlaAtRiskTickets(),
      getStaleTickets(),
      getKpiSettings(),
      getTechRoleConfigs(KNOWN_TECHS),
      prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } }),
    ]);
    const instanceUrl = haloCredential?.instanceUrl ?? null;
    const techScoreWeights = {
      serviceDelivery: kpiSettings.techWeightServiceDelivery,
      quality: kpiSettings.techWeightQuality,
      productivity: kpiSettings.techWeightProductivity,
      workManagement: kpiSettings.techWeightWorkManagement,
      phone: kpiSettings.techWeightPhone,
    };

    const [
      { techs, org, todayIndex, lastWeek, lastWeekHoursByPerson },
      serviceMetricsByTech,
      callAnswerRateTrend,
      techEmails,
      yesterdayHoursByPerson,
      yesterdayCallStatsByPerson,
      yesterdayRemoteSessionsByPerson,
    ] = await Promise.all([
      getTechPerformance(directory),
      getTechServiceMetrics(staleTickets),
      getCallAnswerRateTrend(directory),
      getTechEmails(KNOWN_TECHS),
      getYesterdayHoursByPerson(),
      getCallStatsByTechYesterday(directory),
      getRemoteSessionCountsYesterday(),
    ]);

    // Same construction as huddle/page.tsx's own techStats map — one
    // definition of "yesterday's numbers" for a tech, not two.
    const techStats = new Map<Tech, TechStats>(
      KNOWN_TECHS.map((person) => [
        person,
        {
          lastWeekHours: lastWeekHoursByPerson.get(person) ?? null,
          yesterdayHours: yesterdayHoursByPerson.get(person) ?? null,
          yesterdayInboundCalls: yesterdayCallStatsByPerson.get(person)?.inbound ?? null,
          yesterdayOutboundCalls: yesterdayCallStatsByPerson.get(person)?.outbound ?? null,
          yesterdayRemoteSessions: yesterdayRemoteSessionsByPerson.get(person) ?? null,
        },
      ]),
    );

    const scoreByTech = new Map(
      techs.map((tech) => [
        tech.person as Tech,
        computeTechPerformanceScore(tech, serviceMetricsFor(serviceMetricsByTech, tech.person), roleFor(tech.person, techRoleConfigs), techScoreWeights),
      ]),
    );
    const techScoreWeekAgoByTech = new Map(
      await Promise.all(techs.map(async (tech) => [tech.person as Tech, await getTechScoreWeekAgo(tech.person)] as const)),
    );

    const expectedHoursToDate = techs.reduce((sum, t) => sum + t.expectedHoursToDate, 0);
    const alerts = await generateManagerAlerts({
      health: healthSnapshot,
      slaAtRisk,
      techs,
      org,
      lastWeek,
      todayIndex,
      expectedHoursToDate,
      directory,
    });
    const coachingInsights = [
      ...getOrgCoachingInsights(healthSnapshot, healthWeekAgo, callAnswerRateTrend),
      ...techs.flatMap((tech) =>
        getTechCoachingInsights(tech.person, scoreByTech.get(tech.person as Tech)!, techScoreWeekAgoByTech.get(tech.person as Tech) ?? null),
      ),
    ];

    const items = [
      ...slaFocusItems(slaAtRisk, KNOWN_TECHS, instanceUrl),
      ...alertFocusItems(alerts, KNOWN_TECHS),
      ...trainingFocusItems(coachingInsights, KNOWN_TECHS),
    ];
    const itemsByTech = new Map(groupByTechnician(items).map((g) => [g.technician, g.items]));

    const accessToken = await getGraphAccessToken();
    const today = DATE_FORMAT.format(new Date());
    const created: string[] = [];
    const skipped: { technician: string; reason: string }[] = [];

    const targets = technician ? [technician] : KNOWN_TECHS;
    for (const person of targets) {
      const email = techEmails.get(person);
      if (!email) {
        skipped.push({ technician: person, reason: "No HaloPSA agent email found for this name." });
        continue;
      }
      try {
        await createDraftMessage(accessToken, {
          toEmail: email,
          subject: `Daily Coaching — ${person} — ${today}`,
          bodyHtml: formatFocusItemsAsEmailHtml(person, itemsByTech.get(person) ?? [], techStats.get(person)),
        });
        created.push(person);
      } catch (err) {
        skipped.push({
          technician: person,
          reason: err instanceof Error ? err.message : "Failed to create draft.",
        });
      }
    }

    return NextResponse.json({ created, skipped, directoryError });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate coaching drafts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
