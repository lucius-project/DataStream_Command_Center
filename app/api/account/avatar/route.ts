import { NextRequest, NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { saveAvatar, deleteAvatar, AvatarValidationError } from "@/lib/services/avatars";

// Every signed-in user manages their own avatar only — session.id is
// the target, never a userId taken from the request, so nobody can
// overwrite or clear someone else's picture.
export async function POST(request: NextRequest) {
  const session = await requireSignedIn();
  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  try {
    const storagePath = await saveAvatar(session.id, file);
    return NextResponse.json({ avatarPath: storagePath });
  } catch (err) {
    if (err instanceof AvatarValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE() {
  const session = await requireSignedIn();
  await deleteAvatar(session.id);
  return NextResponse.json({ ok: true });
}
