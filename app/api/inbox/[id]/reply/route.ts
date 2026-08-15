import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { createDraftReply, isMessageNotFoundError } from "@/lib/integrations/graph";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestBody = (await request.json().catch(() => null)) as { body?: string } | null;
  if (!requestBody || typeof requestBody !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { body } = requestBody;
  if (!body || !body.trim()) {
    return NextResponse.json({ error: "Draft body is required." }, { status: 400 });
  }

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  try {
    const accessToken = await getGraphAccessToken();
    await createDraftReply(accessToken, item.graphMessageId, body);
  } catch (err) {
    if (isMessageNotFoundError(err)) {
      return NextResponse.json(
        {
          error:
            "This email is no longer in the mailbox, so a reply can't be drafted against it. You can still mark it Done, Delegate, or Waiting.",
        },
        { status: 404 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to create draft in Outlook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "DONE", clearedAt: new Date() },
  });
  return NextResponse.json(updated);
}
