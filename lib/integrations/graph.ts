// Live Microsoft Graph adapter for Inbox Command. Unlike the other
// integrations in this directory, this one is real from day one — see
// the project README for why. Every exported function here takes an
// access token from lib/auth/msal.ts's getGraphAccessToken().

import { Client } from "@microsoft/microsoft-graph-client";

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

export async function markMessageRead(accessToken: string, messageId: string): Promise<void> {
  const client = getGraphClient(accessToken);
  await client.api(`/me/messages/${messageId}`).patch({ isRead: true });
}

export async function archiveMessage(accessToken: string, messageId: string): Promise<void> {
  const client = getGraphClient(accessToken);
  await client.api(`/me/messages/${messageId}/move`).post({ destinationId: "archive" });
}
