import { getRecentSessions } from "@/lib/services/focus";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { SessionLog } from "@/components/focus/SessionLog";

export default async function FocusPage() {
  await requireSignedIn();
  const sessions = await getRecentSessions();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Focus Mode</h1>
      <p className="mt-1 text-sm text-text-muted">One task, no distractions.</p>
      <div className="mt-6 flex flex-col gap-4">
        <FocusTimer />
        <SessionLog sessions={sessions} />
      </div>
    </div>
  );
}
