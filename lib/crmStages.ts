// Pure constants, no Prisma/server imports — safe to import from client
// components (CrmBoard, AccountDetailModal) as well as the server-side
// lib/services/crm.ts. Splitting this out avoids pulling the Prisma
// client (and its Node-only better-sqlite3 dependency) into the browser
// bundle just because a client component needs the stage list/labels.
import type { CrmStage } from "@/app/generated/prisma/client";

// Kanban column order — the "working" funnel left to right, then the
// three closed-out outcomes, matching how the account described its own
// pipeline (not Keap's Opportunity stage ordering, which this doesn't
// use at all — see CrmAccount's schema comment).
export const CRM_STAGE_ORDER: CrmStage[] = [
  "SUSPECT",
  "FARMLIST",
  "RAW_LEAD",
  "QUALIFIED_LEAD",
  "CLIENT",
  "PAUSE_MARKETING",
  "NOT_A_FIT",
  "AVOID",
];

export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  SUSPECT: "Suspect",
  FARMLIST: "Farmlist",
  RAW_LEAD: "Raw Lead",
  QUALIFIED_LEAD: "Qualified Lead",
  CLIENT: "Client",
  PAUSE_MARKETING: "Pause Marketing",
  NOT_A_FIT: "Not A Fit",
  AVOID: "Avoid",
};
