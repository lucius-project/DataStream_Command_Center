import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getRedirectUri } from "@/lib/auth/ninjaRmmOAuth";

const STATE_COOKIE = "ninja_oauth_state";
const VERIFIER_COOKIE = "ninja_pkce_verifier";

// Not request.url — same reasoning as the Microsoft callback: behind
// Docker's port mapping, request.url resolves to the container-internal
// port, not the port the browser actually connects to.
// NINJARMM_REDIRECT_URI is guaranteed correct since it has to match
// what's registered in NinjaRMM.
function appOrigin(): string {
  return new URL(getRedirectUri()).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorDescription = url.searchParams.get("error_description");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  const origin = appOrigin();

  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/devices?connectError=${encodeURIComponent(errorDescription)}`, origin),
    );
  }
  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return NextResponse.redirect(
      new URL("/devices?connectError=Invalid+or+expired+sign-in+request", origin),
    );
  }

  try {
    await exchangeCodeForTokens(code, codeVerifier);
  } catch (err) {
    console.error("NinjaRMM OAuth callback failed:", err);
    const message = err instanceof Error ? err.message : "NinjaRMM sign-in failed.";
    return NextResponse.redirect(
      new URL(`/devices?connectError=${encodeURIComponent(message)}`, origin),
    );
  }

  const response = NextResponse.redirect(new URL("/devices?connected=1", origin));
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(VERIFIER_COOKIE);
  return response;
}
