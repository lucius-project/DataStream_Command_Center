import Link from "next/link";
import { requireRole } from "@/lib/auth/roleRank";
import { getVendorSubscriptions, daysUntil, RENEWAL_SOON_DAYS } from "@/lib/services/vendorSubscriptions";
import { bandHigherIsBetter, STATUS_TEXT, STATUS_DOT } from "@/lib/kpiStatus";

function renewalLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

// CEO-only, same as Client Profitability/Integrations — vendor
// subscription cost/renewal info is financial-adjacent. Manually
// tracked (see lib/services/vendorSubscriptions.ts's own comment on
// why — no API exposes this for the vendors that prompted this
// feature). Color banding: green well before renewal, yellow inside
// the RENEWAL_SOON_DAYS window, red once the date has passed (usually
// means it auto-renewed — Huntress's own renewal notice literally says
// "no action needed" — but still worth a glance to confirm, not
// silently hidden once past).
export default async function VendorsPage() {
  await requireRole("CEO");
  const subscriptions = await getVendorSubscriptions();

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Vendor Subscriptions</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manually-tracked renewal dates for vendors with no API for this — logged from renewal emails.
          </p>
        </div>
        <Link
          href="/vendors/new"
          className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong"
        >
          + New
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <div className="mt-6 rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          No vendor subscriptions logged yet.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {subscriptions.map((sub) => {
            const days = daysUntil(sub.renewalDate);
            const status = bandHigherIsBetter(days, RENEWAL_SOON_DAYS + 1, 1);
            return (
              <Link
                key={sub.id}
                href={`/vendors/${sub.id}/edit`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel p-4 hover:border-accent"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
                    <span className="font-display text-sm font-semibold text-text">{sub.vendorName}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-text-muted">{sub.productName}</div>
                  {sub.notes && <div className="mt-1 truncate text-xs text-text-faint">{sub.notes}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-data text-sm font-semibold ${STATUS_TEXT[status]}`}>{renewalLabel(days)}</div>
                  <div className="font-data text-[11px] text-text-faint">
                    {/* timeZone: "UTC" — renewalDate is stored as a bare
                        calendar date (new Date("2026-09-13") parses as
                        UTC midnight), so formatting in the server's
                        local timezone can shift it back a day. This
                        keeps the displayed date matching what was
                        actually entered, regardless of server timezone. */}
                    {sub.renewalDate.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
