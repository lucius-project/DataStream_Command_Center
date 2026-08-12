import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDelegation } from "@/lib/services/delegation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { note } = (await request.json()) as { note?: string };
  if (!note || !note.trim()) {
    return NextResponse.json({ error: "A note for the agent is required." }, { status: 400 });
  }

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  await logDelegation("INBOX", id, note);
  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "DELEGATED", delegateNote: note, clearedAt: new Date() },
  });
  return NextResponse.json(updated);
}
