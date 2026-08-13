import { NextResponse } from "next/server";
import { getServiceDeskHealthTrend } from "@/lib/services/serviceDeskHealth";

// DB-only read (no external API call — ServiceDeskHealthDaily is only
// ever written from an already-computed snapshot, see
// syncServiceDeskHealthDaily), fetched on demand when the Health Score
// trend modal opens rather than on every /tech-performance page load.
export async function GET() {
  const trend = await getServiceDeskHealthTrend();
  return NextResponse.json(trend);
}
