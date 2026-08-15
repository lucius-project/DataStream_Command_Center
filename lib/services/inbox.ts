import { prisma } from "@/lib/prisma";
import { isConnected, getGraphAccessToken } from "@/lib/auth/msal";
import { listTriageMessages, type GraphMessage } from "@/lib/integrations/graph";
import { classifyNewInboxItems } from "@/lib/services/inboxClassification";
import type { InboxItem, InboxRule } from "@/app/generated/prisma/client";

function ruleMatches(rule: InboxRule, msg: GraphMessage): boolean {
  const value = rule.matchValue.toLowerCase();
  switch (rule.matchType) {
    case "SENDER_CONTAINS":
      return (
        msg.sender.toLowerCase().includes(value) ||
        msg.senderEmail.toLowerCase().includes(value)
      );
    case "SUBJECT_CONTAINS":
      return msg.subject.toLowerCase().includes(value);
    case "DOMAIN": {
      const email = msg.senderEmail.toLowerCase();
      return email.endsWith(`@${value}`) || email.includes(`@${value}.`);
    }
    default:
      return false;
  }
}

// Pulls unread/flagged mail from Graph and tracks any new messages locally.
// Never touches items already tracked — status transitions only happen
// through explicit triage actions, so a re-sync can't undo a decision.
// Newly-added items get one AI classification pass at the end (batched,
// see inboxClassification.ts) — existing items are never reclassified
// for the same reason they're never re-triaged.
export async function syncInboxFromGraph(): Promise<{ fetched: number; added: number; classifyError: string | null }> {
  if (!(await isConnected())) {
    return { fetched: 0, added: 0, classifyError: null };
  }

  const accessToken = await getGraphAccessToken();
  const messages = await listTriageMessages(accessToken, 50);
  const rules = await prisma.inboxRule.findMany({ where: { enabled: true } });

  const newItems: { id: string; sender: string; subject: string; preview: string }[] = [];
  for (const msg of messages) {
    const existing = await prisma.inboxItem.findUnique({
      where: { graphMessageId: msg.id },
    });
    if (existing) continue;

    const matchedRule = rules.find((rule) => ruleMatches(rule, msg));
    const isArchiveRule = matchedRule?.action === "ARCHIVE";

    const created = await prisma.inboxItem.create({
      data: {
        graphMessageId: msg.id,
        sender: msg.sender,
        senderEmail: msg.senderEmail,
        subject: msg.subject,
        preview: msg.preview,
        receivedAt: new Date(msg.receivedAt),
        isNoise: Boolean(matchedRule),
        status: isArchiveRule ? "DONE" : "NEW",
        clearedAt: isArchiveRule ? new Date() : null,
      },
    });
    newItems.push({ id: created.id, sender: created.sender, subject: created.subject, preview: created.preview });
  }

  let classifyError: string | null = null;
  if (newItems.length > 0) {
    try {
      const result = await classifyNewInboxItems(newItems);
      classifyError = result.error;
    } catch (err) {
      classifyError = err instanceof Error ? err.message : "Classification failed.";
    }
  }

  return { fetched: messages.length, added: newItems.length, classifyError };
}

// The active triage queue: real-decision mail only, oldest first so
// nothing quietly rots at the bottom. Snoozed items rejoin once due.
export async function getTriageQueue(): Promise<InboxItem[]> {
  const now = new Date();
  return prisma.inboxItem.findMany({
    where: {
      isNoise: false,
      OR: [
        { status: "NEW" },
        { status: "TRIAGED" },
        { status: "SNOOZED", snoozedUntil: { lte: now } },
      ],
    },
    orderBy: { receivedAt: "asc" },
  });
}

export async function getTriageQueueCount(): Promise<number> {
  const queue = await getTriageQueue();
  return queue.length;
}

const LOW_PRIORITY_TIERS = new Set(["DELEGATABLE", "INFORMATIONAL", "NEWSLETTER"]);

function priorityRank(urgency: InboxItem["urgency"]): number {
  if (urgency === "ATTENTION_TODAY") return 0;
  if (urgency === "DECISION") return 1;
  return 2; // unclassified — see comment below
}

// The TODAY board: active mail worth Lucius's own attention — a subset
// of getTriageQueue(), re-sorted so ATTENTION_TODAY leads DECISION.
// Unclassified items (Anthropic never connected, or a sync's
// classification batch failed) are kept rather than dropped — hiding
// mail just because the AI pass didn't run would be worse than showing
// it unsorted, so they sort last but still appear.
export async function getPriorityItems(): Promise<InboxItem[]> {
  const queue = await getTriageQueue();
  return queue
    .filter((item) => !item.urgency || !LOW_PRIORITY_TIERS.has(item.urgency))
    .sort((a, b) => priorityRank(a.urgency) - priorityRank(b.urgency));
}

// WAITING board — items explicitly marked "waiting on a reply" (see
// app/api/inbox/[id]/waiting), oldest wait first.
export async function getWaitingItems(): Promise<InboxItem[]> {
  return prisma.inboxItem.findMany({
    where: { status: "WAITING" },
    orderBy: { waitingSince: "asc" },
  });
}

export type DelegatedInboxItem = InboxItem & { delegatedTo: { id: string; name: string } | null };

// DELEGATED board — most recently delegated first.
export async function getDelegatedItems(): Promise<DelegatedInboxItem[]> {
  return prisma.inboxItem.findMany({
    where: { status: "DELEGATED" },
    include: { delegatedTo: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export type InboxDailyCounts = {
  total: number;
  attentionToday: number;
  decision: number;
  delegatable: number;
  informational: number;
  newsletter: number;
  unclassified: number;
};

// Header strip counts — "since your last review" is approximated as
// "received today" (start of local day): this app has no persisted
// per-user last-viewed bookmark, and a calendar-day count is an honest
// stand-in for a page framed as a daily morning digest rather than a
// fabricated "since you last looked" figure.
export async function getInboxDailyCounts(): Promise<InboxDailyCounts> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const items = await prisma.inboxItem.findMany({
    where: { receivedAt: { gte: start } },
    select: { urgency: true },
  });

  const counts: InboxDailyCounts = {
    total: items.length,
    attentionToday: 0,
    decision: 0,
    delegatable: 0,
    informational: 0,
    newsletter: 0,
    unclassified: 0,
  };
  for (const item of items) {
    switch (item.urgency) {
      case "ATTENTION_TODAY":
        counts.attentionToday++;
        break;
      case "DECISION":
        counts.decision++;
        break;
      case "DELEGATABLE":
        counts.delegatable++;
        break;
      case "INFORMATIONAL":
        counts.informational++;
        break;
      case "NEWSLETTER":
        counts.newsletter++;
        break;
      default:
        counts.unclassified++;
    }
  }
  return counts;
}

export type TrendDay = { date: string; incoming: number; cleared: number };

// Incoming vs cleared per day, oldest to newest — the "am I getting ahead
// of it" view.
export async function getInboxTrend(days = 14): Promise<TrendDay[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const items = await prisma.inboxItem.findMany({
    where: {
      OR: [{ receivedAt: { gte: start } }, { clearedAt: { gte: start } }],
    },
    select: { receivedAt: true, clearedAt: true },
  });

  const buckets = new Map<string, TrendDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, incoming: 0, cleared: 0 });
  }

  for (const item of items) {
    const receivedKey = item.receivedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(receivedKey);
    if (bucket) bucket.incoming++;

    if (item.clearedAt) {
      const clearedKey = item.clearedAt.toISOString().slice(0, 10);
      const clearedBucket = buckets.get(clearedKey);
      if (clearedBucket) clearedBucket.cleared++;
    }
  }

  return Array.from(buckets.values());
}
