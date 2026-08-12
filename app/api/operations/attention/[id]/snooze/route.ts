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

  const flag = await prisma.attentionFlag.findUnique({ where: { id } });
  if (!flag) {
    return NextResponse.json({ error: "Attention flag not found." }, { status: 404 });
  }

  const updated = await prisma.attentionFlag.update({ where: { id }, data: { snoozedUntil } });
  return NextResponse.json(updated);
}
