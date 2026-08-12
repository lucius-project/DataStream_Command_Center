import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.quickBooksOAuthToken.deleteMany({ where: { id: "quickbooks" } });
  return NextResponse.json({ ok: true });
}
