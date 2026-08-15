// "What am I forgetting?" — scans recent inbox + sent mail for open
// loops: promises made without a visible follow-up, questions asked
// (either direction) that never got answered. This is explicitly a
// best-effort nudge, not an audit: it only sees subject lines and
// Graph's ~255-char bodyPreview (no full-body fetch — reading and
// sending full bodies for every recent thread would be slow and
// expensive for a "might be worth a look" feature), so the prompt and
// the UI both frame findings as things to double-check, never as
// confirmed facts.

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "@/lib/integrations/anthropic";
import { listRecentMailForReview, type ThreadMessage } from "@/lib/integrations/graph";

const LOOKBACK_DAYS = 14;
// Skip anything from the last day — too soon for "no response yet" to
// mean anything.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
// A thread with a lot of back-and-forth is actively being worked, not
// forgotten — keep the candidate set to genuinely thin threads.
const MAX_MESSAGES_PER_THREAD = 6;
const MAX_THREADS = 60;

const FindingSchema = z.object({
  subject: z.string(),
  withWhom: z.string(),
  finding: z.string().max(400),
});
const ResultSchema = z.object({ findings: z.array(FindingSchema) });

export type ForgettingFinding = z.infer<typeof FindingSchema>;

const SYSTEM_PROMPT = `You're reviewing recent email for Lucius Craig, CEO of DataStream Networks Inc., an MSP, looking for open loops he might have lost track of. You'll be given a list of short email threads from the last ${LOOKBACK_DAYS} days — each message shows its direction (sent by Lucius, or received from someone else), sender/recipient, date, subject, and a short preview (not the full email body).

Look for things like:
- Lucius told someone he'd send/do something, and there's no later message in that thread that looks like he followed through
- Someone asked Lucius a question and the thread doesn't show a reply from him
- Someone told Lucius they'd get back to him or send something, and enough time has passed with nothing further
- Lucius asked someone a question and never got an answer

Only report something you can actually see evidence for in the given previews — never guess at content you can't see. Because you only have short previews, not full email bodies, treat every finding as a "might be worth checking," not a certainty — phrase findings as observations ("I can't find a follow-up..." / "doesn't appear to have received a response"), not accusations. If nothing in a thread looks like a real open loop, don't report it — an empty list is a fine, honest answer. Today's date is ${new Date().toISOString().slice(0, 10)}.

For each finding, give: subject (the thread's subject line), withWhom (the other person's name), and finding (one sentence, in the style of: "You told Vincent you'd send the revised server quote but I can't find a subsequent email containing it.").`;

function groupByThread(messages: ThreadMessage[]): ThreadMessage[][] {
  const byId = new Map<string, ThreadMessage[]>();
  for (const m of messages) {
    if (!m.conversationId) continue;
    const list = byId.get(m.conversationId) ?? [];
    list.push(m);
    byId.set(m.conversationId, list);
  }
  return Array.from(byId.values());
}

export async function findWhatsForgotten(accessToken: string): Promise<{ findings: ForgettingFinding[]; threadsReviewed: number }> {
  const connection = await getAnthropicClient();
  if (!connection) {
    throw new Error("Anthropic is not connected. Add your API key on the Integrations page.");
  }
  const { client, model } = connection;

  const messages = await listRecentMailForReview(accessToken, LOOKBACK_DAYS);
  const now = Date.now();

  const threads = groupByThread(messages)
    .filter((thread) => thread.length <= MAX_MESSAGES_PER_THREAD)
    .filter((thread) => {
      const lastMessage = thread[thread.length - 1];
      return now - new Date(lastMessage.date).getTime() >= MIN_AGE_MS;
    })
    .slice(0, MAX_THREADS);

  if (threads.length === 0) {
    return { findings: [], threadsReviewed: 0 };
  }

  const payload = threads.map((thread, i) => ({
    thread: i,
    messages: thread.map((m) => ({
      date: m.date.slice(0, 10),
      direction: m.direction,
      from: m.from,
      to: m.to,
      subject: m.subject,
      preview: m.bodyPreview.slice(0, 300),
    })),
  }));

  const message = await client.messages.parse({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    output_config: { format: zodOutputFormat(ResultSchema) },
  });

  return { findings: message.parsed_output?.findings ?? [], threadsReviewed: threads.length };
}
