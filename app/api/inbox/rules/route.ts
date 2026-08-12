import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { InboxRuleAction, InboxRuleMatchType } from "@/app/generated/prisma/client";

export async function GET() {
  const rules = await prisma.inboxRule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  const { name, matchType, matchValue, action } = (await request.json()) as {
    name?: string;
    matchType?: InboxRuleMatchType;
    matchValue?: string;
    action?: InboxRuleAction;
  };

  if (!name?.trim() || !matchType || !matchValue?.trim() || !action) {
    return NextResponse.json({ error: "name, matchType, matchValue, and action are required." }, { status: 400 });
  }

  const rule = await prisma.inboxRule.create({
    data: { name: name.trim(), matchType, matchValue: matchValue.trim(), action },
  });
  return NextResponse.json(rule, { status: 201 });
}
