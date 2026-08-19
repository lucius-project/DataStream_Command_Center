import { NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth/roleRank";
import { importKeapCompanies } from "@/lib/integrations/keap";

export async function POST() {
  await requireAnyRole(["SDR", "CEO"]);

  try {
    const result = await importKeapCompanies();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Keap import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
