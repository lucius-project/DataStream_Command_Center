import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleStaffAuthCallback, getStaffRedirectUri } from "@/lib/auth/staffMsal";
import { createSessionCookie } from "@/lib/auth/staffSession";

const STATE_COOKIE = "staff_oauth_state";

// Not request.url — same reasoning as the Inbox Command Microsoft
// callback: behind Docker's port mapping, request.url resolves to the
// container-internal port, not the port the browser actually connects
// to. STAFF_REDIRECT_URI is guaranteed correct since it has to match
// what's registered in Entra.
function appOrigin(): string {
  return new URL(getStaffRedirectUri()).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorDescription = url.searchParams.get("error_description");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const origin = appOrigin();

  if (errorDescription) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription)}`, origin));
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=Invalid+or+expired+sign-in+request", origin));
  }

  let account;
  try {
    account = await handleStaffAuthCallback(code);
  } catch (err) {
    console.error("Staff OAuth callback failed:", err);
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
  }

  const email = account.username;
  const name = account.name || email;

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  let user;
  if (existing) {
    user = await prisma.staffUser.update({
      where: { id: existing.id },
      data: { name, lastLoginAt: new Date() },
    });
  } else {
    // The very first person to ever sign in becomes CEO automatically —
    // someone has to be able to get in and assign everyone else a role.
    // Every subsequent unrecognized email gets role: null and lands on
    // /pending until a CEO assigns one from /admin/users.
    const isFirstEver = (await prisma.staffUser.count()) === 0;
    user = await prisma.staffUser.create({
      data: { email, name, role: isFirstEver ? "CEO" : null, lastLoginAt: new Date() },
    });
  }

  await createSessionCookie(user.id);

  const response = NextResponse.redirect(new URL(user.role ? "/" : "/pending", origin));
  response.cookies.delete(STATE_COOKIE);
  return response;
}
