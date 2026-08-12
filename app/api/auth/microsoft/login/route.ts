import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAuthCodeUrl } from "@/lib/auth/msal";

const STATE_COOKIE = "ms_oauth_state";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const authUrl = await getAuthCodeUrl(state);

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
