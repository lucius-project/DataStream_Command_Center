import { NextResponse } from "next/server";
import { getResponseSlaTrend } from "@/lib/services/serviceDeskHealth";

// DB-only read (ServiceDeskHealthDaily + the current KpiSettings row),
// fetched on demand when the Response SLA trend modal opens rather than
// on every /tech-performance page load — same pattern as the Health
// Score and Ticket trend routes.
export async function GET() {
  const trend = await getResponseSlaTrend();
  return NextResponse.json(trend);
}
