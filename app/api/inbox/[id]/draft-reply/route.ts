import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { getMessageBody, isMessageNotFoundError } from "@/lib/integrations/graph";
import { generateDraftReply } from "@/lib/services/inboxClassification";

// Generates text only — nothing is saved to Outlook or to this item
// until the user reviews/edits it and hits the existing reply action
// (POST /api/inbox/[id]/reply), same "draft, never auto-sent" boundary
// that action already enforces.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { instructions?: string };

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  try {
    const accessToken = await getGraphAccessToken();
    const fullBody = await getMessageBody(accessToken, item.graphMessageId);
    const draft = await generateDraftReply({
      sender: item.sender,
      subject: item.subject,
      body: fullBody,
      instructions: body.instructions,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    if (isMessageNotFoundError(err)) {
      return NextResponse.json(
        { error: "This email is no longer in the mailbox, so a draft can't be generated from it." },
        { status: 404 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to generate a draft.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
