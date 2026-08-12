import { NextRequest, NextResponse } from "next/server";
import { completeRunbookItem } from "@/lib/services/runbooks";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const updated = await completeRunbookItem(id);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete item.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
