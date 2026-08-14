import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roleRank";
import { updateSop, deleteSop } from "@/lib/services/sops";
import { saveUploadedFile, SopFileValidationError } from "@/lib/services/sopFiles";
import type { AppRole } from "@/app/generated/prisma/client";

// FormData, not JSON — new files (if any) are appended to this entry's
// existing file list; removing an existing file is a separate action
// (DELETE /api/sops/[id]/files/[fileId]), not part of this save.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("SERVICE_MANAGER");
  const { id } = await params;

  const formData = await request.formData();
  const title = (formData.get("title") as string | null)?.trim();
  const body = (formData.get("body") as string | null)?.trim();
  const taskArea = (formData.get("taskArea") as string | null)?.trim() || null;
  const roles = formData.getAll("roles") as AppRole[];
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!title || !body) {
    return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
  }
  if (roles.length === 0) {
    return NextResponse.json({ error: "At least one role must be selected." }, { status: 400 });
  }

  try {
    await updateSop(id, { title, body, taskArea, roles });
    for (const file of files) {
      await saveUploadedFile(id, file);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SopFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to save SOP.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("SERVICE_MANAGER");
  const { id } = await params;
  await deleteSop(id);
  return NextResponse.json({ ok: true });
}
