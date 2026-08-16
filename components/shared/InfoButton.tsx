"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "./Modal";

// Generic "explain this widget" trigger, reused across every tile/section
// on /tech-performance and /tech-performance/huddle — see plan for why
// this owns its own open state rather than splitting trigger/modal into
// two components (nothing else on the page needs to coordinate with it).
// Same hand-rolled modal convention as HealthScoreTrendModal.tsx (fixed
// overlay + centered panel + X close button), and the same "icon is a
// true sibling of the tile's main click target, not nested inside it" —
// see HealthScoreTile.tsx's own comment — reasoning callers rely on when
// placing this inside a `relative` wrapper around a <Link>.
//
// Deliberately always visible at low opacity rather than opacity-0/
// hover-only — a hover-gated icon would be undiscoverable on a
// touchscreen, and this dashboard is built for a CEO who may be on a
// tablet.
export function InfoButton({
  title,
  what,
  meaning,
  calculation,
  className,
}: {
  title: string;
  what: string;
  meaning: string;
  calculation?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`About ${title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`rounded p-0.5 text-text-faint hover:bg-panel-raised hover:text-text ${className ?? ""}`}
      >
        <Info size={13} />
      </button>

      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-1">
            <div className="font-data text-[10px] font-semibold tracking-wide text-text-faint uppercase">
              What this measures
            </div>
            <div className="text-sm text-text">{what}</div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="font-data text-[10px] font-semibold tracking-wide text-text-faint uppercase">
              What the current value means
            </div>
            <div className="text-sm text-text">{meaning}</div>
          </div>

          {calculation && (
            <div className="flex flex-col gap-1">
              <div className="font-data text-[10px] font-semibold tracking-wide text-text-faint uppercase">
                How it&apos;s calculated
              </div>
              <div className="text-sm text-text-muted">{calculation}</div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
