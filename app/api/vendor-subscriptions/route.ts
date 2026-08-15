import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roleRank";
import { createVendorSubscription } from "@/lib/services/vendorSubscriptions";

// requireRole here too, not just on the /vendors pages — an API route
// is its own entry point; proxy.ts only checks "logged in at all," so
// without this a non-CEO could POST here directly.
export async function POST(request: NextRequest) {
  await requireRole("CEO");

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
    await createVendorSubscription({ vendorName, productName, renewalDate, notes: body?.notes?.trim() || null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create subscription.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
