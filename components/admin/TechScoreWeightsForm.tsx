"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KpiSettings } from "@/lib/services/kpiSettings";

export function TechScoreWeightsForm({ settings }: { settings: KpiSettings }) {
  const router = useRouter();
  const [serviceDelivery, setServiceDelivery] = useState(settings.techWeightServiceDelivery);
  const [quality, setQuality] = useState(settings.techWeightQuality);
  const [productivity, setProductivity] = useState(settings.techWeightProductivity);
  const [workManagement, setWorkManagement] = useState(settings.techWeightWorkManagement);
  const [phone, setPhone] = useState(settings.techWeightPhone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const sum = serviceDelivery + quality + productivity + workManagement + phone;

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
        techWeightServiceDelivery: serviceDelivery,
        techWeightQuality: quality,
        techWeightProductivity: productivity,
        techWeightWorkManagement: workManagement,
        techWeightPhone: phone,
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
        How much each category contributes to a technician&apos;s Performance Score. Quality and Phone are currently
        always excluded (no per-tech CSAT/reopen-rate/answer-rate data exists yet) and the remaining categories
        rebalance — same rule as Health Score weights.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Service Delivery</span>
          <input
            type="number"
            min={0}
            max={100}
            value={serviceDelivery}
            onChange={(e) => setServiceDelivery(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Quality</span>
          <input
            type="number"
            min={0}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Productivity</span>
          <input
            type="number"
            min={0}
            max={100}
            value={productivity}
            onChange={(e) => setProductivity(Number(e.target.value))}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">Work Management</span>
          <input
            type="number"
            min={0}
            max={100}
            value={workManagement}
            onChange={(e) => setWorkManagement(Number(e.target.value))}
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
