"use client";

import { Modal } from "@/components/shared/Modal";

export type LaborMonthlyPoint = { yearMonth: string; value: number | null };

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Shared chart shell for both Effective Hourly Rate and Labor Profit —
// same underlying ClientLaborMonthly history, just a different value
// column and formatter, so one bar-chart implementation covers both
// tiles instead of two near-identical copies. No fetch: the page that
// renders the triggering tile already has the client's trend rows from
// getClientLaborTrend, passed straight through as props.
export function LaborMonthlyTrendModal({
  title,
  points,
  formatValue,
  positiveIsGood,
  footnote,
  onClose,
}: {
  title: string;
  points: LaborMonthlyPoint[];
  formatValue: (value: number) => string;
  // Labor Profit: negative is bad (red). Effective Hourly Rate has no
  // universal good/bad direction (depends on the business's own cost
  // target), so it stays neutral — pass undefined to skip coloring.
  positiveIsGood?: boolean;
  footnote: string;
  onClose: () => void;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));

  return (
    <Modal
      title={title}
      subtitle={`Monthly, last ${points.length} month${points.length === 1 ? "" : "s"}`}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-[480px] items-end gap-2">
          {points.map((p) => {
            const heightPct = p.value !== null ? Math.max(6, (Math.abs(p.value) / max) * 100) : 6;
            const barClass =
              p.value === null
                ? "bg-border-strong"
                : positiveIsGood === undefined
                  ? "bg-status-info"
                  : (p.value >= 0) === positiveIsGood
                    ? "bg-status-ok"
                    : "bg-status-critical";
            return (
              <div key={p.yearMonth} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-data text-[9px] text-text-faint">
                  {p.value !== null ? formatValue(p.value) : "—"}
                </span>
                <div
                  className="relative flex h-24 w-full items-end overflow-hidden rounded-sm bg-panel-raised"
                  title={p.value !== null ? `${monthLabel(p.yearMonth)}: ${formatValue(p.value)}` : `${monthLabel(p.yearMonth)}: no data`}
                >
                  <div className={`w-full rounded-sm ${barClass}`} style={{ height: `${heightPct}%` }} />
                </div>
                <span className="font-data text-[9px] text-text-faint">{monthLabel(p.yearMonth)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="font-data text-[11px] text-text-faint">{footnote}</div>
    </Modal>
  );
}
