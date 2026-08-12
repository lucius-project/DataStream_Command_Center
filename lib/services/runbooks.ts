import { prisma } from "@/lib/prisma";
import type { RunbookFrequency } from "@/app/generated/prisma/client";

const FREQUENCY_DAYS: Record<RunbookFrequency, number | null> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  ONE_OFF: null,
};

// One-off items stay "due" until archived (which happens automatically when
// completed — see completeRunbookItem). Recurring items go due again once
// their interval has elapsed since last completed.
export function computeIsDue(item: {
  frequency: RunbookFrequency;
  lastCompletedAt: Date | null;
  archivedAt: Date | null;
}): boolean {
  if (item.archivedAt) return false;
  if (!item.lastCompletedAt) return true;
  const intervalDays = FREQUENCY_DAYS[item.frequency];
  if (intervalDays === null) return true;
  const daysSince = (Date.now() - item.lastCompletedAt.getTime()) / (24 * 60 * 60 * 1000);
  return daysSince >= intervalDays;
}

function isSnoozed(item: { snoozedUntil: Date | null }): boolean {
  return Boolean(item.snoozedUntil && item.snoozedUntil.getTime() > Date.now());
}

export async function getRunbookBoard() {
  const categories = await prisma.runbookCategory.findMany({
    orderBy: { order: "asc" },
    include: { items: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  return categories.map((cat) => ({
    ...cat,
    items: cat.items.map((item) => ({
      ...item,
      isDue: computeIsDue(item),
      isSnoozed: isSnoozed(item),
    })),
  }));
}

const FREQUENCY_RANK: Record<RunbookFrequency, number> = {
  DAILY: 0,
  WEEKLY: 1,
  MONTHLY: 2,
  ONE_OFF: 3,
};

// The working set for Command Flow: due, not snoozed, most-urgent-frequency
// first, then most overdue (or oldest, for one-offs) first.
export async function getDueRunbookItems() {
  const now = new Date();
  const items = await prisma.runbookItem.findMany({
    where: { archivedAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
    include: { category: true },
  });
  return items
    .filter((item) => computeIsDue(item))
    .sort((a, b) => {
      const rank = FREQUENCY_RANK[a.frequency] - FREQUENCY_RANK[b.frequency];
      if (rank !== 0) return rank;
      const aTime = a.lastCompletedAt?.getTime() ?? a.createdAt.getTime();
      const bTime = b.lastCompletedAt?.getTime() ?? b.createdAt.getTime();
      return aTime - bTime;
    });
}

export type RunbookBoardCategory = Awaited<ReturnType<typeof getRunbookBoard>>[number];
export type RunbookBoardItem = RunbookBoardCategory["items"][number];
export type DueRunbookItem = Awaited<ReturnType<typeof getDueRunbookItems>>[number];

export async function completeRunbookItem(id: string) {
  const item = await prisma.runbookItem.findUnique({ where: { id } });
  if (!item) throw new Error("Runbook item not found.");
  const now = new Date();
  return prisma.runbookItem.update({
    where: { id },
    data: {
      lastCompletedAt: now,
      archivedAt: item.frequency === "ONE_OFF" ? now : null,
      snoozedUntil: null,
    },
  });
}
