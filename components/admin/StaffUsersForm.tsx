"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/app/generated/prisma/client";
import type { Tech } from "@/lib/integrations/halopsa";

const ROLE_OPTIONS: (AppRole | "")[] = ["", "TECHNICIAN", "SERVICE_MANAGER", "CEO", "SDR"];
const ROLE_LABELS: Record<AppRole | "", string> = {
  "": "Unassigned — no access yet",
  TECHNICIAN: "Technician — own performance only",
  SERVICE_MANAGER: "Service Manager — full team view",
  CEO: "CEO — everything, incl. financials",
  SDR: "SDR — reserved, no pages yet",
};

export type StaffUserRow = { id: string; email: string; name: string; role: AppRole | null; techPerson: string | null };

// CEO-only role assignment — the only place a freshly-signed-in
// StaffUser (role: null, stuck on /pending) actually gets access. See
// app/api/auth/staff/callback/route.ts for how a row gets here in the
// first place.
export function StaffUsersForm({ rows: initialRows, knownTechs }: { rows: StaffUserRow[]; knownTechs: readonly Tech[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function updateRow(id: string, patch: Partial<StaffUserRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (rows.some((r) => r.role === "TECHNICIAN" && !r.techPerson)) {
      setError("Every Technician needs a tech assigned.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: rows.map((r) => ({ id: r.id, role: r.role, techPerson: r.techPerson })) }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save users.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No one has signed in yet.</p>;
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1.2fr_1.4fr_1fr] items-center gap-3 rounded-md border border-border bg-panel-raised p-2.5">
            <div className="flex flex-col">
              <span className="text-sm text-text">{row.name}</span>
              <span className="font-data text-[11px] text-text-faint">{row.email}</span>
            </div>
            <select
              value={row.role ?? ""}
              onChange={(e) => {
                const role = (e.target.value || null) as AppRole | null;
                updateRow(row.id, { role, techPerson: role === "TECHNICIAN" ? row.techPerson : null });
              }}
              className="min-h-11 rounded-md border border-border-strong bg-panel px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {row.role === "TECHNICIAN" ? (
              <select
                value={row.techPerson ?? ""}
                onChange={(e) => updateRow(row.id, { techPerson: e.target.value || null })}
                className="min-h-11 rounded-md border border-border-strong bg-panel px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
              >
                <option value="">Which tech?</option>
                {knownTechs.map((tech) => (
                  <option key={tech} value={tech}>
                    {tech}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-center font-data text-xs text-text-faint">—</span>
            )}
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
        Save users
      </button>
    </form>
  );
}
