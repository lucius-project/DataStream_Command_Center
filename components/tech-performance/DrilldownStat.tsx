"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/shared/Modal";

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
        {/* text-muted, not text-faint — same "this label is what makes
            the number meaningful" reasoning as Stat's own label. */}
        <span className={toneClass}>{value}</span> <span className="text-text-muted">{label}</span>
      </button>

      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
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
        </Modal>
      )}
    </>
  );
}
