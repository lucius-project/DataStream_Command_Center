import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { saveSherwebCredential, removeSherwebCredential } from "@/lib/services/integrations";
import { testSherwebConnection } from "@/lib/integrations/sherweb";

export async function POST(request: NextRequest) {
  const { clientId, clientSecret, subscriptionKey } = (await request.json()) as {
    clientId?: string;
    clientSecret?: string;
    subscriptionKey?: string;
  };

  if (!clientId?.trim()) {
    return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
  }

  try {
    await saveSherwebCredential({
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || undefined,
      subscriptionKey: subscriptionKey?.trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Test the connection immediately so a bad secret is caught here, not on
  // the next sync. The save itself is kept either way.
  const saved = await prisma.sherwebCredential.findUnique({ where: { id: "sherweb" } });
  try {
    if (saved) {
      await testSherwebConnection(saved.clientId, decryptToken(saved.encryptedClientSecret));
    }
    return NextResponse.json({ ok: true, tested: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: true, tested: false, testError: message });
  }
}

export async function DELETE() {
  await removeSherwebCredential();
  return NextResponse.json({ ok: true });
}
