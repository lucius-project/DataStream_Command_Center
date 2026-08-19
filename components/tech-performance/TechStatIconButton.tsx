"use client";

import { useState } from "react";
import { Ticket, Phone, MonitorSmartphone, ClipboardCheck } from "lucide-react";
import { Modal } from "@/components/shared/Modal";

// A component *reference* (e.g. the Ticket icon itself) can't cross the
// server/client boundary as a prop — Server Components can only pass
// plain serializable data to a "use client" component, and a function
// isn't that. So the caller (TechPerformanceRow, a Server Component)
// passes a plain string key instead, and the actual lucide-react icon
// components are only ever referenced here, inside the client boundary.
export type TechStatCategory = "tickets" | "phone" | "service" | "remote";

const CATEGORY_ICON = {
  tickets: Ticket,
  phone: Phone,
  service: ClipboardCheck,
  remote: MonitorSmartphone,
} as const;

// One tile per stat category (Tickets/Phone/Remote/Service) on a tech's
// card — the primary number stays glanceable without opening anything,
// the full section (whatever was previously always-expanded inline:
// DrilldownStats, Stats, sub-groups) only renders once clicked. Same
// "never fabricate, always let the reader drill in" rule as DrilldownStat,
// just one level up — this is a category of stats, not a single number.
export function TechStatIconButton({
  category,
  label,
  value,
  tone,
  title,
  subtitle,
  children,
}: {
  category: TechStatCategory;
  label: string;
  value: number | string;
  tone?: "warn" | "critical";
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === "critical" ? "text-status-critical" : tone === "warn" ? "text-status-warn" : "text-text";
  const Icon = CATEGORY_ICON[category];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} stats for this technician`}
        className="flex flex-1 flex-col items-center gap-1 rounded-md border border-border bg-panel-raised px-2 py-2 hover:border-accent"
      >
        <Icon size={15} className={toneClass} />
        <span className={`font-display text-sm font-semibold ${toneClass}`}>{value}</span>
        <span className="font-data text-[9px] tracking-wide text-text-muted uppercase">{label}</span>
      </button>

      {open && (
        <Modal title={title} subtitle={subtitle} onClose={() => setOpen(false)} maxWidthClassName="max-w-lg">
          {children}
        </Modal>
      )}
    </>
  );
}
