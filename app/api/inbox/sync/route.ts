import { NextResponse } from "next/server";
import { syncInboxFromGraph } from "@/lib/services/inbox";

export async function POST() {
  try {
    const result = await syncInboxFromGraph();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
