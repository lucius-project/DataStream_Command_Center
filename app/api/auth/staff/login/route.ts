import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getStaffAuthCodeUrl } from "@/lib/auth/staffMsal";

// Own state cookie name (not ms_oauth_state) — this is a fully separate
// flow from the Inbox Command Microsoft connection, running alongside
// it, not replacing it.
const STATE_COOKIE = "staff_oauth_state";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const authUrl = await getStaffAuthCodeUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
