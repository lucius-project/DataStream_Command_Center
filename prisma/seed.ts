import { prisma } from "@/lib/prisma";
import { syncTicketsFromHalo } from "@/lib/integrations/halopsa";
import { startOfWeek, endOfWeek } from "@/lib/dateUtils";

async function seedAttentionFlags() {
  const backupTicket = await prisma.ticketSnapshot.findUnique({ where: { haloTicketId: "HALO-10238" } });
  const ransomwareTicket = await prisma.ticketSnapshot.findUnique({ where: { haloTicketId: "HALO-10235" } });
  const billingTicket = await prisma.ticketSnapshot.findUnique({ where: { haloTicketId: "HALO-10240" } });

  const flags = [
    backupTicket && {
      source: "TICKET" as const,
      ticketId: backupTicket.id,
      type: "SLA_BREACH" as const,
      description: "Backup job ticket has been waiting on customer for over a day — SLA already passed.",
      status: "OPEN" as const,
      assignedTo: "Miguel",
    },
    ransomwareTicket && {
      source: "TICKET" as const,
      ticketId: ransomwareTicket.id,
      type: "CEO_REVIEW" as const,
      description: "Miguel flagged this for your awareness — Huntress ransomware alert, actively contained but worth knowing about.",
      status: "OPEN" as const,
      assignedTo: "Miguel",
    },
    billingTicket && {
      source: "TICKET" as const,
      ticketId: billingTicket.id,
      type: "ESCALATION" as const,
      description: "Client is threatening to churn over a billing dispute. Emily doesn't want to make the call alone.",
      status: "OPEN" as const,
      assignedTo: "Emily",
    },
    {
      source: "MANUAL" as const,
      type: "OTHER" as const,
      description: "Barb needs a decision on the DNSFilter renewal before Friday — price went up 12%.",
      status: "OPEN" as const,
      assignedTo: "Barb",
    },
    {
      source: "MANUAL" as const,
      type: "OTHER" as const,
      description: "Client mentioned slow response time on last week's ticket — worth a follow-up call, not urgent.",
      status: "ACKNOWLEDGED" as const,
      assignedTo: null,
    },
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));

  for (const flag of flags) {
    await prisma.attentionFlag.create({ data: flag });
  }
}

async function seedTimeGaps() {
  const periodStart = startOfWeek();
  const periodEnd = endOfWeek();

  // Barb doesn't track hours, so she's intentionally not in this list —
  // Team time gaps is techs only.
  const rows: { person: string; role: "TECH" | "ADMIN"; expectedHours: number; loggedHours: number }[] = [
    { person: "Miguel", role: "TECH", expectedHours: 40, loggedHours: 41.5 },
    { person: "Cameron", role: "TECH", expectedHours: 40, loggedHours: 37.5 },
    { person: "Darryl", role: "TECH", expectedHours: 40, loggedHours: 31 },
    { person: "Emily", role: "TECH", expectedHours: 40, loggedHours: 35.5 },
  ];

  for (const row of rows) {
    await prisma.timeGap.create({ data: { ...row, periodStart, periodEnd } });
  }
}

const RUNBOOK_CATEGORIES: {
  name: string;
  order: number;
  items: { title: string; description?: string; frequency: "ONE_OFF" | "DAILY" | "WEEKLY" | "MONTHLY" }[];
}[] = [
  {
    name: "Marketing",
    order: 0,
    items: [
      { title: "Post to LinkedIn", frequency: "WEEKLY" },
      { title: "Publish a blog post", frequency: "WEEKLY" },
      { title: "Review website analytics", frequency: "MONTHLY" },
    ],
  },
  {
    name: "Sales",
    order: 1,
    items: [
      { title: "Follow up on open quotes", frequency: "WEEKLY" },
      { title: "Review pipeline in Keap", frequency: "WEEKLY" },
    ],
  },
  {
    name: "Account Management",
    order: 2,
    items: [
      { title: "Check in with top 5 accounts", frequency: "WEEKLY" },
      { title: "Review churn-risk accounts", frequency: "MONTHLY" },
    ],
  },
  {
    name: "Billing",
    order: 3,
    items: [
      { title: "Review AR aging report", description: "Ask Barb for the latest export.", frequency: "WEEKLY" },
      { title: "Approve outstanding invoices", frequency: "WEEKLY" },
    ],
  },
  {
    name: "Vendor Relationships",
    order: 4,
    items: [
      { title: "Review vendor contract renewals", frequency: "MONTHLY" },
      { title: "Check in with BitDefender / Huntress / DNSFilter reps", frequency: "MONTHLY" },
    ],
  },
];

async function seedRunbooks() {
  for (const cat of RUNBOOK_CATEGORIES) {
    const category = await prisma.runbookCategory.create({
      data: { name: cat.name, order: cat.order },
    });
    for (const item of cat.items) {
      await prisma.runbookItem.create({
        data: { categoryId: category.id, title: item.title, description: item.description, frequency: item.frequency },
      });
    }
  }
}

async function main() {
  const existingTickets = await prisma.ticketSnapshot.count();
  const existingFlags = await prisma.attentionFlag.count();
  const existingTimeGaps = await prisma.timeGap.count();
  const existingRunbookCategories = await prisma.runbookCategory.count();

  await syncTicketsFromHalo();
  if (existingFlags === 0) await seedAttentionFlags();
  if (existingTimeGaps === 0) await seedTimeGaps();
  if (existingRunbookCategories === 0) await seedRunbooks();

  console.log(
    `Seeded: tickets synced, ${existingFlags === 0 ? "attention flags added" : "attention flags already present"}, ${
      existingTimeGaps === 0 ? "time gaps added" : "time gaps already present"
    }, ${
      existingRunbookCategories === 0 ? "runbooks added" : "runbooks already present"
    } (had ${existingTickets} tickets before this run).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
