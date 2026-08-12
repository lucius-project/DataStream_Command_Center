import { prisma } from "@/lib/prisma";
import { isConnected, getGraphAccessToken } from "@/lib/auth/msal";
import { listTriageMessages, type GraphMessage } from "@/lib/integrations/graph";
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
export async function syncInboxFromGraph(): Promise<{ fetched: number; added: number }> {
  if (!(await isConnected())) {
    return { fetched: 0, added: 0 };
  }

  const accessToken = await getGraphAccessToken();
  const messages = await listTriageMessages(accessToken, 50);
  const rules = await prisma.inboxRule.findMany({ where: { enabled: true } });

  let added = 0;
  for (const msg of messages) {
    const existing = await prisma.inboxItem.findUnique({
      where: { graphMessageId: msg.id },
    });
    if (existing) continue;

    const matchedRule = rules.find((rule) => ruleMatches(rule, msg));
    const isArchiveRule = matchedRule?.action === "ARCHIVE";

    await prisma.inboxItem.create({
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
    added++;
  }

  return { fetched: messages.length, added };
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
