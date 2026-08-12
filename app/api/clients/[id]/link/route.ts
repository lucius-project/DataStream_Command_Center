import { NextRequest, NextResponse } from "next/server";
import { linkClientAccounts } from "@/lib/services/companyProfile";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ninjaOrganizationId, quickbooksCustomerId } = (await request.json()) as {
    ninjaOrganizationId?: string;
    quickbooksCustomerId?: string;
  };

  try {
    await linkClientAccounts(id, {
      ninjaOrganizationId: ninjaOrganizationId || undefined,
      quickbooksCustomerId: quickbooksCustomerId || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save account links.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
