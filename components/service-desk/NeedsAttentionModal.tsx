"use client";

import type { ManagerAlert } from "@/lib/services/managerAlerts";
import { alertFocusItems } from "@/lib/services/techFocus";
import { Modal } from "@/components/shared/Modal";
import { FocusTable } from "./FocusTable";

// Same source list and rendering as NeedsAttentionSection/Manager Action
// Queue further down the page (alertFocusItems + FocusTable) — the
// Morning Brief tile's count just gets a click-through to the real list
// instead of a second, differently-built copy of it. No fetch needed:
// alerts are already computed for the page load that renders this tile.
export function NeedsAttentionModal({
  alerts,
  knownTechs,
  onClose,
}: {
  alerts: ManagerAlert[];
  knownTechs: readonly string[];
  onClose: () => void;
}) {
  const items = alertFocusItems(alerts, knownTechs);

  return (
    <Modal
      title="Needs Attention"
      subtitle={`${items.length} item${items.length === 1 ? "" : "s"}, highest priority to lowest`}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
    >
      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          Nothing needs attention right now.
        </div>
      ) : (
        <FocusTable items={items} />
      )}
    </Modal>
  );
}
