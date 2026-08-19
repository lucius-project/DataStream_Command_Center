import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { syncTicketsFromHalo, syncTeamTimeGaps, KNOWN_TECHS } from "@/lib/integrations/halopsa";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { syncRemoteSessions } from "@/lib/integrations/ninjaRmm";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getTechPerformance, syncTicketLoadHistory } from "@/lib/services/techPerformance";
import { getServiceDeskHealthSnapshot, syncServiceDeskHealthDaily } from "@/lib/services/serviceDeskHealth";
import { getStaleTickets } from "@/lib/services/operations";
import { getKpiSettings, getTechRoleConfigs } from "@/lib/services/kpiSettings";
import {
  getTechServiceMetrics,
  computeTechPerformanceScore,
  roleFor,
  serviceMetricsFor,
  syncTechScoreDaily,
} from "@/lib/services/techPerformanceScore";

const SYNC_KEY = "techPerformance";

// Everything /tech-performance/page.tsx used to do inline before every
// render — blocking the whole page on HaloPSA/United Cloud/NinjaOne —
// now lives here instead, triggered by BackgroundSync after the page has
// already painted from whatever's in the DB. Same sync calls, same
// cadence (once per page visit via the client component's mount effect),
// just off the critical rendering path. See SyncStatus's schema comment.
export async function POST() {
  await requireSignedIn();

  const errors: string[] = [];

  const [ticketSync, timeGapSync, callSync, remoteSessionSync] = await Promise.all([
    syncTicketsFromHalo(),
    syncTeamTimeGaps(),
    syncCallActivity(),
    syncRemoteSessions(),
  ]);
  if (ticketSync.error) errors.push(`HaloPSA: ${ticketSync.error}`);
  if (timeGapSync.error) errors.push(`HaloPSA: ${timeGapSync.error}`);
  if (callSync.error) errors.push(`United Cloud: ${callSync.error}`);
  if (remoteSessionSync.error) errors.push(`NinjaOne: ${remoteSessionSync.error}`);

  const ticketLoadSync = await syncTicketLoadHistory();
  if (ticketLoadSync.error) errors.push(`Ticket load history: ${ticketLoadSync.error}`);

  // Same error-preserving pattern the page used to use directly — a
  // failure here (e.g. an expired HaloPSA token) is folded into errors
  // below rather than silently discarded.
  const directoryResult = await getContactDirectory()
    .then((directory) => ({ directory, error: undefined as string | undefined }))
    .catch((err) => ({ directory: null, error: err instanceof Error ? err.message : "Directory lookup failed." }));
  if (directoryResult.error) errors.push(`Directory lookup: ${directoryResult.error}`);

  // Freeze today's now-freshly-synced snapshot into daily/per-tech
  // history — same "sync happens up top, then freeze what was just
  // computed" structure the page used to have, just relocated here.
  const [kpiSettings, techRoleConfigs, healthSnapshot, staleTickets, { techs }] = await Promise.all([
    getKpiSettings(),
    getTechRoleConfigs(KNOWN_TECHS),
    getServiceDeskHealthSnapshot(),
    getStaleTickets(),
    getTechPerformance(directoryResult.directory),
  ]);

  const healthDailyError = await syncServiceDeskHealthDaily(healthSnapshot)
    .then(() => null)
    .catch((e: unknown) => (e instanceof Error ? e.message : "Service Desk Health history sync failed."));
  if (healthDailyError) errors.push(`Trend history: ${healthDailyError}`);

  const techScoreWeights = {
    serviceDelivery: kpiSettings.techWeightServiceDelivery,
    quality: kpiSettings.techWeightQuality,
    productivity: kpiSettings.techWeightProductivity,
    workManagement: kpiSettings.techWeightWorkManagement,
    phone: kpiSettings.techWeightPhone,
  };
  const serviceMetricsByTech = await getTechServiceMetrics(staleTickets);
  const techScoreError = await Promise.all(
    techs.map((tech) => {
      const role = roleFor(tech.person, techRoleConfigs);
      const serviceMetrics = serviceMetricsFor(serviceMetricsByTech, tech.person);
      const scoreResult = computeTechPerformanceScore(tech, serviceMetrics, role, techScoreWeights);
      return syncTechScoreDaily(tech.person, scoreResult);
    }),
  )
    .then(() => null)
    .catch((e: unknown) => (e instanceof Error ? e.message : "Technician score history sync failed."));
  if (techScoreError) errors.push(`Trend history: ${techScoreError}`);

  const now = new Date();
  const combinedError = errors.length > 0 ? errors.join(" · ") : null;
  await prisma.syncStatus.upsert({
    where: { id: SYNC_KEY },
    update: { lastAttemptAt: now, lastError: combinedError, ...(combinedError ? {} : { lastSyncedAt: now }) },
    create: { id: SYNC_KEY, lastAttemptAt: now, lastError: combinedError, lastSyncedAt: combinedError ? null : now },
  });

  return NextResponse.json({ ok: true, errors });
}
