import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roleRank";
import { updateVendorSubscription, deleteVendorSubscription } from "@/lib/services/vendorSubscriptions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("CEO");
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as
    | { vendorName?: string; productName?: string; renewalDate?: string; notes?: string }
    | null;
  const vendorName = body?.vendorName?.trim();
  const productName = body?.productName?.trim();
  const renewalDate = body?.renewalDate ? new Date(body.renewalDate) : null;

  if (!vendorName || !productName) {
    return NextResponse.json({ error: "Vendor and product are required." }, { status: 400 });
  }
  if (!renewalDate || Number.isNaN(renewalDate.getTime())) {
    return NextResponse.json({ error: "A valid renewal date is required." }, { status: 400 });
  }

  try {
    await updateVendorSubscription(id, { vendorName, productName, renewalDate, notes: body?.notes?.trim() || null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save subscription.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("CEO");
  const { id } = await params;
  await deleteVendorSubscription(id);
  return NextResponse.json({ ok: true });
}
