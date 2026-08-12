import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { saveUnitedCloudCredential, removeUnitedCloudCredential } from "@/lib/services/integrations";
import { testUnitedCloudConnection } from "@/lib/integrations/unitedCloud";

export async function POST(request: NextRequest) {
  const { apiBaseUrl, domain, apiKey } = (await request.json()) as {
    apiBaseUrl?: string;
    domain?: string;
    apiKey?: string;
  };

  if (!apiBaseUrl?.trim() || !domain?.trim()) {
    return NextResponse.json({ error: "API base URL and domain are required." }, { status: 400 });
  }

  try {
    await saveUnitedCloudCredential({
      apiBaseUrl: apiBaseUrl.trim(),
      domain: domain.trim(),
      apiKey: apiKey?.trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Test the connection immediately so a bad key is caught here, not on
  // the next Call Activity page load. The save itself is kept either way.
  const saved = await prisma.unitedCloudCredential.findUnique({ where: { id: "unitedcloud" } });
  try {
    if (saved) {
      await testUnitedCloudConnection(saved.apiBaseUrl, decryptToken(saved.encryptedApiKey));
    }
    return NextResponse.json({ ok: true, tested: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: true, tested: false, testError: message });
  }
}

export async function DELETE() {
  await removeUnitedCloudCredential();
  return NextResponse.json({ ok: true });
}
