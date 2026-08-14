import { NextResponse } from "next/server";
import { fetchCustomers } from "@/lib/integrations/quickbooks";

export async function POST() {
  try {
    await fetchCustomers();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ ok: false, error: message });
  }
}
