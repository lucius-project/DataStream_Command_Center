// Page-level authorization — called at the top of every gated page's
// server component, the same spot every page already does its initial
// data fetching. middleware.ts only checks "is anyone logged in at
// all"; this is the real per-page boundary, so it's the one place each
// page's access rule actually lives (co-located with the page it
// protects, not a separate config file to keep in sync).

import { redirect } from "next/navigation";
import { getSession, type Session } from "./staffSession";
import { RANK, type RankedRole } from "./roleRankShared";
import type { AppRole } from "@/app/generated/prisma/client";

export type { RankedRole };

// Any signed-in, role-assigned user — for pages open to everyone
// (Focus Mode, SOPs) with no rank requirement.
export async function requireSignedIn(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.role) redirect("/pending");
  return session;
}

export async function requireRole(minRole: RankedRole): Promise<Session> {
  const session = await requireSignedIn();
  if (session.role === "SDR" || RANK[session.role as RankedRole] < RANK[minRole]) {
    redirect("/not-authorized");
  }
  return session;
}

// For pages that don't fit the linear TECHNICIAN < SERVICE_MANAGER < CEO
// rank — SDR is a parallel track, not "above" or "below" a technician,
// so /crm needs an explicit allow-list (["SDR", "CEO"]) rather than a
// minRole comparison. Kept separate from requireRole rather than trying
// to fold SDR into the rank scale, which would misrepresent it as
// "between" two roles it has no real ordering against.
export async function requireAnyRole(roles: AppRole[]): Promise<Session> {
  const session = await requireSignedIn();
  if (!roles.includes(session.role as AppRole)) {
    redirect("/not-authorized");
  }
  return session;
}
