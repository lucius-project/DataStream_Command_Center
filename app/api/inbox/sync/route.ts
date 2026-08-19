import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { syncInboxFromGraph } from "@/lib/services/inbox";

const SYNC_KEY = "inbox";

// Same sync app/inbox/page.tsx used to run inline before every render
// (when Microsoft is connected) — now triggered by <BackgroundSync>
// after the page has already painted from whatever's in the DB.
// syncInboxFromGraph itself no-ops if Microsoft isn't connected, so this
// route doesn't need its own isConnected() check. See SyncStatus's
// schema comment.
export async function POST() {
  await requireRole("SERVICE_MANAGER");

  const errors: string[] = [];
  try {
    const result = await syncInboxFromGraph();
    if (result.classifyError) errors.push(`Classification: ${result.classifyError}`);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Failed to sync with Microsoft Graph.");
  }

  const now = new Date();
  const combinedError = errors.length > 0 ? errors.join(" · ") : null;
  await prisma.syncStatus.upsert({
    where: { id: SYNC_KEY },
    update: { lastAttemptAt: now, lastError: combinedError, ...(combinedError ? {} : { lastSyncedAt: now }) },
    create: { id: SYNC_KEY, lastAttemptAt: now, lastError: combinedError, lastSyncedAt: combinedError ? null : now },
  });

  return NextResponse.json({ ok: true, errors });
}
