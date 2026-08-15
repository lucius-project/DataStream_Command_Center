import type { InboxItem } from "@/app/generated/prisma/client";

// Pure narrative, no buttons — the same items render as actionable
// cards right next to this in Today's Actions; this panel is just the
// AI's plain-English summary of what's in them.
export function MorningBrief({ items }: { items: InboxItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-panel p-4 text-sm text-text-muted">
        Nothing needs your attention right now.
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {items.map((item, i) => (
        <li key={item.id} className="flex gap-3">
          <span className="font-data text-sm font-semibold text-text-faint">{i + 1}.</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-text">{item.sender}</div>
            <p className="mt-0.5 text-sm text-text-muted">{item.brief || item.preview}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
