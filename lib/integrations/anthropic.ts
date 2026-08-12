// Anthropic adapter — powers the Business Health chat. Auth is a plain
// bearer API key (same shape as United Cloud), stored encrypted in
// AnthropicCredential and decrypted per request; never an env var.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";

export async function getAnthropicClient(): Promise<{ client: Anthropic; model: string } | null> {
  const row = await prisma.anthropicCredential.findUnique({ where: { id: "anthropic" } });
  if (!row) return null;
  const apiKey = decryptToken(row.encryptedApiKey);
  return { client: new Anthropic({ apiKey }), model: row.model };
}

// Cheap read-only call used to validate a key before it's saved, same role
// testUnitedCloudConnection plays for United Cloud. The Models API consumes
// no tokens, so this is free to call on every save.
export async function testAnthropicConnection(apiKey: string): Promise<void> {
  const client = new Anthropic({ apiKey });
  await client.models.retrieve("claude-sonnet-5");
}
