import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { createDraftReply } from "@/lib/integrations/graph";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { body } = (await request.json()) as { body?: string };
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
    const message = err instanceof Error ? err.message : "Failed to create draft in Outlook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "DONE", clearedAt: new Date() },
  });
  return NextResponse.json(updated);
}
