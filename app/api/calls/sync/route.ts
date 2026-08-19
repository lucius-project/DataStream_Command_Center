import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";

const SYNC_KEY = "callActivity";

// Same sync app/calls/page.tsx used to run inline before every render —
// now triggered by <BackgroundSync> after the page has already painted
// from whatever's in the DB. See SyncStatus's schema comment.
export async function POST() {
  await requireRole("SERVICE_MANAGER");

  const sync = await syncCallActivity();
  const errors = [sync.error && `United Cloud: ${sync.error}`].filter((e): e is string => Boolean(e));

  const now = new Date();
  const combinedError = errors.length > 0 ? errors.join(" · ") : null;
  await prisma.syncStatus.upsert({
    where: { id: SYNC_KEY },
    update: { lastAttemptAt: now, lastError: combinedError, ...(combinedError ? {} : { lastSyncedAt: now }) },
    create: { id: SYNC_KEY, lastAttemptAt: now, lastError: combinedError, lastSyncedAt: combinedError ? null : now },
  });

  return NextResponse.json({ ok: true, errors });
}
