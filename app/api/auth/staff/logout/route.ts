import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/staffSession";

// Same "POST clears state, client navigates itself" pattern as every
// disconnect button in components/integrations/ — a raw redirect
// Response doesn't fit a fetch()-triggered POST the way it does a
// full-page <a href> navigation like the OAuth callback routes.
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
