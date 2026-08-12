import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { archiveMessage, markMessageRead } from "@/lib/integrations/graph";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  try {
    const accessToken = await getGraphAccessToken();
    await markMessageRead(accessToken, item.graphMessageId);
    await archiveMessage(accessToken, item.graphMessageId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to archive in Outlook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "DONE", clearedAt: new Date() },
  });
  return NextResponse.json(updated);
}
