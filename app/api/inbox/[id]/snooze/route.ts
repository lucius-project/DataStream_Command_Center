import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSnoozePreset } from "@/lib/snoozePresets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { preset } = (await request.json()) as { preset?: string };
  const snoozedUntil = preset ? resolveSnoozePreset(preset) : null;
  if (!snoozedUntil) {
    return NextResponse.json({ error: "Unknown snooze preset." }, { status: 400 });
  }

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found." }, { status: 404 });
  }

  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { status: "SNOOZED", snoozedUntil },
  });
  return NextResponse.json(updated);
}
