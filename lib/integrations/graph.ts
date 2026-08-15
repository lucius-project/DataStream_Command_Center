// Live Microsoft Graph adapter for Inbox Command. Unlike the other
// integrations in this directory, this one is real from day one — see
// the project README for why. Every exported function here takes an
// access token from lib/auth/msal.ts's getGraphAccessToken().

import { Client, GraphError } from "@microsoft/microsoft-graph-client";

// A synced InboxItem's graphMessageId can go stale — the underlying
// email gets moved, filed, or deleted from the real mailbox by Outlook
// rules or the user themselves, independent of this app. Graph reports
// that as a 404 with this specific code, not a generic failure, so
// callers can tell "this message is just gone" apart from a real error
// and respond accordingly (see the inbox action routes).
export function isMessageNotFoundError(err: unknown): boolean {
  return err instanceof GraphError && (err.code === "ErrorItemNotFound" || err.statusCode === 404);
}

export type GraphMessage = {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  receivedAt: string;
  isRead: boolean;
  isFlagged: boolean;
};

function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

// Cheapest real proof a token still works — GET /me returns the signed-in
// user's own profile, no mailbox read required. Used for /integrations'
// live connection-health check, not for anything Inbox Command itself needs.
export async function testGraphConnection(accessToken: string): Promise<void> {
  await getGraphClient(accessToken).api("/me").select("id").get();
}

const MESSAGE_SELECT =
  "id,subject,bodyPreview,from,receivedDateTime,isRead,flag";

type RawGraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
};

function normalize(raw: RawGraphMessage): GraphMessage {
  return {
    id: raw.id,
    sender: raw.from?.emailAddress?.name || raw.from?.emailAddress?.address || "Unknown sender",
    senderEmail: raw.from?.emailAddress?.address || "",
    subject: raw.subject || "(no subject)",
    preview: raw.bodyPreview || "",
    receivedAt: raw.receivedDateTime || new Date().toISOString(),
    isRead: Boolean(raw.isRead),
    isFlagged: raw.flag?.flagStatus === "flagged",
  };
}

// Unread or flagged mail from the primary inbox — the working set for
// triage. Noise filtering (InboxRule) is applied by the caller, not here.
//
// No $orderby here: Exchange rejects combining a server-side sort with an
// OR filter across different properties ("the restriction or sort order
// is too complex"). Sort client-side instead.
export async function listTriageMessages(
  accessToken: string,
  top = 50,
): Promise<GraphMessage[]> {
  const client = getGraphClient(accessToken);
  const response = await client
    .api("/me/mailFolders/inbox/messages")
    .select(MESSAGE_SELECT)
    .filter("isRead eq false or flag/flagStatus eq 'flagged'")
    .top(top)
    .get();

  const messages: RawGraphMessage[] = response.value ?? [];
  return messages
    .map(normalize)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
}

// Full message body as plain text. Requesting text (not HTML) means
// there's never raw email HTML to sanitize or render — Graph converts it
// server-side.
export async function getMessageBody(accessToken: string, messageId: string): Promise<string> {
  const client = getGraphClient(accessToken);
  const message = await client
    .api(`/me/messages/${messageId}`)
    .header("Prefer", 'outlook.body-content-type="text"')
    .select("body")
    .get();
  return message.body?.content?.trim() || "";
}

export async function createDraftReply(
  accessToken: string,
  messageId: string,
  bodyText: string,
): Promise<void> {
  const client = getGraphClient(accessToken);
  const draft = await client.api(`/me/messages/${messageId}/createReply`).post({});
  await client.api(`/me/messages/${draft.id}`).patch({
    body: { contentType: "Text", content: bodyText },
  });
}

// POST /me/messages creates a new message as a draft in the mailbox's
// Drafts folder — it is never sent unless a separate /send call is made
// on it (which this app never does). Same guarantee createDraftReply
// above already relies on, just for a brand-new message instead of a
// reply to an existing thread.
export async function createDraftMessage(
  accessToken: string,
  { toEmail, subject, bodyHtml }: { toEmail: string; subject: string; bodyHtml: string },
): Promise<void> {
  const client = getGraphClient(accessToken);
  await client.api("/me/messages").post({
    subject,
    body: { contentType: "HTML", content: bodyHtml },
    toRecipients: [{ emailAddress: { address: toEmail } }],
  });
}

export async function markMessageRead(accessToken: string, messageId: string): Promise<void> {
  const client = getGraphClient(accessToken);
  await client.api(`/me/messages/${messageId}`).patch({ isRead: true });
}

export async function archiveMessage(accessToken: string, messageId: string): Promise<void> {
  const client = getGraphClient(accessToken);
  await client.api(`/me/messages/${messageId}/move`).post({ destinationId: "archive" });
}

export type ThreadMessage = {
  conversationId: string;
  subject: string;
  bodyPreview: string;
  direction: "received" | "sent";
  from: string;
  to: string;
  date: string;
};

type RawThreadMessage = {
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
};

function recipientNames(recipients: RawThreadMessage["toRecipients"]): string {
  return (recipients ?? [])
    .map((r) => r.emailAddress?.name || r.emailAddress?.address)
    .filter((n): n is string => Boolean(n))
    .join(", ");
}

const THREAD_SELECT = "conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime";

// Inbox + Sent Items from the last `sinceDays`, merged and time-sorted —
// the raw material for "What am I forgetting?" (inboxForgetting.ts),
// which needs both sides of a conversation to tell "they never answered"
// from "I never answered." Two folder calls, not one flat /me/messages
// query, because well-known-folder scoping is explicit and predictable
// here — no ambiguity about which folders got included.
export async function listRecentMailForReview(accessToken: string, sinceDays: number): Promise<ThreadMessage[]> {
  const client = getGraphClient(accessToken);
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceIso = since.toISOString();

  const [inboxRes, sentRes] = await Promise.all([
    client
      .api("/me/mailFolders/inbox/messages")
      .select(THREAD_SELECT)
      .filter(`receivedDateTime ge ${sinceIso}`)
      .top(150)
      .get(),
    client
      .api("/me/mailFolders/sentitems/messages")
      .select(THREAD_SELECT)
      .filter(`sentDateTime ge ${sinceIso}`)
      .top(150)
      .get(),
  ]);

  const inbox: ThreadMessage[] = (inboxRes.value ?? []).map((m: RawThreadMessage) => ({
    conversationId: m.conversationId ?? "",
    subject: m.subject || "(no subject)",
    bodyPreview: m.bodyPreview || "",
    direction: "received",
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown sender",
    to: recipientNames(m.toRecipients),
    date: m.receivedDateTime || new Date().toISOString(),
  }));

  const sent: ThreadMessage[] = (sentRes.value ?? []).map((m: RawThreadMessage) => ({
    conversationId: m.conversationId ?? "",
    subject: m.subject || "(no subject)",
    bodyPreview: m.bodyPreview || "",
    direction: "sent",
    from: "You",
    to: recipientNames(m.toRecipients),
    date: m.sentDateTime || new Date().toISOString(),
  }));

  return [...inbox, ...sent].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
