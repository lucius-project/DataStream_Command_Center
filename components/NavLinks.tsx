"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { isAtLeast, type RankedRole } from "@/lib/auth/roleRankShared";
import type { AppRole } from "@/app/generated/prisma/client";

// UX only, not the real security boundary — each page's own
// requireRole()/requireSignedIn() call (lib/auth/roleRank.ts) is what
// actually blocks access; this just avoids showing a technician a link
// that would only redirect them away.
export function NavLinks({ role, onNavigate }: { role: AppRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => {
    // roles (explicit allow-list) wins if set — for items like /crm
    // that don't fit the linear rank at all (SDR isn't "above" or
    // "below" a technician).
    if (item.roles) return item.roles.includes(role);
    return !item.minRole || isAtLeast(role as RankedRole | "SDR", item.minRole);
  });

  // Minimized by default — every group starts collapsed behind its own
  // header, sub-items appearing only once you click it, except whichever
  // group contains the page you're currently on (so the sidebar never
  // opens with no visible indication of where you are, and today's page
  // is always still one look away, not one click away). Computed once at
  // mount from the initial pathname, not kept in sync on every
  // client-side navigation after that — this is a starting default, not
  // a "always auto-expand my current section" rule that would fight a
  // group the user deliberately collapsed.
  const activeGroup = visibleItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  )?.group;
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((g) => g !== activeGroup)),
  );

  function toggleGroup(group: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const groupItems = visibleItems.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        const expanded = !collapsed.has(group);
        return (
          <div key={group} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              aria-expanded={expanded}
              className="flex items-center justify-between gap-1 px-3 py-1 font-display text-[11px] font-medium tracking-[0.14em] text-text-faint uppercase hover:text-text-muted"
            >
              {group}
              <ChevronDown
                size={12}
                className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
              />
            </button>
            {expanded &&
              groupItems.map((item) => {
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
