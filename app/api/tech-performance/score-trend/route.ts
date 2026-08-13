import { NextResponse } from "next/server";
import { getTechScoreTrend } from "@/lib/services/techPerformanceScore";

// DB-only read (no external API call — TechScoreDaily is only ever
// written from an already-computed score, see syncTechScoreDaily),
// fetched on demand when a tech's score trend modal opens.
export async function GET(request: Request) {
  const person = new URL(request.url).searchParams.get("person");
  if (!person) {
    return NextResponse.json({ error: "Missing person query param." }, { status: 400 });
  }
  const trend = await getTechScoreTrend(person);
  return NextResponse.json(trend);
}
