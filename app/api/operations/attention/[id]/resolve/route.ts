import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const flag = await prisma.attentionFlag.findUnique({ where: { id } });
  if (!flag) {
    return NextResponse.json({ error: "Attention flag not found." }, { status: 404 });
  }

  const updated = await prisma.attentionFlag.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return NextResponse.json(updated);
}
