import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { prisma } from "@/lib/prisma";
import { resolveAvatarPath, mimeTypeForPath } from "@/lib/services/avatars";

// Any signed-in user can view any other staff member's avatar — same
// "just needs to be logged in" boundary as most of this app's read
// paths (e.g. /admin/users' own list); a profile picture isn't
// sensitive the way SOP files or vendor data are.
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  await requireSignedIn();
  const { userId } = await params;

  const user = await prisma.staffUser.findUnique({ where: { id: userId }, select: { avatarPath: true } });
  if (!user?.avatarPath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolveAvatarPath(user.avatarPath));
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(user.avatarPath),
      // Filename includes a random suffix per upload, so the same URL
      // never points at different bytes — safe to cache indefinitely.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
