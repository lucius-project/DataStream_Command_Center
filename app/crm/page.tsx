import Link from "next/link";
import { requireAnyRole } from "@/lib/auth/roleRank";
import { getKeapConnectionInfo } from "@/lib/services/integrations";

// Phase C1: connection status only — the real lead/pipeline view (and
// the ability to manage it, per the SDR role's scope) is Phase C2,
// built once live discovery against a real Keap connection confirms
// the actual Contact/Opportunity field shapes. Gated to SDR + CEO via
// requireAnyRole, not requireRole — SDR doesn't sit on the linear
// Technician/Service Manager/CEO rank (see lib/auth/roleRank.ts).
export default async function CrmPage() {
  await requireAnyRole(["SDR", "CEO"]);
  const keap = await getKeapConnectionInfo();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">CRM</h1>
      <p className="mt-1 text-sm text-text-muted">Lead and pipeline view, backed by Keap.</p>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
        {!keap.connected ? (
          <>
            Not connected yet.{" "}
            <Link href="/integrations" className="text-accent hover:underline">
              Connect Keap on the Integrations page
            </Link>{" "}
            to get started.
          </>
        ) : keap.healthy ? (
          "Connected. The lead/pipeline view is coming in the next phase."
        ) : (
          <>
            Connected, but the connection currently has an issue: {keap.healthError}.{" "}
            <Link href="/integrations" className="text-accent hover:underline">
              Check the Integrations page
            </Link>
            .
          </>
        )}
      </div>
    </div>
  );
}
