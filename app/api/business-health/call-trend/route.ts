import { NextResponse } from "next/server";
import { getCallAnswerRateTrend } from "@/lib/services/callActivity";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";

// DB-only read (no external API call — see getCallAnswerRateTrend's
// comment), fetched on demand when the Call Answer Rate KPI's trend
// modal opens rather than on every Business Health page load, since most
// visits won't open it. Directory failure degrades to null rather than
// failing the request — see excludeFalseMisses in callActivity.ts.
export async function GET() {
  const directory = await getContactDirectory().catch(() => null);
  const trend = await getCallAnswerRateTrend(directory);
  return NextResponse.json(trend);
}
