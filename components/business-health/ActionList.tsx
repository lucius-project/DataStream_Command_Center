import Link from "next/link";
import type { ActionItem } from "@/lib/services/businessHealth";

const DOT = { red: "bg-status-critical", yellow: "bg-status-warn" } as const;

export function ActionList({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-panel p-3">
      <div className="font-display text-sm font-medium text-text">Priority Actions</div>
      {actions.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          Nothing needs attention right now.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {actions.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="flex items-start gap-2 rounded-md border border-border-strong bg-panel-raised px-3 py-2 hover:border-accent"
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[a.severity]}`} />
              <div className="min-w-0">
                <div className="text-sm text-text">{a.title}</div>
                <div className="font-data text-[11px] text-text-faint">{a.detail}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
