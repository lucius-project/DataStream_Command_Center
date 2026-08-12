"use client";

import { useId, useState } from "react";
import type { TrendDay } from "@/lib/services/inbox";
import { ClientText } from "@/components/ClientText";
import { useMounted } from "@/lib/useMounted";

const SERIES_1 = "var(--color-series-1)"; // Incoming
const SERIES_2 = "var(--color-series-2)"; // Cleared

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const FULL_DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function TrendChart({ data }: { data: TrendDay[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const gradientId = useId();
  const mounted = useMounted();

  const max = Math.max(1, ...data.map((d) => Math.max(d.incoming, d.cleared)));
  const chartHeight = 160;
  const barSlot = 28;
  const barWidth = 10;
  const gap = 2;
  const width = data.length * barSlot;

  function scaleY(value: number) {
    return (value / max) * (chartHeight - 24);
  }

  const active = hovered !== null ? data[hovered] : null;

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 font-data text-xs text-text-muted">
          <LegendSwatch color={SERIES_1} label="Incoming" />
          <LegendSwatch color={SERIES_2} label="Cleared" />
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="min-h-8 rounded border border-border-strong px-2 text-[11px] text-text-muted hover:text-text"
        >
          {showTable ? "View chart" : "View as table"}
        </button>
      </div>

      {showTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left font-data text-xs">
            <thead>
              <tr className="text-text-faint">
                <th className="py-1 pr-3 font-normal">Date</th>
                <th className="py-1 pr-3 font-normal">Incoming</th>
                <th className="py-1 font-normal">Cleared</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-t border-border text-text">
                  <td className="py-1.5 pr-3">
                    <ClientText compute={() => FULL_DATE.format(new Date(d.date))} fallback={d.date} />
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{d.incoming}</td>
                  <td className="py-1.5 tabular-nums">{d.cleared}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-4 w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${chartHeight}`}
            className="h-40"
            style={{ width: Math.max(width, 320) }}
            role="img"
            aria-label="Inbox incoming versus cleared, per day"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1" />
            </defs>
            <line
              x1={0}
              y1={chartHeight - 20}
              x2={width}
              y2={chartHeight - 20}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
            />
            {data.map((d, i) => {
              const x = i * barSlot;
              const incomingH = scaleY(d.incoming);
              const clearedH = scaleY(d.cleared);
              const isHovered = hovered === i;
              return (
                <g
                  key={d.date}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  tabIndex={0}
                  role="img"
                  aria-label={`${mounted ? FULL_DATE.format(new Date(d.date)) : d.date}: ${d.incoming} incoming, ${d.cleared} cleared`}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  <rect x={x} y={0} width={barSlot} height={chartHeight - 20} fill="transparent" />
                  <rect
                    x={x + barSlot / 2 - barWidth - gap / 2}
                    y={chartHeight - 20 - incomingH}
                    width={barWidth}
                    height={Math.max(incomingH, 1)}
                    rx={3}
                    fill={SERIES_1}
                    opacity={isHovered || hovered === null ? 1 : 0.45}
                  />
                  <rect
                    x={x + barSlot / 2 + gap / 2}
                    y={chartHeight - 20 - clearedH}
                    width={barWidth}
                    height={Math.max(clearedH, 1)}
                    rx={3}
                    fill={SERIES_2}
                    opacity={isHovered || hovered === null ? 1 : 0.45}
                  />
                  {(i === 0 || i === data.length - 1 || i % 3 === 0) && (
                    <text
                      x={x + barSlot / 2}
                      y={chartHeight - 6}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--color-text-faint)"
                      fontFamily="var(--font-data)"
                    >
                      <ClientText compute={() => WEEKDAY.format(new Date(d.date))} fallback="" />
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {active && (
            <div className="pointer-events-none absolute left-2 top-0 rounded-md border border-border-strong bg-panel-raised px-3 py-2 font-data text-xs shadow-lg">
              <div className="text-text-faint">{FULL_DATE.format(new Date(active.date))}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES_1 }} />
                <span className="font-semibold text-text">{active.incoming}</span>
                <span className="text-text-muted">incoming</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES_2 }} />
                <span className="font-semibold text-text">{active.cleared}</span>
                <span className="text-text-muted">cleared</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
