import { NextRequest, NextResponse } from "next/server";
import { saveNinjaRmmCredential } from "@/lib/services/integrations";

export async function POST(request: NextRequest) {
  const { apiBaseUrl, clientId, clientSecret } = (await request.json()) as {
    apiBaseUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };

  if (!apiBaseUrl?.trim() || !clientId?.trim()) {
    return NextResponse.json({ error: "API base URL and Client ID are required." }, { status: 400 });
  }

  try {
    await saveNinjaRmmCredential({
      apiBaseUrl: apiBaseUrl.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
