import { getCommandFlowQueue } from "@/lib/services/commandFlow";
import { requireRole } from "@/lib/auth/roleRank";
import { CommandFlowView } from "@/components/command-flow/CommandFlowView";

export default async function CommandFlowPage() {
  await requireRole("SERVICE_MANAGER");
  const queue = await getCommandFlowQueue();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Command Flow</h1>
      <p className="mt-1 text-sm text-text-muted">
        The highest-leverage thing, one at a time.
      </p>
      <div className="mt-6">
        <CommandFlowView queue={queue} />
      </div>
    </div>
  );
}
