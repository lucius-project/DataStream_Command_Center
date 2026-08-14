import { NextResponse } from "next/server";
import { fetchNinjaOrganizations } from "@/lib/integrations/ninjaRmm";

export async function POST() {
  try {
    await fetchNinjaOrganizations();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
