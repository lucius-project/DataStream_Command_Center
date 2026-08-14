import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roleRank";
import { updateStaffUsers } from "@/lib/services/staffUsers";
import type { AppRole } from "@/app/generated/prisma/client";

// requireRole here too, not just on app/admin/users/page.tsx — an API
// route is its own entry point; middleware only checks "logged in at
// all," so without this check a signed-in technician could POST here
// directly and self-promote to CEO.
export async function POST(request: NextRequest) {
  await requireRole("CEO");

  const body = (await request.json().catch(() => null)) as
    | { entries?: { id?: string; role?: AppRole | null; techPerson?: string | null }[] }
    | null;
  const entries = body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No user entries provided." }, { status: 400 });
  }
  for (const e of entries) {
    if (!e.id) {
      return NextResponse.json({ error: "Each entry needs an id." }, { status: 400 });
    }
    if (e.role === "TECHNICIAN" && !e.techPerson) {
      return NextResponse.json({ error: "A technician role needs a tech assigned." }, { status: 400 });
    }
  }

  try {
    await updateStaffUsers(entries as { id: string; role: AppRole | null; techPerson: string | null }[]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save users.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
