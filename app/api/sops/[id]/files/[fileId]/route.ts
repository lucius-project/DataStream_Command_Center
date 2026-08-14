import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSignedIn } from "@/lib/auth/roleRank";
import { prisma } from "@/lib/prisma";
import { getSop, canViewSop } from "@/lib/services/sops";
import { resolveSopFilePath, deleteSopFile } from "@/lib/services/sopFiles";
import type { AppRole } from "@/app/generated/prisma/client";

// The real access boundary for SOP files — /sops' own filtering is UX
// only. Anyone signed in could otherwise guess a file's URL directly,
// so this re-checks the viewer's role against the entry's tagged roles
// itself, same rule getSopsForRole already filters the list by.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await requireSignedIn();
  const { id, fileId } = await params;

  const entry = await getSop(id);
  if (!entry || !canViewSop(entry, session.role as AppRole)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const file = entry.files.find((f) => f.id === fileId);
  if (!file) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolveSopFilePath(file.storagePath));
  } catch {
    return NextResponse.json({ error: "File is missing on disk." }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(file.sizeBytes),
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  await requireRole("SERVICE_MANAGER");
  const { id, fileId } = await params;

  const file = await prisma.sopFile.findUnique({ where: { id: fileId } });
  if (!file || file.sopEntryId !== id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await deleteSopFile(fileId);
  return NextResponse.json({ ok: true });
}
