"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { isAtLeast, type RankedRole } from "@/lib/auth/roleRankShared";
import type { AppRole } from "@/app/generated/prisma/client";

// UX only, not the real security boundary — each page's own
// requireRole()/requireSignedIn() call (lib/auth/roleRank.ts) is what
// actually blocks access; this just avoids showing a technician a link
// that would only redirect them away.
export function NavLinks({ role, onNavigate }: { role: AppRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => !item.minRole || isAtLeast(role as RankedRole | "SDR", item.minRole));

  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const groupItems = visibleItems.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <div className="px-3 font-display text-[11px] font-medium tracking-[0.14em] text-text-faint uppercase">
              {group}
            </div>
            {groupItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`group flex min-h-11 items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-accent bg-panel-raised text-text"
                      : "border-transparent text-text-muted hover:bg-panel-raised hover:text-text"
                  }`}
                >
                  <Icon
                    size={17}
                    strokeWidth={2}
                    className={active ? "text-accent" : "text-text-faint group-hover:text-text-muted"}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.status === "soon" && (
                    <span className="rounded border border-border-strong px-1.5 py-0.5 font-data text-[10px] tracking-wide text-text-faint">
                      SOON
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
