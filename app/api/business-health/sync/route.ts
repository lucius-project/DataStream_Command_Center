import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { withComputeThrottle } from "@/lib/integrations/haloShared";
import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncDevices } from "@/lib/integrations/ninjaRmm";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";

const SYNC_KEY = "businessHealth";

// Same bundle app/business-health/page.tsx used to run inline before
// every render — now triggered by <BackgroundSync> after the page has
// already painted from whatever's in the DB. Still wrapped in the same
// 60s throttle (this is the app's home page — more likely than any
// other to get hit repeatedly in quick succession).
async function syncBundle(): Promise<string[]> {
  return withComputeThrottle("businessHealthSyncBundle", 60_000, async () => {
    const [tickets, timeGaps, devices, calls] = await Promise.all([
      syncTicketsFromHalo(),
      syncTeamTimeGaps(),
      syncDevices(),
      syncCallActivity(),
    ]);
    return [tickets.error, timeGaps.error, devices.error, calls.error].filter((e): e is string => Boolean(e));
  });
}

export async function POST() {
  await requireRole("SERVICE_MANAGER");

  const errors = await syncBundle();

  const now = new Date();
  const combinedError = errors.length > 0 ? errors.join(" · ") : null;
  await prisma.syncStatus.upsert({
    where: { id: SYNC_KEY },
    update: { lastAttemptAt: now, lastError: combinedError, ...(combinedError ? {} : { lastSyncedAt: now }) },
    create: { id: SYNC_KEY, lastAttemptAt: now, lastError: combinedError, lastSyncedAt: combinedError ? null : now },
  });

  return NextResponse.json({ ok: true, errors });
}
