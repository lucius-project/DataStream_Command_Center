"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KpiSettings } from "@/lib/services/kpiSettings";

function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-data text-xs text-text-faint">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
      />
    </label>
  );
}

// Sample-size minimums, the callback target, the stale-ticket threshold,
// and the four Service-Desk-relevant SLA/aging/answer-rate color bands —
// everything else on /admin covers a distinct concern (score weights,
// technician roles); this form covers what's left of the Phase 12 scope.
// Business Health's own bands (Gross Margin, Device Health, etc.) are a
// different page and stay out of scope here.
export function ThresholdsForm({ settings }: { settings: KpiSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof KpiSettings>(key: K, v: KpiSettings[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await fetch("/api/admin/kpi-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minSlaSample: values.minSlaSample,
        resolutionWindowDays: values.resolutionWindowDays,
        minPercentileSample: values.minPercentileSample,
        callbackTargetMinutes: values.callbackTargetMinutes,
        staleBusinessHours: values.staleBusinessHours,
        responseSlaGreenPct: values.responseSlaGreenPct,
        responseSlaYellowPct: values.responseSlaYellowPct,
        resolutionSlaGreenPct: values.resolutionSlaGreenPct,
        resolutionSlaYellowPct: values.resolutionSlaYellowPct,
        agingGreenCount: values.agingGreenCount,
        agingYellowCount: values.agingYellowCount,
        answerRateGreenPct: values.answerRateGreenPct,
        answerRateYellowPct: values.answerRateYellowPct,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save thresholds.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div>
        <div className="mb-2 font-data text-[11px] font-semibold tracking-wide text-text-faint uppercase">
          Sample sizes &amp; windows
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Min SLA sample" min={1} value={values.minSlaSample} onChange={(v) => set("minSlaSample", v)} />
          <NumberField label="Resolution window (days)" min={1} value={values.resolutionWindowDays} onChange={(v) => set("resolutionWindowDays", v)} />
          <NumberField label="Min percentile sample" min={1} value={values.minPercentileSample} onChange={(v) => set("minPercentileSample", v)} />
        </div>
      </div>

      <div>
        <div className="mb-2 font-data text-[11px] font-semibold tracking-wide text-text-faint uppercase">
          Callback &amp; stale-ticket thresholds
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Callback target (minutes)" min={1} value={values.callbackTargetMinutes} onChange={(v) => set("callbackTargetMinutes", v)} />
          <NumberField label="Stale threshold (business hours)" min={1} value={values.staleBusinessHours} onChange={(v) => set("staleBusinessHours", v)} />
        </div>
      </div>

      <div>
        <div className="mb-2 font-data text-[11px] font-semibold tracking-wide text-text-faint uppercase">
          Response SLA band (%)
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Green at/above" value={values.responseSlaGreenPct} onChange={(v) => set("responseSlaGreenPct", v)} />
          <NumberField label="Yellow at/above" value={values.responseSlaYellowPct} onChange={(v) => set("responseSlaYellowPct", v)} />
        </div>
      </div>

      <div>
        <div className="mb-2 font-data text-[11px] font-semibold tracking-wide text-text-faint uppercase">
          Resolution SLA band (%)
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Green at/above" value={values.resolutionSlaGreenPct} onChange={(v) => set("resolutionSlaGreenPct", v)} />
          <NumberField label="Yellow at/above" value={values.resolutionSlaYellowPct} onChange={(v) => set("resolutionSlaYellowPct", v)} />
        </div>
      </div>

      <div>
        <div className="mb-2 font-data text-[11px] font-semibold tracking-wide text-text-faint uppercase">
          Aging band (ticket count — lower is better)
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Green at/below" value={values.agingGreenCount} onChange={(v) => set("agingGreenCount", v)} />
          <NumberField label="Yellow at/below" value={values.agingYellowCount} onChange={(v) => set("agingYellowCount", v)} />
        </div>
      </div>

      <div>
        <div className="mb-2 font-data text-[11px] font-semibold tracking-wide text-text-faint uppercase">
          Answer Rate band (%)
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Green at/above" value={values.answerRateGreenPct} onChange={(v) => set("answerRateGreenPct", v)} />
          <NumberField label="Yellow at/above" value={values.answerRateYellowPct} onChange={(v) => set("answerRateYellowPct", v)} />
        </div>
      </div>

      {error && <div className="text-xs text-status-critical">{error}</div>}
      {saved && <div className="text-xs text-status-ok">Saved.</div>}

      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-fit rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Save thresholds
      </button>
    </form>
  );
}
