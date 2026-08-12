import { NextRequest, NextResponse } from "next/server";
import { startSession } from "@/lib/services/focus";

export async function POST(request: NextRequest) {
  const { task } = (await request.json()) as { task?: string };
  if (!task || !task.trim()) {
    return NextResponse.json({ error: "A task name is required." }, { status: 400 });
  }
  const session = await startSession(task.trim());
  return NextResponse.json(session, { status: 201 });
}
