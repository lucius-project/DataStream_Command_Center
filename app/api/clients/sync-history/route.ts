import { NextResponse } from "next/server";
import { backfillClientMonthlyHours } from "@/lib/integrations/haloClients";

export async function POST() {
  const result = await backfillClientMonthlyHours();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, months: result.months });
}
