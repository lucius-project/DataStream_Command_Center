import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.keapOAuthToken.deleteMany({ where: { id: "keap" } });
  return NextResponse.json({ ok: true });
}
