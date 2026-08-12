"use client";

import { ClientText } from "@/components/ClientText";
import type { FocusSession } from "@/app/generated/prisma/client";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export function SessionLog({ sessions }: { sessions: FocusSession[] }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="font-display text-sm font-medium text-text">Recent sessions</div>
      {sessions.length === 0 ? (
        <div className="mt-3 text-sm text-text-muted">No sessions logged yet.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-left font-data text-xs">
            <thead>
              <tr className="text-text-faint">
                <th className="py-1 pr-3 font-normal">Task</th>
                <th className="py-1 pr-3 font-normal">Duration</th>
                <th className="py-1 pr-3 font-normal">Completed</th>
                <th className="py-1 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-border text-text">
                  <td className="py-1.5 pr-3">{s.task}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{formatDuration(s.durationSeconds)}</td>
                  <td className="py-1.5 pr-3">
                    {s.completed ? (
                      <span className="text-status-ok">Yes</span>
                    ) : (
                      <span className="text-text-faint">Stopped early</span>
                    )}
                  </td>
                  <td className="py-1.5 text-text-faint">
                    <ClientText
                      compute={() =>
                        s.startedAt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      }
                      fallback={s.startedAt.toISOString()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
