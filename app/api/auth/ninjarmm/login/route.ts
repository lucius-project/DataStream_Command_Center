import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAuthorizeUrl, generatePkcePair } from "@/lib/auth/ninjaRmmOAuth";

const STATE_COOKIE = "ninja_oauth_state";
const VERIFIER_COOKIE = "ninja_pkce_verifier";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const authUrl = await getAuthorizeUrl(state, codeChallenge);

  const response = NextResponse.redirect(authUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE, codeVerifier, cookieOptions);
  return response;
}
