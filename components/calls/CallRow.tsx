"use client";

import { PhoneIncoming, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { ClientText } from "@/components/ClientText";
import type { CallWithCompany } from "@/lib/services/callActivity";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Ring count isn't in the CDR (no ring-event field, just start/answer
// timestamps) so it's not shown — this is ring time, not a fabricated
// ring count. Null when the call was never answered (no answeredAt).
function ringSeconds(call: { startAt: Date; answeredAt: Date | null }): number | null {
  if (!call.answeredAt) return null;
  const seconds = Math.round((call.answeredAt.getTime() - call.startAt.getTime()) / 1000);
  return seconds >= 0 ? seconds : null;
}

function directionIcon(direction: string, missed: boolean) {
  if (missed) return <PhoneMissed size={15} className="text-status-critical" />;
  if (direction.toLowerCase().includes("out")) return <PhoneOutgoing size={15} className="text-text-muted" />;
  return <PhoneIncoming size={15} className="text-text-muted" />;
}

// externalNumber is already normalized to 10 clean digits (see
// unitedCloud.ts) — this is display formatting only, not parsing.
function formatPhone(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function CallRow({ call }: { call: CallWithCompany }) {
  const identity = call.companyName ?? (call.externalNumber ? formatPhone(call.externalNumber) : null);
  const rang = ringSeconds(call);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3">
      <span className="shrink-0">{directionIcon(call.direction, call.missed)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text">
          {identity ?? <span className="text-text-faint">Unknown caller</span>}
        </div>
        <div className="mt-0.5 font-data text-[11px] text-text-faint">
          <ClientText compute={() => TIME_FORMAT.format(call.startAt)} fallback={call.startAt.toISOString()} />
          {" · "}
          {call.missed ? <span className="text-status-critical">Missed</span> : formatDuration(call.durationSeconds)}
          {rang !== null && (
            <>
              {" · "}
              rang {rang}s
            </>
          )}
          {call.answeredBy && (
            <>
              {" · "}
              {call.answeredBy}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
