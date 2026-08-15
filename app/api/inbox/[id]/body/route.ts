import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { getMessageBody, isMessageNotFoundError } from "@/lib/integrations/graph";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  try {
    const accessToken = await getGraphAccessToken();
    const body = await getMessageBody(accessToken, item.graphMessageId);
    return NextResponse.json({ body });
  } catch (err) {
    if (isMessageNotFoundError(err)) {
      return NextResponse.json(
        { error: "This email is no longer in the mailbox — it may have been moved or deleted." },
        { status: 404 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to load the full email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
