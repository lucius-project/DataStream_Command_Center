import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/auth/keapOAuth";

const STATE_COOKIE = "keap_oauth_state";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const authUrl = await getAuthorizeUrl(state);

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
