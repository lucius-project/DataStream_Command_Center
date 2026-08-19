import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth/roleRank";
import { updateCrmAccountStage, updateCrmAccountNotes } from "@/lib/services/crm";
import { CrmStage } from "@/app/generated/prisma/client";

const VALID_STAGES = new Set<string>(Object.values(CrmStage));

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAnyRole(["SDR", "CEO"]);
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { stage?: string; notes?: string } | null;
  if (!body || (body.stage === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: "Nothing to update — provide stage or notes." }, { status: 400 });
  }

  if (body.stage !== undefined) {
    if (!VALID_STAGES.has(body.stage)) {
      return NextResponse.json({ error: `"${body.stage}" isn't a valid stage.` }, { status: 400 });
    }
    await updateCrmAccountStage(id, body.stage as CrmStage);
  }
  if (body.notes !== undefined) {
    await updateCrmAccountNotes(id, body.notes);
  }

  return NextResponse.json({ ok: true });
}
