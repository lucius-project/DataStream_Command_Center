import { NextResponse } from "next/server";
import { getValidKeapAccessToken } from "@/lib/auth/keapOAuth";

// Token-only, same as the connection-health check in
// lib/services/integrations.ts's getKeapConnectionInfo — Phase C1
// hasn't confirmed a safe, cheap real-data endpoint yet (that's Phase
// C2's live discovery). This still proves the OAuth token/refresh flow
// genuinely works, not just that a row exists.
export async function POST() {
  try {
    await getValidKeapAccessToken();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
