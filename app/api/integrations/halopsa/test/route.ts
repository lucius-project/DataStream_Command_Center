import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getHaloAccessToken } from "@/lib/integrations/halopsa";

export async function POST() {
  const row = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not configured." });
  }
  try {
    await getHaloAccessToken(row.instanceUrl, row.clientId, decryptToken(row.encryptedClientSecret));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
