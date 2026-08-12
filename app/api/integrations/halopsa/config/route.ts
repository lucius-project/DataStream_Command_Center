import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { saveHaloPsaCredential, removeHaloPsaCredential } from "@/lib/services/integrations";
import { getHaloAccessToken } from "@/lib/integrations/halopsa";

export async function POST(request: NextRequest) {
  const { instanceUrl, clientId, clientSecret } = (await request.json()) as {
    instanceUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };

  if (!instanceUrl?.trim() || !clientId?.trim()) {
    return NextResponse.json({ error: "Instance URL and Client ID are required." }, { status: 400 });
  }

  try {
    await saveHaloPsaCredential({
      instanceUrl: instanceUrl.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Test the connection immediately so a bad secret is caught here, not on
  // the next Operations page load. The save itself is kept either way.
  const saved = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  try {
    if (saved) {
      await getHaloAccessToken(saved.instanceUrl, saved.clientId, decryptToken(saved.encryptedClientSecret));
    }
    return NextResponse.json({ ok: true, tested: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: true, tested: false, testError: message });
  }
}

export async function DELETE() {
  await removeHaloPsaCredential();
  return NextResponse.json({ ok: true });
}
