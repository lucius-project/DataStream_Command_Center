// AI classification for Inbox Command — the one place in this app an
// LLM is allowed to label operational mail, not compute a KPI or invent
// a fact (see coaching.ts's header for why that line matters here).
// Every field it produces (category/urgency/brief/actionTitle) is a
// judgment call about existing text, and dueDate/dollarAmount are only
// ever extracted when the email states them explicitly — the prompt
// tells the model to leave both null rather than guess.
//
// Batched (not one call per email) — 37 emails a day at one call each
// is slow and needlessly expensive; grouping into chunks keeps this to
// a handful of requests per sync.

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "@/lib/integrations/anthropic";
import { prisma } from "@/lib/prisma";

const CHUNK_SIZE = 12;

const ItemSchema = z.object({
  id: z.string(),
  category: z.enum(["CLIENT", "APPROVAL", "INTERNAL", "SALES", "OTHER"]),
  urgency: z.enum(["ATTENTION_TODAY", "DECISION", "DELEGATABLE", "INFORMATIONAL", "NEWSLETTER"]),
  brief: z.string().max(320),
  actionTitle: z.string().max(80),
  dueDate: z.string().nullable(),
  dollarAmount: z.number().nullable(),
});
const ClassificationSchema = z.object({ items: z.array(ItemSchema) });

const SYSTEM_PROMPT = `You triage email for Lucius Craig, CEO of DataStream Networks Inc., an MSP. You'll be given a batch of emails (sender, subject, preview text only — not the full body). Classify each one.

category — what kind of email this is:
- CLIENT: from or about a client account (pricing questions, service requests, escalations)
- APPROVAL: needs a yes/no decision or sign-off (invoices, quotes, contract/licensing changes)
- INTERNAL: from a coworker/employee, internal operations
- SALES: prospecting, new business, partnership pitches
- OTHER: anything real and substantive that doesn't fit the above

urgency — how soon Lucius personally needs to act:
- ATTENTION_TODAY: time-sensitive, needs his eyes today (SLA-adjacent, an escalation, blocking someone)
- DECISION: needs a real decision from him, not necessarily today
- DELEGATABLE: someone else on the team could reasonably handle this instead of him
- INFORMATIONAL: FYI, no action needed, worth knowing
- NEWSLETTER: marketing, newsletters, automated digests, notifications with no real content

For each email also produce:
- brief: 1-2 plain sentences summarizing what it's about and what's being asked — written for a busy exec skimming a morning brief, not a restatement of the subject line
- actionTitle: a short imperative verb phrase for what he'd need to do, e.g. "Reply to Marc" or "Approve Microsoft licensing change" — omit if urgency is INFORMATIONAL or NEWSLETTER (use the empty string)
- dueDate: an ISO date (YYYY-MM-DD) ONLY if the email states an explicit deadline in the given text; null otherwise — never infer or guess one
- dollarAmount: a plain number ONLY if the email states a specific dollar figure in the given text (an invoice/quote/price); null otherwise — never estimate one

Return one entry per email, in the same order given, using the same id.`;

export type ClassifyResult = { classified: number; failed: number; error: string | null };

// Classifies whatever's passed in and writes the results straight to
// InboxItem — called once per sync, only for rows just inserted (see
// syncInboxFromGraph's "never touches items already tracked" rule,
// which this respects by construction: callers only pass new items).
export async function classifyNewInboxItems(
  items: { id: string; sender: string; subject: string; preview: string }[],
): Promise<ClassifyResult> {
  if (items.length === 0) return { classified: 0, failed: 0, error: null };

  const connection = await getAnthropicClient();
  if (!connection) {
    return { classified: 0, failed: items.length, error: null };
  }
  const { client, model } = connection;

  let classified = 0;
  let failed = 0;
  let error: string | null = null;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    try {
      const message = await client.messages.parse({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              chunk.map((c) => ({ id: c.id, sender: c.sender, subject: c.subject, preview: c.preview.slice(0, 600) })),
            ),
          },
        ],
        output_config: { format: zodOutputFormat(ClassificationSchema) },
      });

      const results = message.parsed_output?.items ?? [];
      await Promise.all(
        results.map((r) =>
          prisma.inboxItem.update({
            where: { id: r.id },
            data: {
              category: r.category,
              urgency: r.urgency,
              brief: r.brief,
              actionTitle: r.actionTitle || null,
              dueDate: r.dueDate ? new Date(r.dueDate) : null,
              dollarAmount: r.dollarAmount,
              classifiedAt: new Date(),
            },
          }),
        ),
      );
      classified += results.length;
      failed += chunk.length - results.length;
    } catch (err) {
      failed += chunk.length;
      error = err instanceof Error ? err.message : "Classification failed.";
    }
  }

  return { classified, failed, error };
}

// On-demand, one email at a time — used by the "Draft Reply" action,
// not part of the sync-time batch above. instructions is optional
// free text ("tell him yes, but we need 30 days") the user can type
// before generating; without it the model just answers the email
// reasonably from its own content.
export async function generateDraftReply(params: {
  sender: string;
  subject: string;
  body: string;
  instructions?: string;
}): Promise<string> {
  const connection = await getAnthropicClient();
  if (!connection) {
    throw new Error("Anthropic is not connected. Add your API key on the Integrations page.");
  }
  const { client, model } = connection;

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: `You draft email replies for Lucius Craig, CEO of DataStream Networks Inc., an MSP, in his voice: direct, professional, no corporate fluff. Write ONLY the reply body — no subject line, no signature block. This is a first draft he will read and edit before sending, not a final message — get the substance right and keep it concise.`,
    messages: [
      {
        role: "user",
        content: `Original email from ${params.sender}, subject "${params.subject}":\n\n${params.body.slice(0, 4000)}\n\n${
          params.instructions?.trim()
            ? `Instructions for the reply: ${params.instructions.trim()}`
            : "Write a reasonable reply based on the email content."
        }`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text" || !textBlock.text.trim()) {
    throw new Error("Anthropic returned no draft text.");
  }
  return textBlock.text.trim();
}
