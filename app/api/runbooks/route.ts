import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RunbookFrequency } from "@/app/generated/prisma/client";

export async function POST(request: NextRequest) {
  const { categoryId, title, description, frequency } = (await request.json()) as {
    categoryId?: string;
    title?: string;
    description?: string;
    frequency?: RunbookFrequency;
  };

  if (!categoryId || !title?.trim() || !frequency) {
    return NextResponse.json({ error: "categoryId, title, and frequency are required." }, { status: 400 });
  }

  const item = await prisma.runbookItem.create({
    data: { categoryId, title: title.trim(), description: description?.trim() || null, frequency },
  });
  return NextResponse.json(item, { status: 201 });
}
