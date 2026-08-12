import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.oAuthToken.deleteMany({ where: { provider: "microsoft" } });
  return NextResponse.json({ ok: true });
}
