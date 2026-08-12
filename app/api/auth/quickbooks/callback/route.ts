import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getRedirectUri } from "@/lib/auth/quickbooksOAuth";

const STATE_COOKIE = "qb_oauth_state";

// Not request.url — same reasoning as the Microsoft/NinjaRMM callbacks:
// behind Docker's port mapping, request.url resolves to the
// container-internal port, not the port the browser actually connects
// to. QUICKBOOKS_REDIRECT_URI is guaranteed correct since it has to
// match what's registered in the Intuit Developer app.
function appOrigin(): string {
  return new URL(getRedirectUri()).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const errorParam = url.searchParams.get("error");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const origin = appOrigin();

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/clients?connectError=${encodeURIComponent(errorParam)}`, origin),
    );
  }
  if (!code || !state || !realmId || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/clients?connectError=Invalid+or+expired+sign-in+request", origin),
    );
  }

  try {
    await exchangeCodeForTokens(code, realmId);
  } catch (err) {
    console.error("QuickBooks OAuth callback failed:", err);
    const message = err instanceof Error ? err.message : "QuickBooks sign-in failed.";
    return NextResponse.redirect(
      new URL(`/clients?connectError=${encodeURIComponent(message)}`, origin),
    );
  }

  const response = NextResponse.redirect(new URL("/clients?connected=1", origin));
  response.cookies.delete(STATE_COOKIE);
  return response;
}
