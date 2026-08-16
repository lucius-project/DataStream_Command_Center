import { prisma } from "@/lib/prisma";

export async function getClientProfitabilityReport() {
  return prisma.client.findMany({
    include: {
      agreementItems: true,
      techHours: { orderBy: { hours: "desc" } },
      // Most recent 12 months present in the ledger — on instances where
      // the HaloPSA backfill can only reach back a few weeks (see
      // fetchHaloTicketHistory's 1000-row cap), this may be fewer than 12.
      monthlyHours: { orderBy: { yearMonth: "desc" }, take: 12 },
      // Revenue/cost/profit — only populated for QuickBooks-linked
      // clients (see syncAllClientFinancials); null otherwise, never
      // fabricated for an unlinked client.
      financials: true,
      // Up to 12 months of Effective Hourly Rate / Service Profit history
      // (see ClientLaborMonthly's schema comment), most recent first —
      // powers both the current-month figure and the trend pop-outs on
      // Client Profitability's Financial Summary table. Doesn't depend
      // on QuickBooks at all, unlike financials above.
      laborMonthly: { orderBy: { yearMonth: "desc" }, take: 12 },
    },
    orderBy: { hoursThisMonth: "desc" },
  });
}

// IT Service Agreement breakdown — groups a client's AgreementItem rows
// (real name/quantity/unit price synced from HaloPSA's RecurringInvoice
// lines, see haloClients.ts) by what kind of thing they actually are, so
// "what does this client have" reads as a few labeled groups instead of
// a flat list of product names. Pure name-pattern matching, not an
// AI guess and not a persisted field — recategorizing after a pattern
// fix or a new category just needs a page reload, no resync.
//
// "Service" is the core managed-services labor line (billed by the
// hour's worth of work, not a resold good) — was called "Labor &
// Service" until the business renamed it for clarity. The other
// categories (M365/Backup/Security/Other) are resold products with a
// real per-unit wholesale cost; their combined profit is labeled
// "Product Profit" in the UI (see buildAgreementBreakdown below).
export type AgreementItemCategory = "Service" | "M365" | "Backup" | "Security" | "Other";

// Order matters: tested top to bottom, first match wins. The specific
// categories (M365/Backup/Security) must come before "Service"'s broad
// managed/service/support match, or e.g. "Managed Backup Service" would
// wrongly land in Service instead of Backup.
//
// "datastream protect" (not a bare "protect") is deliberate — this is
// this account's actual branded backup/BDR product line ("DataStream
// Protect | Virtual Machine Server", "...| Recovery Testing", confirmed
// live), not a generic word match; a bare /protect/i would also catch
// unrelated hardware accessories (screen/surge protectors) if one ever
// showed up as a billed line.
const CATEGORY_PATTERNS: [RegExp, AgreementItemCategory][] = [
  [/microsoft ?365|\bm365\b|office ?365|exchange online|\bentra\b|sharepoint|onedrive|\bteams\b/i, "M365"],
  [/backup|\bbdr\b|disaster recovery|datastream protect/i, "Backup"],
  [/security|antivirus|\bedr\b|\bmdr\b|endpoint protection|firewall|\bvpn\b|fortress/i, "Security"],
  [/managed|it support|help ?desk|\bservice\b/i, "Service"],
];

export function categorizeAgreementItem(name: string): AgreementItemCategory {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(name)) return category;
  }
  return "Other";
}

export type AgreementBreakdownItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  // Real wholesale cost from HaloPSA's own /api/Item catalog (see
  // AgreementItem.unitCost's schema comment) — not meaningful for the
  // Service category (its real cost is hours × the labor rate, see
  // ClientLaborMonthly/computeClientLaborSnapshot below), so that
  // category's monthlyProfit is left at 0 rather than double-counted
  // against whatever the catalog happens to say about its item.
  unitCost: number | null;
};

export type AgreementCategoryGroup = {
  category: AgreementItemCategory;
  items: AgreementBreakdownItem[];
  // Sum of unitPrice × quantity across items that have a real price —
  // items with no matching recurring invoice line (unitPrice null)
  // contribute 0 here, not a guessed amount; hasUnpricedItems flags that
  // this total is a floor, not the complete picture.
  monthlyValue: number;
  hasUnpricedItems: boolean;
  // Product Profit — real revenue minus real wholesale cost, per
  // category (e.g. what DataStream Protect/Fortress Security actually
  // nets after their own per-seat cost). 0/false for Service by design
  // (see AgreementBreakdownItem.unitCost); use the dedicated Service
  // Profit widget for that category instead.
  monthlyCost: number;
  monthlyProfit: number;
  hasUnknownCost: boolean;
};

const CATEGORY_DISPLAY_ORDER: AgreementItemCategory[] = ["Service", "M365", "Backup", "Security", "Other"];

export function buildAgreementBreakdown(items: AgreementBreakdownItem[]): AgreementCategoryGroup[] {
  const byCategory = new Map<AgreementItemCategory, AgreementBreakdownItem[]>();
  for (const item of items) {
    const category = categorizeAgreementItem(item.name);
    const list = byCategory.get(category) ?? [];
    list.push(item);
    byCategory.set(category, list);
  }
  return CATEGORY_DISPLAY_ORDER.filter((c) => byCategory.has(c)).map((category) => {
    const groupItems = byCategory.get(category)!;
    const monthlyValue = groupItems.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.quantity, 0);
    const isServiceCategory = category === "Service";
    const monthlyCost = isServiceCategory ? 0 : groupItems.reduce((sum, i) => sum + (i.unitCost ?? 0) * i.quantity, 0);
    return {
      category,
      items: groupItems,
      monthlyValue,
      hasUnpricedItems: groupItems.some((i) => i.unitPrice === null),
      monthlyCost,
      monthlyProfit: isServiceCategory ? 0 : monthlyValue - monthlyCost,
      hasUnknownCost: isServiceCategory ? false : groupItems.some((i) => i.unitPrice !== null && i.unitCost === null),
    };
  });
}

// Effective Hourly Rate & Service Profit (UI names — the business calls
// this "Service", not "Labor"; internal names below still say "labor"
// since they map straight onto the ClientLaborMonthly/KpiSettings
// schema fields, which weren't renamed to avoid a migration for a pure
// label change) — the Service agreement line (see buildAgreementBreakdown)
// against real hours and the admin-set rate (KpiSettings.laborHourlyRate,
// shown in Admin Settings as "Service hourly rate"). Pure function so
// the math is unit-testable without touching the DB; the actual
// snapshot write (freezing these values per month into
// ClientLaborMonthly) happens in haloClients.ts's syncClientProfitability,
// which is the only place that already has fresh AgreementItems and
// Client.hoursThisMonth in hand for the same client in the same pass.
export type ClientLaborSnapshotInput = {
  laborLineValue: number;
  // Any order — sorted internally by yearMonth desc and the 3 most
  // recent taken, so callers can just pass whatever they already have.
  monthlyHoursHistory: { yearMonth: string; hours: number }[];
  hoursThisMonth: number;
  laborHourlyRate: number; // KpiSettings value; 0 = not configured
};

export type ClientLaborSnapshot = {
  laborLineValue: number;
  // null (not 0) until there's at least one month of hours history to
  // average — an empty trailing window is "unavailable," not "$0/hr."
  avgHoursLastQuarter: number | null;
  effectiveHourlyRate: number | null;
  hoursThisMonth: number;
  hourlyRateUsed: number;
  laborCost: number;
  laborProfit: number;
};

export function computeClientLaborSnapshot(input: ClientLaborSnapshotInput): ClientLaborSnapshot {
  const lastQuarter = [...input.monthlyHoursHistory]
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
    .slice(0, 3);
  const avgHoursLastQuarter =
    lastQuarter.length > 0
      ? Math.round((lastQuarter.reduce((sum, m) => sum + m.hours, 0) / lastQuarter.length) * 10) / 10
      : null;
  const effectiveHourlyRate =
    avgHoursLastQuarter !== null && avgHoursLastQuarter > 0
      ? Math.round((input.laborLineValue / avgHoursLastQuarter) * 100) / 100
      : null;
  const laborCost = Math.round(input.hoursThisMonth * input.laborHourlyRate * 100) / 100;
  const laborProfit = Math.round((input.laborLineValue - laborCost) * 100) / 100;

  return {
    laborLineValue: input.laborLineValue,
    avgHoursLastQuarter,
    effectiveHourlyRate,
    hoursThisMonth: input.hoursThisMonth,
    hourlyRateUsed: input.laborHourlyRate,
    laborCost,
    laborProfit,
  };
}

// Chronological (oldest → newest), most recent 12 months — never
// backfilled for months before this feature shipped (see
// ClientLaborMonthly's own schema comment for why that can't be done
// honestly), so a brand-new client here just has fewer points, not
// fabricated ones.
export async function getClientLaborTrend(clientId: string) {
  const rows = await prisma.clientLaborMonthly.findMany({
    where: { clientId },
    orderBy: { yearMonth: "desc" },
    take: 12,
  });
  return rows.reverse();
}

export type RollingAverage = {
  avgHoursPerMonth: number;
  monthsCovered: number;
  earliestMonth: string | null;
  latestMonth: string | null;
};

// Average is always total ÷ months actually present in the ledger, never
// ÷ 12 — so it stays honest about a short backfill window instead of
// silently understating the average. earliest/latestMonth ("YYYY-MM") let
// the UI label the window instead of implying a full year was measured.
export function rollingAverageHours(monthlyHours: { yearMonth: string; hours: number }[]): RollingAverage {
  if (monthlyHours.length === 0) {
    return { avgHoursPerMonth: 0, monthsCovered: 0, earliestMonth: null, latestMonth: null };
  }
  const total = monthlyHours.reduce((sum, m) => sum + m.hours, 0);
  const sorted = [...monthlyHours].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  return {
    avgHoursPerMonth: Math.round((total / monthlyHours.length) * 10) / 10,
    monthsCovered: monthlyHours.length,
    earliestMonth: sorted[0].yearMonth,
    latestMonth: sorted[sorted.length - 1].yearMonth,
  };
}
