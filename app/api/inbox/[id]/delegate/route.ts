import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDelegation } from "@/lib/services/delegation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { note, delegatedToId } = (await request.json()) as { note?: string; delegatedToId?: string | null };
  if (!note || !note.trim()) {
    return NextResponse.json({ error: "A note is required." }, { status: 400 });
  }

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  if (delegatedToId) {
    const assignee = await prisma.staffUser.findUnique({ where: { id: delegatedToId } });
    if (!assignee) {
      return NextResponse.json({ error: "Selected staff member not found." }, { status: 400 });
    }
  }

  await logDelegation("INBOX", id, note);
  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "DELEGATED", delegateNote: note, delegatedToId: delegatedToId || null, clearedAt: new Date() },
  });
  return NextResponse.json(updated);
}
