// Business Health chat — Claude Sonnet 5 with read-only tools over this
// app's own data. This route imports no sync* function and no mutating
// Prisma method: every tool is a find/count/aggregate. This is a Q&A
// surface, not an admin console — the model can look at the business, not
// change it.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAnthropicClient } from "@/lib/integrations/anthropic";
import { getBusinessHealthSnapshot } from "@/lib/services/businessHealth";
import { getDispatchTickets, getTimeGaps } from "@/lib/services/operations";
import { getDeviceHealthSummary } from "@/lib/services/deviceHealth";
import { getCallActivitySummary } from "@/lib/services/callActivity";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 4000;

const ATTENTION_TYPES = ["ESCALATION", "SLA_BREACH", "CEO_REVIEW", "OTHER"] as const;

const getKpiSnapshot = betaZodTool({
  name: "get_kpi_snapshot",
  description:
    "Get the current Business Health KPI snapshot: all 8 KPIs with their status (green/yellow/red/unavailable), values, and detail text, the prioritized action list, the locked (not-yet-trackable) KPIs, and data coverage. Call this first for any general 'how are we doing' question.",
  inputSchema: z.object({}),
  run: async () => JSON.stringify(await getBusinessHealthSnapshot()),
});

const findClients = betaZodTool({
  name: "find_clients",
  description:
    "Find clients by name (or list top clients by hours this month if no name given), with their hours, agreement items, per-tech hours, financials, and seat reconciliation. financials is null when QuickBooks isn't linked for that client — report it as 'not linked', never as $0.",
  inputSchema: z.object({
    nameContains: z.string().optional().describe("Filter by client name substring, case-sensitive"),
    limit: z.number().int().min(1).max(25).optional().describe("Max clients to return, default 10"),
  }),
  run: async ({ nameContains, limit }) => {
    const clients = await prisma.client.findMany({
      where: nameContains ? { name: { contains: nameContains } } : {},
      include: { agreementItems: true, techHours: true, financials: true, seatChecks: true },
      orderBy: { hoursThisMonth: "desc" },
      take: limit ?? 10,
    });
    return JSON.stringify(
      clients.map((c) => ({
        name: c.name,
        hoursThisMonth: c.hoursThisMonth,
        agreementItems: c.agreementItems.map((i) => ({ name: i.name, contractType: i.contractType, quantity: i.quantity })),
        techHours: c.techHours.map((t) => ({ tech: t.tech, hours: t.hours })),
        financials: c.financials
          ? {
              revenueThisMonth: c.financials.revenueThisMonth,
              laborCost: c.financials.laborCost,
              itemCost: c.financials.itemCost,
              itemRevenue: c.financials.itemRevenue,
              netProfit: c.financials.netProfit,
            }
          : null,
        seats: c.seatChecks.map((s) => ({ tool: s.tool, installed: s.installedCount, billed: s.billedQuantity })),
      })),
    );
  },
});

const getOpenTickets = betaZodTool({
  name: "get_open_tickets",
  description: "List open tickets, optionally filtered by priority, assigned tech, or minimum age in hours.",
  inputSchema: z.object({
    priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
    tech: z.string().optional(),
    agingOverHours: z.number().optional().describe("Only tickets open longer than this many hours"),
    limit: z.number().int().min(1).max(40).optional().describe("Max tickets to return, default 20"),
  }),
  run: async ({ priority, tech, agingOverHours, limit }) => {
    const now = Date.now();
    let tickets = await getDispatchTickets();
    if (priority) tickets = tickets.filter((t) => t.priority === priority);
    if (tech) tickets = tickets.filter((t) => t.assignedTech === tech);
    if (agingOverHours !== undefined) {
      tickets = tickets.filter((t) => (now - t.openedAt.getTime()) / (60 * 60 * 1000) > agingOverHours);
    }
    return JSON.stringify(
      tickets.slice(0, limit ?? 20).map((t) => ({
        haloTicketId: t.haloTicketId,
        summary: t.summary,
        status: t.status,
        priority: t.priority,
        assignedTech: t.assignedTech,
        hoursOpen: Math.round(((now - t.openedAt.getTime()) / (60 * 60 * 1000)) * 10) / 10,
        slaDueAt: t.slaDueAt,
      })),
    );
  },
});

const getAttentionFlags = betaZodTool({
  name: "get_attention_flags",
  description: "List attention flags (escalations, SLA breaches, CEO reviews, other) — open by default.",
  inputSchema: z.object({
    type: z.enum(ATTENTION_TYPES).optional(),
    includeResolved: z.boolean().optional(),
  }),
  run: async ({ type, includeResolved }) => {
    const flags = await prisma.attentionFlag.findMany({
      where: { status: includeResolved ? undefined : "OPEN", type },
      include: { ticket: { select: { haloTicketId: true, summary: true, priority: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return JSON.stringify(
      flags.map((f) => ({
        type: f.type,
        status: f.status,
        description: f.description,
        createdAt: f.createdAt,
        ticket: f.ticket ? { haloTicketId: f.ticket.haloTicketId, summary: f.ticket.summary, priority: f.ticket.priority } : null,
      })),
    );
  },
});

const getTeamHours = betaZodTool({
  name: "get_team_hours",
  description: "Get this week's tech/admin hours (logged vs expected) and this month's per-client-per-tech hour breakdown.",
  inputSchema: z.object({}),
  run: async () => {
    const [gaps, clientTechHours] = await Promise.all([
      getTimeGaps(),
      prisma.clientTechHours.findMany({
        include: { client: { select: { name: true } } },
        orderBy: { hours: "desc" },
        take: 30,
      }),
    ]);
    return JSON.stringify({
      thisWeek: {
        tech: gaps.tech.map((t) => ({ person: t.person, expectedHours: t.expectedHours, loggedHours: t.loggedHours })),
        admin: gaps.admin.map((t) => ({ person: t.person, expectedHours: t.expectedHours, loggedHours: t.loggedHours })),
      },
      thisMonthByClientAndTech: clientTechHours.map((t) => ({ client: t.client.name, tech: t.tech, hours: t.hours })),
    });
  },
});

const getServiceHealth = betaZodTool({
  name: "get_service_health",
  description: "Get device fleet health, today's call activity, and the list of currently offline devices.",
  inputSchema: z.object({}),
  run: async () => {
    const directory = await getContactDirectory().catch(() => null);
    const [devices, calls, offline] = await Promise.all([
      getDeviceHealthSummary(),
      getCallActivitySummary(directory),
      prisma.ninjaDevice.findMany({
        where: { offline: true },
        select: { displayName: true, lastContact: true, osName: true },
        orderBy: { lastContact: "desc" },
        take: 15,
      }),
    ]);
    return JSON.stringify({ devices, calls, offlineDevices: offline });
  },
});

const TOOLS = [getKpiSnapshot, findClients, getOpenTickets, getAttentionFlags, getTeamHours, getServiceHealth];

const SYSTEM_PROMPT = `You are the Business Health assistant for DataStream Networks Inc., an MSP. You're answering the CEO — respond at owner altitude: the number and the decision it implies, not process narration. Plain prose, 1-4 sentences typical, no headings — this renders in a ~360px chat panel.

The 8 KPIs you'll see from get_kpi_snapshot, with their thresholds:
- Tech Utilization: green 70-90%, yellow 50-70%/90-110%, red <50%/>110% of expected hours pro-rated to today.
- Gross Margin: green >=50%, yellow 30-50%, red <30%. "unavailable" means no client has QuickBooks linked — never invent a number.
- Ticket Backlog: red if any P1 has been open >24h or total > 15x tech count; yellow if any P1 open, >25% of tickets aging >24h, or total > 10x tech count. No industry benchmark exists for backlog size — this is a capacity-based default.
- SLA Compliance: green >=98%, yellow 90-98%, red <90%. This measures this app's own SLA_BREACH flag (>24h past HaloPSA's response-due date), NOT a contractual SLA.
- Escalations: red if any CEO_REVIEW flag is open or count >=5, yellow 1-4, green 0. Flags are per (ticket, type) and are not re-raised after a human resolves or snoozes them — this counts unresolved escalations, not all-time volume.
- Device Fleet: green >=98% online, yellow 90-98%, red <90%. Point-in-time — devices powered off overnight read as offline.
- Seat Reconciliation: red if any client's installed-vs-billed count is >20% off or 3+ clients mismatched, yellow for 1-2 minor mismatches, green if none. Only covers clients whose profile page has been visited at least once.
- Call Answer Rate: green >=90%, yellow 80-90%, red <80% of today's calls answered.

Honesty rules — follow these strictly:
- If a metric isn't in get_kpi_snapshot's locked list is asked about (CSAT/NPS, client churn rate, true MRR, CAC/CLV, patch/endpoint compliance %, first response time), say plainly it isn't tracked yet and name what would need to be connected — never estimate or guess a number for these.
- Never report a client's financials as $0 or "no revenue" when find_clients returns financials: null — that means QuickBooks isn't linked for that client, say so.
- Gross margin's service cost is hours logged × the admin-set service hourly rate (Admin Settings) — if that rate isn't configured yet, say the cost side is missing rather than treating $0 as real.
- If asked something the tools can't answer, say so rather than guessing.

You have read-only tools — you can look at the business, not change it. There is nothing to write or update.`;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { messages?: { role: string; content: string }[] } | null;
  const rawMessages = body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return Response.json({ error: "No messages provided." }, { status: 400 });
  }

  const clamped = rawMessages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: (m.content ?? "").slice(0, MAX_MESSAGE_CHARS),
  }));
  if (clamped.every((m) => m.content.trim() === "")) {
    return Response.json({ error: "Message is empty." }, { status: 400 });
  }

  const connection = await getAnthropicClient();
  if (!connection) {
    return Response.json(
      { error: "Anthropic is not connected. Add your API key on the Integrations page." },
      { status: 400 },
    );
  }
  const { client, model } = connection;

  let runner;
  try {
    runner = client.beta.messages.toolRunner({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium" },
      tools: TOOLS,
      messages: clamped,
      max_iterations: 8,
      stream: true,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "Anthropic rejected the stored API key. Re-enter it on the Integrations page." },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Anthropic rate limit hit — try again in a moment." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json({ error: `Anthropic request failed (${err.status}): ${err.message}` }, { status: 502 });
    }
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const messageStream of runner) {
          for await (const event of messageStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[chat failed: ${errorMessage(err)}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
