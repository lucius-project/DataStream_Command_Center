// Page-level authorization — called at the top of every gated page's
// server component, the same spot every page already does its initial
// data fetching. middleware.ts only checks "is anyone logged in at
// all"; this is the real per-page boundary, so it's the one place each
// page's access rule actually lives (co-located with the page it
// protects, not a separate config file to keep in sync).

import { redirect } from "next/navigation";
import { getSession, type Session } from "./staffSession";
import { RANK, type RankedRole } from "./roleRankShared";

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
