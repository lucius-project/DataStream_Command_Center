import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth/roleRank";
import { createCrmAccount } from "@/lib/services/crm";

export async function POST(request: NextRequest) {
  await requireAnyRole(["SDR", "CEO"]);

  const body = (await request.json().catch(() => null)) as
    | { name?: string; website?: string; phone?: string; email?: string; notes?: string }
    | null;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "A company name is required." }, { status: 400 });
  }

  const account = await createCrmAccount({
    name,
    website: body?.website?.trim() || null,
    phone: body?.phone?.trim() || null,
    email: body?.email?.trim() || null,
    notes: body?.notes?.trim() || null,
  });
  return NextResponse.json(account);
}
