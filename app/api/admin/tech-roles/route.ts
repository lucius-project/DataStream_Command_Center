import { NextRequest, NextResponse } from "next/server";
import { upsertTechRoleConfigs } from "@/lib/services/kpiSettings";
import type { TechRole } from "@/app/generated/prisma/client";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { entries?: { person?: string; role?: TechRole; expectedWeeklyHours?: number }[] }
    | null;
  const entries = body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No role entries provided." }, { status: 400 });
  }
  for (const e of entries) {
    if (!e.person || !e.role || typeof e.expectedWeeklyHours !== "number" || e.expectedWeeklyHours <= 0) {
      return NextResponse.json({ error: "Each entry needs a person, role, and positive expectedWeeklyHours." }, { status: 400 });
    }
  }

  try {
    await upsertTechRoleConfigs(entries as { person: string; role: TechRole; expectedWeeklyHours: number }[]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save technician roles.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
