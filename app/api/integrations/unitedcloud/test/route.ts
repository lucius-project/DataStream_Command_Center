import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { testUnitedCloudConnection } from "@/lib/integrations/unitedCloud";

export async function POST() {
  const row = await prisma.unitedCloudCredential.findUnique({ where: { id: "unitedcloud" } });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not configured." });
  }
  try {
    await testUnitedCloudConnection(row.apiBaseUrl, decryptToken(row.encryptedApiKey));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
