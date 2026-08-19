import { prisma } from "@/lib/prisma";
import type { CrmStage } from "@/app/generated/prisma/client";

// Stage order/labels live in lib/crmStages.ts (no Prisma import) so
// client components can import them without pulling the Prisma client
// into the browser bundle — re-exported here for server-side callers
// that already import this file.
export { CRM_STAGE_ORDER, CRM_STAGE_LABELS } from "@/lib/crmStages";

export async function getCrmAccounts() {
  return prisma.crmAccount.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function updateCrmAccountStage(id: string, stage: CrmStage) {
  return prisma.crmAccount.update({
    where: { id },
    data: { stage, stageChangedAt: new Date() },
  });
}

export type CreateCrmAccountInput = {
  name: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

// Manually-added accounts (not from the Keap import) always start at
// Suspect, same default as an imported one — there's no "start further
// along" shortcut, so the pipeline honestly reflects that nothing skips
// the funnel just because it was typed in by hand.
export async function createCrmAccount(input: CreateCrmAccountInput) {
  return prisma.crmAccount.create({
    data: {
      name: input.name,
      website: input.website || null,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || null,
    },
  });
}

export async function updateCrmAccountNotes(id: string, notes: string) {
  return prisma.crmAccount.update({ where: { id }, data: { notes: notes || null } });
}
