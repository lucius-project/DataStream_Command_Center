import type { InboxDailyCounts } from "@/lib/services/inbox";

const TIERS: { key: keyof InboxDailyCounts; emoji: string; label: string }[] = [
  { key: "attentionToday", emoji: "🔴", label: "need your attention today" },
  { key: "decision", emoji: "🟠", label: "require a decision" },
  { key: "delegatable", emoji: "🔵", label: "can be delegated" },
  { key: "informational", emoji: "🟢", label: "informational" },
  { key: "newsletter", emoji: "⚪", label: "newsletters / low priority" },
];

export function CategoryCountStrip({ counts }: { counts: InboxDailyCounts }) {
  return (
    <div className="flex flex-col gap-1.5">
      {TIERS.map((t) => (
        <div key={t.key} className="flex items-center gap-2 text-sm">
          <span aria-hidden>{t.emoji}</span>
          <span className="font-data font-semibold text-text">{counts[t.key]}</span>
          <span className="text-text-muted">{t.label}</span>
        </div>
      ))}
      {counts.unclassified > 0 && (
        <div className="mt-0.5 text-xs text-text-faint">{counts.unclassified} not yet classified</div>
      )}
    </div>
  );
}
