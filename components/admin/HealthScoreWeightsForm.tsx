"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KpiSettings } from "@/lib/services/kpiSettings";

// Same "client component, local state, fetch to a dedicated API route"
// pattern as the /integrations credential forms (e.g.
// HaloPsaCredentialForm.tsx) — this app has no Server Actions anywhere.
export function HealthScoreWeightsForm({ settings }: { settings: KpiSettings }) {
  const router = useRouter();
  const [responsiveness, setResponsiveness] = useState(settings.healthWeightResponsiveness);
  const [resolution, setResolution] = useState(settings.healthWeightResolution);
  const [workload, setWorkload] = useState(settings.healthWeightWorkload);
  const [phone, setPhone] = useState(settings.healthWeightPhone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const sum = responsiveness + resolution + workload + phone;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (sum !== 100) {
      setError(`Weights must sum to 100 (currently ${sum}).`);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/kpi-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        healthWeightResponsiveness: responsiveness,
        healthWeightResolution: resolution,
        healthWeightWorkload: workload,
        healthWeightPhone: phone,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save weights.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-xs text-text-faint">
        How much each category contributes to the Service Desk Health score on /tech-performance. Unavailable
        categories (e.g. no calls yet today) are excluded and the rest rebalance proportionally — these weights are
        the base, before that rebalancing.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Responsiveness</span>
          <input
            type="number"
            min={0}
            max={100}
            value={responsiveness}
            onChange={(e) => setResponsiveness(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Resolution</span>
          <input
            type="number"
            min={0}
            max={100}
            value={resolution}
            onChange={(e) => setResolution(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Workload</span>
          <input
            type="number"
            min={0}
            max={100}
            value={workload}
            onChange={(e) => setWorkload(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Phone</span>
          <input
            type="number"
            min={0}
            max={100}
            value={phone}
            onChange={(e) => setPhone(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className={`font-data text-xs ${sum === 100 ? "text-text-faint" : "text-status-critical"}`}>
        Sum: {sum} / 100 {sum !== 100 && "— must equal 100 to save"}
      </div>

      {error && <div className="text-xs text-status-critical">{error}</div>}
      {saved && <div className="text-xs text-status-ok">Saved.</div>}

      <button
        type="submit"
        disabled={busy || sum !== 100}
        className="min-h-11 w-fit rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Save weights
      </button>
    </form>
  );
}
