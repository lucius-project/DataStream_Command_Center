import type { LockedKpi } from "@/lib/services/businessHealth";

export function LockedStrip({ locked }: { locked: LockedKpi[] }) {
  if (locked.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {locked.map((l) => (
        <span
          key={l.label}
          title={l.blockedBy}
          className="rounded border border-border-strong bg-panel-raised px-2 py-1 font-data text-[10px] text-text-faint"
        >
          {l.label} · not tracked
        </span>
      ))}
    </div>
  );
}
