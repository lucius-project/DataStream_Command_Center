import { NextRequest, NextResponse } from "next/server";
import { saveMicrosoftAppCredential } from "@/lib/services/integrations";

export async function POST(request: NextRequest) {
  const { clientId, tenantId, clientSecret } = (await request.json()) as {
    clientId?: string;
    tenantId?: string;
    clientSecret?: string;
  };

  if (!clientId?.trim() || !tenantId?.trim()) {
    return NextResponse.json({ error: "Client ID and Tenant ID are required." }, { status: 400 });
  }

  try {
    await saveMicrosoftAppCredential({
      clientId: clientId.trim(),
      tenantId: tenantId.trim(),
      clientSecret: clientSecret?.trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
