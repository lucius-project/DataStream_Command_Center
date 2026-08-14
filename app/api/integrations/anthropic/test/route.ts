import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { testAnthropicConnection } from "@/lib/integrations/anthropic";

export async function POST() {
  const row = await prisma.anthropicCredential.findUnique({ where: { id: "anthropic" } });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not configured." });
  }
  try {
    await testAnthropicConnection(decryptToken(row.encryptedApiKey));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
