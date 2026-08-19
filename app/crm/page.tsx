import { requireAnyRole } from "@/lib/auth/roleRank";
import { getCrmAccounts } from "@/lib/services/crm";
import { getKeapConnectionInfo } from "@/lib/services/integrations";
import { CrmBoard } from "@/components/crm/CrmBoard";

// Phase C2 — this app's own sales pipeline (Suspect → Farmlist → Raw
// Lead → Qualified Lead → Client, plus the three closed-out outcomes),
// not a Keap mirror. Confirmed live (Phase C1's discovery) that Keap's
// own Opportunity pipeline has nothing in an open/working stage on this
// account — it's used as a sales-outcome log, and the account doesn't
// find Keap's own UI usable for day-to-day list management anyway. Keap
// is only ever a one-time/re-runnable seed of real company records (see
// CrmAccount's schema comment) — stage lives here from that point on.
export default async function CrmPage() {
  await requireAnyRole(["SDR", "CEO"]);
  const [accounts, keap] = await Promise.all([getCrmAccounts(), getKeapConnectionInfo()]);

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">CRM</h1>
          <p className="mt-1 text-sm text-text-muted">
            Your own pipeline — drag a card between stages, or click it to edit.
          </p>
        </div>
      </div>

      {!keap.connected && accounts.length === 0 && (
        <div className="mt-4 rounded-md border border-status-warn/40 bg-status-warn-dim px-4 py-3 text-sm text-status-warn">
          Keap isn&apos;t connected, so there&apos;s nothing to import yet — connect it on the Integrations page, or
          add accounts by hand below.
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1">
        <CrmBoard initialAccounts={accounts} />
      </div>
    </div>
  );
}
