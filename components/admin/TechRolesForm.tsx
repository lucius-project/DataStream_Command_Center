"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TECH_ROLE_LABELS, type TechRole } from "@/lib/techRole";
import type { Tech } from "@/lib/integrations/halopsa";

const ROLE_OPTIONS = Object.keys(TECH_ROLE_LABELS) as TechRole[];

export type TechRoleRow = { person: Tech; role: TechRole; expectedWeeklyHours: number };

// Role Normalization is mandatory per the master spec — this is the
// admin UI the code comments on TechRole/roleFor (techPerformanceScore.ts)
// have pointed to since Phase 6. Expected Hours is now genuinely
// per-tech here too, replacing the old flat 40-for-everyone default.
export function TechRolesForm({ rows: initialRows }: { rows: TechRoleRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function updateRow(person: Tech, patch: Partial<TechRoleRow>) {
    setRows((prev) => prev.map((r) => (r.person === person ? { ...r, ...patch } : r)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (rows.some((r) => !(r.expectedWeeklyHours > 0))) {
      setError("Expected weekly hours must be a positive number for every technician.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/tech-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: rows }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save technician roles.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-xs text-text-faint">
        Role affects the productivity throughput target each tech is measured against — a senior engineer solving
        hard escalations isn&apos;t expected to close as many tickets as a service desk technician. The technician
        roster itself (who&apos;s on the list) is still a code-level change, not editable here.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.person} className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 rounded-md border border-border bg-panel-raised p-2.5">
            <span className="font-data text-sm text-text">{row.person}</span>
            <select
              value={row.role}
              onChange={(e) => updateRow(row.person, { role: e.target.value as TechRole })}
              className="min-h-11 rounded-md border border-border-strong bg-panel px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {TECH_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step="0.5"
                value={row.expectedWeeklyHours}
                onChange={(e) => updateRow(row.person, { expectedWeeklyHours: Number(e.target.value) })}
                className="min-h-11 w-full rounded-md border border-border-strong bg-panel px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
              />
              <span className="shrink-0 font-data text-xs text-text-faint">h/wk</span>
            </label>
          </div>
        ))}
      </div>

      {error && <div className="text-xs text-status-critical">{error}</div>}
      {saved && <div className="text-xs text-status-ok">Saved.</div>}

      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-fit rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Save technician roles
      </button>
    </form>
  );
}
