import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/staffSession";

// Cheap gate only — "is there a validly-signed session cookie at all."
// No DB lookup here (would add a round trip to every single request);
// the real per-page role check (requireRole/requireSignedIn) lives in
// each page's own server component, same place every page already does
// its data fetching — see lib/auth/roleRank.ts.
const PUBLIC_PATHS = ["/login", "/pending", "/not-authorized", "/api/auth/staff/login", "/api/auth/staff/callback"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;
  if (!userId) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// staffSession.ts imports prisma at module scope (even though
// verifySessionToken itself never queries the DB) — Node is Proxy's
// default runtime as of Next 16, no explicit runtime config needed (and
// setting one here throws).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
