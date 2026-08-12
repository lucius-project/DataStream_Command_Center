import { prisma } from "@/lib/prisma";
import type { DelegationSource } from "@/app/generated/prisma/client";

// Shared "Delegate to AI agent" log for Inbox Command, Operations, and
// Runbooks, so Command Flow can consume any source with the same shape.
export async function logDelegation(source: DelegationSource, sourceId: string, note: string) {
  return prisma.delegationLog.create({ data: { source, sourceId, note } });
}
