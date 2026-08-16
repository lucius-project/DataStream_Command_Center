import { NextResponse } from "next/server";
import { getTicketTrend } from "@/lib/services/serviceDeskHealth";

// DB-only read (ServiceDeskHealthDaily is only ever written from an
// already-computed snapshot), fetched on demand when the Ticket Trend
// modal opens rather than on every /tech-performance page load — same
// pattern as /api/service-desk/health-trend.
export async function GET() {
  const trend = await getTicketTrend();
  return NextResponse.json(trend);
}
