// QuickBooks Online adapter — powers Company Profile financials.
// Confirmed real fields: Item.UnitPrice (retail), Item.PurchaseCost
// (cost), Invoice.CustomerRef/Line[]/TotalAmt/TxnDate, Customer.Id/
// DisplayName.

import { prisma } from "@/lib/prisma";
import { getValidQuickBooksAccessToken, isQuickBooksConnected } from "@/lib/auth/quickbooksOAuth";
import { getKpiSettings } from "@/lib/services/kpiSettings";

type QboRecord = Record<string, unknown>;

async function getApiBase(): Promise<string> {
  const credential = await prisma.quickBooksCredential.findUnique({ where: { id: "quickbooks" } });
  const environment = credential?.environment ?? "sandbox";
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function query(sql: string): Promise<QboRecord[]> {
  const { accessToken, realmId } = await getValidQuickBooksAccessToken();
  const base = await getApiBase();
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`QuickBooks query failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { QueryResponse?: Record<string, unknown> };
  const queryResponse = data.QueryResponse ?? {};
  const listKey = Object.keys(queryResponse).find((key) => Array.isArray(queryResponse[key]));
  return listKey ? (queryResponse[listKey] as QboRecord[]) : [];
}

// Live fetch for the account-linking dropdown — not persisted, same
// approach as NinjaRMM's fetchNinjaOrganizations.
export async function fetchCustomers(): Promise<{ id: string; name: string }[]> {
  if (!(await isQuickBooksConnected())) return [];
  const rows = await query("SELECT Id, DisplayName FROM Customer MAXRESULTS 1000");
  return rows.map((r) => ({ id: String(r.Id), name: (r.DisplayName as string) || "(unnamed)" }));
}

function startOfMonthISODate(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// No historical ledger — recomputes ClientFinancials fresh every call,
// same "no historical ledger" pattern as Client.hoursThisMonth. Raw
// Invoices/Items are fetched live and aggregated, not persisted, same as
// HaloPSA Actions already work.
//
// Batched across every QuickBooks-linked client in two queries total
// (Invoice/Item), not per-client — this used to be
// `syncClientFinancials(clientId)`, filtering Invoice by CustomerRef on
// every call. That was fine called once from the Company Profile page,
// but Client Profitability needs every linked client's numbers on one
// page load; fetching all invoices for the month once and grouping by
// CustomerRef client-side scales to any client count without more API
// calls, and keeps the list and detail pages reading the exact same
// computation rather than two separately-synced versions of "this
// client's profit."
//
// Labor cost is hoursThisMonth × KpiSettings.laborHourlyRate — an
// admin-set rate (Admin Settings), not a guess at which QuickBooks
// Purchase account is "payroll" (the old blended-rate approach this
// replaced). A rate of 0 means not configured yet; laborCost is then
// honestly 0 too rather than fabricated, and the UI says so.
export async function syncAllClientFinancials(): Promise<{ error?: string }> {
  if (!(await isQuickBooksConnected())) return {};

  try {
    const monthStart = startOfMonthISODate();
    const [clients, kpiSettings] = await Promise.all([
      prisma.client.findMany({ where: { quickbooksCustomerId: { not: null } } }),
      getKpiSettings(),
    ]);
    if (clients.length === 0) return {};

    const [invoices, items] = await Promise.all([
      query(`SELECT * FROM Invoice WHERE TxnDate >= '${monthStart}' MAXRESULTS 1000`),
      query("SELECT Id, UnitPrice, PurchaseCost FROM Item MAXRESULTS 1000"),
    ]);

    if (invoices.length > 0) {
      console.log("QuickBooks raw invoice sample (first result, for field-mapping reference):", JSON.stringify(invoices[0]));
    }

    const itemById = new Map(items.map((item) => [String(item.Id), item]));

    const invoicesByCustomer = new Map<string, QboRecord[]>();
    for (const invoice of invoices) {
      const customerRef = invoice.CustomerRef as QboRecord | undefined;
      const customerId = customerRef?.value ? String(customerRef.value) : null;
      if (!customerId) continue;
      const list = invoicesByCustomer.get(customerId) ?? [];
      list.push(invoice);
      invoicesByCustomer.set(customerId, list);
    }

    for (const client of clients) {
      const clientInvoices = invoicesByCustomer.get(client.quickbooksCustomerId!) ?? [];
      let revenueThisMonth = 0;
      let itemCost = 0;
      let itemRevenue = 0;
      for (const invoice of clientInvoices) {
        revenueThisMonth += num(invoice.TotalAmt);
        const lines = (invoice.Line as QboRecord[]) ?? [];
        for (const line of lines) {
          const detail = line.SalesItemLineDetail as QboRecord | undefined;
          const itemRef = detail?.ItemRef as QboRecord | undefined;
          if (!itemRef?.value) continue;
          const item = itemById.get(String(itemRef.value));
          if (!item) continue;
          const qty = num(detail?.Qty ?? 1);
          itemCost += num(item.PurchaseCost) * qty;
          itemRevenue += num(line.Amount);
        }
      }

      const laborCost = kpiSettings.laborHourlyRate * client.hoursThisMonth;
      const netProfit = revenueThisMonth - laborCost - itemCost;

      await prisma.clientFinancials.upsert({
        where: { clientId: client.id },
        update: { revenueThisMonth, laborCost, itemCost, itemRevenue, netProfit },
        create: { clientId: client.id, revenueThisMonth, laborCost, itemCost, itemRevenue, netProfit },
      });
    }

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "QuickBooks sync failed.";
    console.error("QuickBooks client financials sync failed:", err);
    return { error: message };
  }
}
