import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roleRank";
import { createSop } from "@/lib/services/sops";
import { saveUploadedFile, SopFileValidationError } from "@/lib/services/sopFiles";
import type { AppRole } from "@/app/generated/prisma/client";

// requireRole here too, not just on the authoring pages — an API route
// is its own entry point; middleware/proxy.ts only checks "logged in at
// all," so without this a technician could POST here directly.
//
// FormData, not JSON — files travel alongside the text fields in one
// request (multipart/form-data), same as any standard file-upload form;
// Web's Request.formData() handles this natively in a Route Handler,
// no extra parsing library needed.
export async function POST(request: NextRequest) {
  await requireRole("SERVICE_MANAGER");

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
    const entry = await createSop({ title, body, taskArea, roles });
    for (const file of files) {
      await saveUploadedFile(entry.id, file);
    }
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (err) {
    if (err instanceof SopFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to create SOP.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
