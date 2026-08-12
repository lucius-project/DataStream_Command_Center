"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

// "Never create numbers the manager cannot investigate" — every stat
// that's backed by a real, enumerable list of tickets/calls uses this
// instead of the plain Stat span, so a click always shows the exact
// records behind the number.
export type DrilldownRow = {
  id: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  href?: string;
};

export function DrilldownStat({
  value,
  label,
  tone,
  title,
  rows,
  emptyMessage,
}: {
  value: number | string;
  label: string;
  tone?: "warn" | "critical";
  title: string;
  rows: DrilldownRow[];
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === "critical" ? "text-status-critical" : tone === "warn" ? "text-status-warn" : "text-text";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hover:underline">
        <span className={toneClass}>{value}</span> <span className="text-text-faint">{label}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-panel p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div className="font-display text-sm font-semibold text-text">{title}</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto font-data text-xs">
              {rows.length === 0 ? (
                <div className="text-text-muted">{emptyMessage}</div>
              ) : (
                rows.map((r) => {
                  const body = (
                    <div className="rounded-md border border-border bg-panel-raised p-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text">{r.primary}</span>
                        {r.secondary && <span className="text-text-faint">{r.secondary}</span>}
                      </div>
                      {r.tertiary && <div className="mt-0.5 text-[11px] text-text-faint">{r.tertiary}</div>}
                    </div>
                  );
                  return r.href ? (
                    <Link key={r.id} href={r.href} className="block hover:opacity-80">
                      {body}
                    </Link>
                  ) : (
                    <div key={r.id}>{body}</div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
