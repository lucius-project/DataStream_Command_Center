import Link from "next/link";
import { Inbox } from "lucide-react";
import { isAtLeast, type RankedRole } from "@/lib/auth/roleRankShared";
import type { AppRole } from "@/app/generated/prisma/client";

// Quick-access shortcut to Inbox Command placed next to the account
// widget — same SERVICE_MANAGER+ gate as its regular entry under the
// Operations nav group (lib/nav.ts); this is an extra way in, not a
// separate access rule, so it must stay in sync with that gate.
export function InboxShortcut({ role }: { role: AppRole | null }) {
  if (!role || !isAtLeast(role as RankedRole | "SDR", "SERVICE_MANAGER")) return null;

  return (
    <Link
      href="/inbox"
      aria-label="Inbox Command"
      className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
    >
      <Inbox size={17} />
    </Link>
  );
}
