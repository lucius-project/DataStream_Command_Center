import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.ninjaRmmOAuthToken.deleteMany({ where: { id: "ninjarmm" } });
  return NextResponse.json({ ok: true });
}
