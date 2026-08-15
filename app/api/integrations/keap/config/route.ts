import { NextRequest, NextResponse } from "next/server";
import { saveKeapAppCredential } from "@/lib/services/integrations";

// No connection test at save time — same reasoning as QuickBooks/NinjaRMM's
// config routes: this is the app registration only, there's no token yet
// to test against until the OAuth redirect (Connect Keap) completes.
export async function POST(request: NextRequest) {
  const { clientId, clientSecret } = (await request.json()) as { clientId?: string; clientSecret?: string };

  if (!clientId?.trim()) {
    return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
  }

  try {
    await saveKeapAppCredential({ clientId: clientId.trim(), clientSecret: clientSecret?.trim() || undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
