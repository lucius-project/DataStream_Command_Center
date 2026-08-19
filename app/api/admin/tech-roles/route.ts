import { NextRequest, NextResponse } from "next/server";
import { upsertTechRoleConfigs } from "@/lib/services/kpiSettings";
import { TechRole } from "@/app/generated/prisma/client";

const VALID_ROLES = new Set<string>(Object.values(TechRole));

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { entries?: { person?: string; role?: TechRole; expectedWeeklyHours?: number; expectedChargeableHours?: number }[] }
    | null;
  const entries = body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No role entries provided." }, { status: 400 });
  }
  for (const e of entries) {
    if (
      !e.person ||
      !e.role ||
      typeof e.expectedWeeklyHours !== "number" ||
      e.expectedWeeklyHours <= 0 ||
      typeof e.expectedChargeableHours !== "number" ||
      e.expectedChargeableHours < 0
    ) {
      return NextResponse.json(
        { error: "Each entry needs a person, role, positive expectedWeeklyHours, and non-negative expectedChargeableHours." },
        { status: 400 },
      );
    }
    if (!VALID_ROLES.has(e.role)) {
      return NextResponse.json({ error: `"${e.role}" isn't a valid technician role.` }, { status: 400 });
    }
    if (e.expectedChargeableHours > e.expectedWeeklyHours) {
      return NextResponse.json(
        { error: `${e.person}'s expected client hours can't exceed their expected weekly hours.` },
        { status: 400 },
      );
    }
  }

  try {
    await upsertTechRoleConfigs(
      entries as { person: string; role: TechRole; expectedWeeklyHours: number; expectedChargeableHours: number }[],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save technician roles.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
