import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Manual only, by design — the WAITING board tracks "I've done my part,
// now waiting on them," which this app can't infer from Graph without
// sent-mail/thread tracking it doesn't have, so this stays a deliberate
// click rather than an automatic detection.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "WAITING", waitingSince: new Date() },
  });
  return NextResponse.json(updated);
}
