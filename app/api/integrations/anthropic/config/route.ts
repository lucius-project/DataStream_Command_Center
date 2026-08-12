import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { saveAnthropicCredential, removeAnthropicCredential } from "@/lib/services/integrations";
import { testAnthropicConnection } from "@/lib/integrations/anthropic";

export async function POST(request: NextRequest) {
  const { model, apiKey } = (await request.json()) as { model?: string; apiKey?: string };

  try {
    await saveAnthropicCredential({ model: model?.trim() || undefined, apiKey: apiKey?.trim() || undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Test the connection immediately so a bad key is caught here, not on
  // the first chat message. The save itself is kept either way.
  const saved = await prisma.anthropicCredential.findUnique({ where: { id: "anthropic" } });
  try {
    if (saved) {
      await testAnthropicConnection(decryptToken(saved.encryptedApiKey));
    }
    return NextResponse.json({ ok: true, tested: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: true, tested: false, testError: message });
  }
}

export async function DELETE() {
  await removeAnthropicCredential();
  return NextResponse.json({ ok: true });
}
