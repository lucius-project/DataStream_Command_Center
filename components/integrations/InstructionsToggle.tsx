"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function InstructionsToggle({
  steps,
  note,
}: {
  steps: string[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-accent hover:text-text"
      >
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        Setup instructions
      </button>

      {open && (
        <div className="mt-3 rounded-md border border-border bg-panel-raised p-3">
          <ol className="flex flex-col gap-2 text-sm text-text">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 font-data text-xs text-text-faint">{i + 1}.</span>
                <span className="min-w-0 break-words">{step}</span>
              </li>
            ))}
          </ol>
          {note && <p className="mt-3 text-xs text-text-faint">{note}</p>}
        </div>
      )}
    </div>
  );
}
