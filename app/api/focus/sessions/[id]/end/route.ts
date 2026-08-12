import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/services/focus";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { completed } = (await request.json()) as { completed?: boolean };
  try {
    const session = await endSession(id, Boolean(completed));
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to end session.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
