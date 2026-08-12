import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback, getRedirectUri } from "@/lib/auth/msal";

const STATE_COOKIE = "ms_oauth_state";

// Not request.url: behind Docker's port mapping, Next.js's dev server
// resolves request.url to the container-internal port rather than the
// port the browser actually connects to. MICROSOFT_REDIRECT_URI is
// guaranteed correct instead, since it has to match what's registered
// in Azure.
function appOrigin(): string {
  return new URL(getRedirectUri()).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorDescription = url.searchParams.get("error_description");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const origin = appOrigin();

  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/inbox?connectError=${encodeURIComponent(errorDescription)}`, origin),
    );
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/inbox?connectError=Invalid+or+expired+sign-in+request", origin),
    );
  }

  try {
    await handleAuthCallback(code);
  } catch (err) {
    console.error("Microsoft OAuth callback failed:", err);
    const message = err instanceof Error ? err.message : "Microsoft sign-in failed.";
    return NextResponse.redirect(
      new URL(`/inbox?connectError=${encodeURIComponent(message)}`, origin),
    );
  }

  const response = NextResponse.redirect(new URL("/inbox?connected=1", origin));
  response.cookies.delete(STATE_COOKIE);
  return response;
}
