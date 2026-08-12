import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-panel md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <span className="h-2 w-2 rounded-full bg-status-ok" />
        <span className="font-display text-sm font-semibold tracking-wide text-text">
          DATASTREAM
        </span>
        <span className="font-data text-[10px] tracking-widest text-text-faint">
          CMD
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-4">
        <NavLinks />
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <span className="font-data text-[11px] text-text-faint">Local-first · v1</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
