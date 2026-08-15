import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roleRank";
import { isConnected, getGraphAccessToken } from "@/lib/auth/msal";
import { findWhatsForgotten } from "@/lib/services/inboxForgetting";

export async function POST() {
  await requireRole("SERVICE_MANAGER");

  if (!(await isConnected())) {
    return NextResponse.json({ error: "Microsoft 365 isn't connected." }, { status: 400 });
  }

  try {
    const accessToken = await getGraphAccessToken();
    const result = await findWhatsForgotten(accessToken);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scan recent mail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
