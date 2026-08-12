import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDelegation } from "@/lib/services/delegation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { note } = (await request.json()) as { note?: string };
  if (!note || !note.trim()) {
    return NextResponse.json({ error: "A note for the agent is required." }, { status: 400 });
  }

  const item = await prisma.runbookItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Runbook item not found." }, { status: 404 });
  }

  await logDelegation("RUNBOOK", id, note);
  return NextResponse.json({ ok: true });
}
