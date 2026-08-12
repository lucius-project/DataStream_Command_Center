import type { TimeGap } from "@/app/generated/prisma/client";
import { hoursSeverity, SEVERITY_FILL, SEVERITY_TEXT } from "@/lib/hoursSeverity";

function GapRow({ gap }: { gap: TimeGap }) {
  const pct = gap.expectedHours > 0 ? gap.loggedHours / gap.expectedHours : 1;
  const sev = hoursSeverity(pct);
  const shortfall = Math.max(0, gap.expectedHours - gap.loggedHours);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text">{gap.person}</span>
        <span className={`font-data text-xs ${SEVERITY_TEXT[sev]}`}>
          {gap.loggedHours}h / {gap.expectedHours}h
          {shortfall > 0 && sev !== "ok" ? ` · −${shortfall}h` : ""}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
        <div
          className={`h-full rounded-full ${SEVERITY_FILL[sev]}`}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function TimeGapsPanel({ tech, admin }: { tech: TimeGap[]; admin: TimeGap[] }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="font-display text-sm font-medium text-text">Team time gaps</div>
      <div className="mt-3 flex flex-col gap-3">
        {tech.map((g) => (
          <GapRow key={g.id} gap={g} />
        ))}
      </div>
      {admin.length > 0 && (
        <>
          <div className="mt-4 border-t border-border pt-3 font-data text-[11px] tracking-wide text-text-faint uppercase">
            Billing / Admin
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {admin.map((g) => (
              <GapRow key={g.id} gap={g} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
