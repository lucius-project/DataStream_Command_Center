// Staff sign-in session — separate from lib/auth/msal.ts, which is a
// single shared mailbox connection for Inbox Command (one OAuthToken
// row, always accounts[0]), not a multi-user login system. This reuses
// the same Entra app registration (MicrosoftAppCredential) purely for
// identity — no Graph scopes, no mail access — and issues its own
// signed session cookie for this app.
//
// jose (not jsonwebtoken) because it works in both the Node route
// handlers below AND middleware.ts's Edge-compatible runtime without a
// native crypto dependency.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/app/generated/prisma/client";

export const SESSION_COOKIE = "staff_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — re-login via Microsoft after, not a silent refresh

function getSecret(): Uint8Array {
  const value = process.env.STAFF_SESSION_SECRET;
  if (!value) {
    throw new Error("STAFF_SESSION_SECRET is not set. Generate one with: openssl rand -hex 32");
  }
  return new TextEncoder().encode(value);
}

export async function createSessionCookie(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Signature/expiry check only — used by middleware.ts for the cheap
// "is anyone logged in at all" gate, with no DB round trip on every
// request. getSession() below is the one that turns this into a real
// identity/role.
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type Session = {
  id: string;
  email: string;
  name: string;
  role: AppRole | null;
  techPerson: string | null;
  avatarPath: string | null;
};

// Re-reads the StaffUser row from the DB on every call — role/techPerson
// are never trusted from the token itself, so revoking access (deleting
// or changing a StaffUser row) takes effect on the very next request,
// not after the token's own 12h expiry.
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const user = await prisma.staffUser.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    techPerson: user.techPerson,
    avatarPath: user.avatarPath,
  };
}
