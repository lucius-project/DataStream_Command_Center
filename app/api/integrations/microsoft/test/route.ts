import { NextResponse } from "next/server";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { testGraphConnection } from "@/lib/integrations/graph";

export async function POST() {
  try {
    await testGraphConnection(await getGraphAccessToken());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
