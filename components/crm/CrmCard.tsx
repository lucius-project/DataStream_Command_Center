"use client";

import { Globe, Phone, Mail } from "lucide-react";
import type { CrmAccountRow } from "./CrmBoard";

export function CrmCard({
  account,
  onDragStart,
  onOpen,
}: {
  account: CrmAccountRow;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onOpen: (account: CrmAccountRow) => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(e, account.id)}
      onClick={() => onOpen(account)}
      className="flex w-full flex-col gap-1 rounded-md border border-border bg-panel-raised p-2.5 text-left hover:border-accent"
    >
      <span className="font-display text-sm font-medium text-text">{account.name}</span>
      <span className="flex flex-col gap-0.5 font-data text-[11px] text-text-faint">
        {account.website && (
          <span className="flex items-center gap-1 truncate">
            <Globe size={10} className="shrink-0" /> {account.website}
          </span>
        )}
        {account.phone && (
          <span className="flex items-center gap-1 truncate">
            <Phone size={10} className="shrink-0" /> {account.phone}
          </span>
        )}
        {account.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail size={10} className="shrink-0" /> {account.email}
          </span>
        )}
      </span>
    </button>
  );
}
