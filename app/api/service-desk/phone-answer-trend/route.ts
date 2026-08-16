import { NextResponse } from "next/server";
import { getPhoneAnswerTrend } from "@/lib/services/serviceDeskHealth";

// DB-only read (ServiceDeskHealthDaily only), fetched on demand when the
// Phone Answer trend modal opens — same pattern as the other Morning
// Brief trend routes.
export async function GET() {
  const trend = await getPhoneAnswerTrend();
  return NextResponse.json(trend);
}
