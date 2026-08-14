// Pure rank data/logic with zero server-only imports — split out from
// roleRank.ts specifically so client components (NavLinks.tsx) can
// filter nav items by role without pulling in next/headers (roleRank.ts
// imports getSession, which uses cookies() and would break the client
// bundle if imported directly).

// SDR is intentionally excluded from the linear rank — it's a future
// CRM/Sales area, not "above" or "below" Technician, and has no page
// gated to it yet.
export type RankedRole = "TECHNICIAN" | "SERVICE_MANAGER" | "CEO";

export const RANK: Record<RankedRole, number> = {
  TECHNICIAN: 0,
  SERVICE_MANAGER: 1,
  CEO: 2,
};

export function isAtLeast(role: RankedRole | "SDR", minRole: RankedRole): boolean {
  if (role === "SDR") return false;
  return RANK[role] >= RANK[minRole];
}
