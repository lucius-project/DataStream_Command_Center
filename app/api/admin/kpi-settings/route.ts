import { NextRequest, NextResponse } from "next/server";
import { updateKpiSettings, type KpiSettingsUpdate } from "@/lib/services/kpiSettings";

// Partial update — only the fields the calling form actually edited are
// sent, so e.g. saving Thresholds doesn't have to also resend every
// weight field. updateKpiSettings itself rejects a weight group that
// doesn't sum to 100 (400 here), the one place this route needs
// validation beyond "is it valid JSON."
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as KpiSettingsUpdate | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const settings = await updateKpiSettings(body);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
