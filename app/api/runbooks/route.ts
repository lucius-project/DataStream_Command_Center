import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RunbookFrequency } from "@/app/generated/prisma/client";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    categoryId?: string;
    title?: string;
    description?: string;
    frequency?: RunbookFrequency;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { categoryId, title, description, frequency } = body;
  if (!categoryId || !title?.trim() || !frequency) {
    return NextResponse.json({ error: "categoryId, title, and frequency are required." }, { status: 400 });
  }

  try {
    const item = await prisma.runbookItem.create({
      data: { categoryId, title: title.trim(), description: description?.trim() || null, frequency },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create runbook item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
