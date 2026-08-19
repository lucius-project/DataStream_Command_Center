import Link from "next/link";
import { SlidersHorizontal, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isConnected } from "@/lib/auth/msal";
import { requireRole } from "@/lib/auth/roleRank";
import { getInboxDailyCounts, getPriorityItems, getWaitingItems, getDelegatedItems } from "@/lib/services/inbox";
import { getStaffUsers } from "@/lib/services/staffUsers";
import { getAnthropicCredentialStatus } from "@/lib/services/integrations";
import { formatAge, formatWaiting, formatDueDate, formatDollarAmount } from "@/lib/inboxDisplay";
import { MorningBrief } from "@/components/inbox/MorningBrief";
import { CategoryCountStrip } from "@/components/inbox/CategoryCountStrip";
import { InboxItemCard } from "@/components/inbox/InboxItemCard";
import { WhatAmIForgetting } from "@/components/inbox/WhatAmIForgetting";
import { BackgroundSync } from "@/components/shared/BackgroundSync";

const BRIEF_COUNT = 4;

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; connectError?: string }>;
}) {
  const session = await requireRole("SERVICE_MANAGER");
  const params = await searchParams;
  const connected = await isConnected();

  // No Microsoft Graph call on this render — that moved to
  // app/api/inbox/sync/route.ts, fired by <BackgroundSync> right after
  // the page paints from whatever's already in the database. Reading
  // these unconditionally (not gated on `connected`) means a sync error
  // no longer hides already-synced mail behind a blank error screen —
  // whatever was last synced stays visible, same as every other page in
  // this rollout.
  const [syncStatus, priorityItems, waitingItems, delegatedItems, counts, anthropicStatus, staff] = await Promise.all([
    prisma.syncStatus.findUnique({ where: { id: "inbox" } }),
    getPriorityItems(),
    getWaitingItems(),
    getDelegatedItems(),
    getInboxDailyCounts(),
    getAnthropicCredentialStatus(),
    getStaffUsers(),
  ]);
  const staffOptions = staff.filter((s) => s.role).map((s) => ({ id: s.id, name: s.name }));
  const syncErrors = syncStatus?.lastError ? syncStatus.lastError.split(" · ") : [];
  const syncError = syncErrors.find((e) => !e.startsWith("Classification:")) ?? null;
  const classifyError = syncErrors.find((e) => e.startsWith("Classification:"))?.replace(/^Classification: /, "") ?? null;

  const briefItems = priorityItems.slice(0, BRIEF_COUNT);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Inbox Command</h1>
          <p className="mt-1 font-data text-xs text-text-faint">{DATE_FORMAT.format(new Date())}</p>
        </div>
        {connected && (
          <div className="flex shrink-0 items-center gap-1.5">
            <BackgroundSync
              syncPath="/api/inbox/sync"
              lastSyncedAt={syncStatus?.lastSyncedAt?.toISOString() ?? null}
              hadLastError={Boolean(syncStatus?.lastError)}
            />
            <WhatAmIForgetting />
            <Link
              href="/inbox/trends"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text-muted hover:text-text"
              aria-label="Inbox trends"
            >
              <TrendingUp size={18} />
            </Link>
            <Link
              href="/inbox/rules"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text-muted hover:text-text"
              aria-label="Noise rules"
            >
              <SlidersHorizontal size={18} />
            </Link>
          </div>
        )}
      </div>

      {params.connectError && (
        <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          Sign-in failed: {params.connectError}
        </div>
      )}
      {params.connected && (
        <div className="mt-4 rounded-md border border-status-ok/40 bg-status-ok-dim px-4 py-3 text-sm text-status-ok">
          Microsoft 365 connected.
        </div>
      )}

      {!connected && (
        <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-border bg-panel p-5">
          <p className="text-sm text-text-muted">
            Not connected yet. Sign in with your DataStream Microsoft 365 account to pull
            unread and flagged mail into triage.
          </p>
          <a
            href="/api/auth/microsoft/login"
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 font-display text-sm font-medium text-bg hover:bg-accent-strong"
          >
            Connect Microsoft 365
          </a>
        </div>
      )}

      {connected && syncError && (
        <div className="mt-6 rounded-lg border border-status-critical/40 bg-status-critical-dim p-5 text-sm text-status-critical">
          Sync failed, showing the last synced data: {syncError}
        </div>
      )}

      {connected && (
        <>
          {!anthropicStatus.configured && (
            <div className="mt-4 rounded-md border border-status-warn/40 bg-status-warn-dim px-4 py-3 text-sm text-status-warn">
              Anthropic isn&apos;t connected, so mail below isn&apos;t categorized or summarized yet — everything
              still shows up, just unsorted. Connect a key on the{" "}
              <Link href="/integrations" className="underline">
                Integrations
              </Link>{" "}
              page to enable AI triage.
            </div>
          )}
          {classifyError && (
            <div className="mt-4 rounded-md border border-status-warn/40 bg-status-warn-dim px-4 py-3 text-sm text-status-warn">
              Some new mail couldn&apos;t be classified: {classifyError}
            </div>
          )}

          <p className="mt-6 text-lg text-text">
            {greeting()}, {session.name.split(" ")[0]}.
          </p>
          {counts && (
            <p className="mt-1 text-sm text-text-muted">
              You&apos;ve received {counts.total} {counts.total === 1 ? "email" : "emails"} today.
            </p>
          )}

          {counts && (
            <div className="mt-4 rounded-lg border border-border bg-panel p-4">
              <CategoryCountStrip counts={counts} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-sm font-semibold tracking-wide text-text-faint uppercase">
                Morning Brief
              </h2>
              <div className="mt-3">
                <MorningBrief items={briefItems} />
              </div>
            </div>

            <div>
              <h2 className="font-display text-sm font-semibold tracking-wide text-text-faint uppercase">
                Today&apos;s Actions
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {briefItems.length === 0 ? (
                  <div className="rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
                    Nothing needs a decision right now.
                  </div>
                ) : (
                  briefItems.map((item) => (
                    <InboxItemCard
                      key={item.id}
                      item={item}
                      staffUsers={staffOptions}
                      showQuickReply={item.category === "CLIENT" || item.category === "APPROVAL"}
                      metaLine={formatDueDate(item.dueDate) ?? formatDollarAmount(item.dollarAmount) ?? formatAge(item.receivedAt)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BoardColumn title="Today" count={priorityItems.length}>
              {priorityItems.map((item) => (
                <InboxItemCard
                  key={item.id}
                  item={item}
                  staffUsers={staffOptions}
                  showQuickReply={item.category === "CLIENT" || item.category === "APPROVAL"}
                  metaLine={formatDueDate(item.dueDate) ?? formatDollarAmount(item.dollarAmount) ?? formatAge(item.receivedAt)}
                />
              ))}
            </BoardColumn>

            <BoardColumn title="Waiting" count={waitingItems.length}>
              {waitingItems.map((item) => (
                <InboxItemCard key={item.id} item={item} staffUsers={staffOptions} metaLine={formatWaiting(item.waitingSince)} />
              ))}
            </BoardColumn>

            <BoardColumn title="Delegated" count={delegatedItems.length}>
              {delegatedItems.map((item) => (
                <InboxItemCard
                  key={item.id}
                  item={item}
                  staffUsers={staffOptions}
                  metaLine={item.delegatedTo ? item.delegatedTo.name : (item.delegateNote ?? undefined)}
                />
              ))}
            </BoardColumn>
          </div>
        </>
      )}
    </div>
  );
}

function BoardColumn({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-sm font-semibold tracking-wide text-text-faint uppercase">{title}</h2>
        <span className="font-data text-xs text-text-faint">{count}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {count === 0 ? (
          <div className="rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">Nothing here.</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
