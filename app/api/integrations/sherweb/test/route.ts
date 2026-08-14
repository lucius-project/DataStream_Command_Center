import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { testSherwebConnection } from "@/lib/integrations/sherweb";

export async function POST() {
  const row = await prisma.sherwebCredential.findUnique({ where: { id: "sherweb" } });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not configured." });
  }
  try {
    await testSherwebConnection(row.clientId, decryptToken(row.encryptedClientSecret));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
