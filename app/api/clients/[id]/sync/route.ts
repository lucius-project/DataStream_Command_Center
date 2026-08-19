import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { syncAllClientFinancials } from "@/lib/integrations/quickbooks";
import { syncSeatReconciliation } from "@/lib/integrations/ninjaRmm";

// Per-client SyncStatus row — syncSeatReconciliation is scoped to one
// client, so unlike the list page's "clientProfitability" key, this
// can't be shared across clients. syncAllClientFinancials is the same
// global batch app/api/clients/sync/route.ts already runs; re-running it
// here too is cheap (fixed 3-query batch, not a per-client fan-out) and
// keeps this route self-contained rather than depending on the list
// page having been visited first.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("CEO");
  const { id } = await params;

  const [financialsSync, seatSync] = await Promise.all([syncAllClientFinancials(), syncSeatReconciliation(id)]);
  const errors = [
    financialsSync.error && `QuickBooks: ${financialsSync.error}`,
    seatSync.error && `NinjaOne seats: ${seatSync.error}`,
  ].filter((e): e is string => Boolean(e));

  const syncKey = `clientDetail:${id}`;
  const now = new Date();
  const combinedError = errors.length > 0 ? errors.join(" · ") : null;
  await prisma.syncStatus.upsert({
    where: { id: syncKey },
    update: { lastAttemptAt: now, lastError: combinedError, ...(combinedError ? {} : { lastSyncedAt: now }) },
    create: { id: syncKey, lastAttemptAt: now, lastError: combinedError, lastSyncedAt: combinedError ? null : now },
  });

  return NextResponse.json({ ok: true, errors });
}
