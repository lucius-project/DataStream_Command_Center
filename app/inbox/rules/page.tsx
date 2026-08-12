import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RulesManager } from "@/components/inbox/RulesManager";

export default async function InboxRulesPage() {
  const rules = await prisma.inboxRule.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link
        href="/inbox"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft size={16} />
        Back to Inbox Command
      </Link>
      <h1 className="mt-3 font-display text-2xl font-semibold text-text">Noise rules</h1>
      <p className="mt-1 text-sm text-text-muted">
        Keep obvious noise — newsletters, notifications — out of triage automatically.
      </p>
      <div className="mt-6">
        <RulesManager initialRules={rules} />
      </div>
    </div>
  );
}
