import { NextRequest, NextResponse } from "next/server";
import { saveQuickBooksAppCredential } from "@/lib/services/integrations";

export async function POST(request: NextRequest) {
  const { environment, clientId, clientSecret } = (await request.json()) as {
    environment?: string;
    clientId?: string;
    clientSecret?: string;
  };

  if (!environment?.trim() || !clientId?.trim()) {
    return NextResponse.json({ error: "Environment and Client ID are required." }, { status: 400 });
  }

  try {
    await saveQuickBooksAppCredential({
      environment: environment.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
