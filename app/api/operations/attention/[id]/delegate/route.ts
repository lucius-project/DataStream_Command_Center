import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDelegation } from "@/lib/services/delegation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { note } = (await request.json()) as { note?: string };
  if (!note || !note.trim()) {
    return NextResponse.json({ error: "A note for the agent is required." }, { status: 400 });
  }

  const flag = await prisma.attentionFlag.findUnique({ where: { id } });
  if (!flag) {
    return NextResponse.json({ error: "Attention flag not found." }, { status: 404 });
  }

  await logDelegation("OPERATIONS", id, note);
  const updated = await prisma.attentionFlag.update({
    where: { id },
    data: { status: "ACKNOWLEDGED" },
  });
  return NextResponse.json(updated);
}
