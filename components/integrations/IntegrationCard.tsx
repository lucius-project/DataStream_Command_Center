"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";

type Tone = "ok" | "mocked" | "off" | "error";

const BADGE: Record<Tone, string> = {
  ok: "bg-status-ok-dim text-status-ok border-status-ok/40",
  mocked: "bg-status-info-dim text-status-info border-status-info/40",
  off: "bg-panel-raised text-text-faint border-border-strong",
  error: "bg-status-critical-dim text-status-critical border-status-critical/40",
};

// Minimized by default — icon, name, and status are enough for an
// at-a-glance scan of the whole grid. Everything else (description,
// account details, credential form, setup instructions) is behind the
// configure button, same "collapsed until asked" pattern as the
// individual cards' own "Edit credentials" toggles nested inside.
export function IntegrationCard({
  icon: Icon,
  name,
  statusLabel,
  tone,
  description,
  children,
}: {
  icon: LucideIcon;
  name: string;
  statusLabel: string;
  tone: Tone;
  description: string;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-strong bg-panel-raised text-text-muted">
            <Icon size={17} />
          </span>
          <span className="truncate font-display text-sm font-medium text-text">{name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded border px-1.5 py-0.5 font-data text-[10px] font-semibold tracking-wide uppercase ${BADGE[tone]}`}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? `Collapse ${name}` : `Configure ${name}`}
            aria-expanded={expanded}
            className={`flex h-8 w-8 items-center justify-center rounded-md border ${
              expanded
                ? "border-accent text-accent"
                : "border-border-strong text-text-faint hover:border-accent hover:text-accent"
            }`}
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <p className="mt-2 text-sm text-text-muted">{description}</p>
          {children && <div className="mt-3">{children}</div>}
        </>
      )}
    </div>
  );
}
