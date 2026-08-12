// QuickBooks Online adapter — powers Company Profile financials.
// Confirmed real fields: Item.UnitPrice (retail), Item.PurchaseCost
// (cost), Invoice.CustomerRef/Line[]/TotalAmt/TxnDate, Customer.Id/
// DisplayName. Honest gap: which account represents "payroll" isn't
// knowable until a real chart of accounts is seen — the raw first
// Purchase record is logged on every sync so the keyword match below
// can be corrected, same pattern as every other adapter here.

import { prisma } from "@/lib/prisma";
import { getValidQuickBooksAccessToken, isQuickBooksConnected } from "@/lib/auth/quickbooksOAuth";

type QboRecord = Record<string, unknown>;

const PAYROLL_KEYWORDS = ["payroll", "wages", "salaries", "salary"];

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
// Invoices/Items/Purchases are fetched live and aggregated, not
// persisted, same as HaloPSA Actions already work.
export async function syncClientFinancials(clientId: string): Promise<{ error?: string }> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.quickbooksCustomerId) {
    return {};
  }

  try {
    const monthStart = startOfMonthISODate();

    const [invoices, purchases, items] = await Promise.all([
      query(
        `SELECT * FROM Invoice WHERE CustomerRef = '${client.quickbooksCustomerId}' AND TxnDate >= '${monthStart}'`,
      ),
      query(`SELECT * FROM Purchase WHERE TxnDate >= '${monthStart}' MAXRESULTS 1000`),
      query("SELECT Id, UnitPrice, PurchaseCost FROM Item MAXRESULTS 1000"),
    ]);

    if (invoices.length > 0) {
      console.log("QuickBooks raw invoice sample (first result, for field-mapping reference):", JSON.stringify(invoices[0]));
    }
    if (purchases.length > 0) {
      console.log("QuickBooks raw purchase sample (first result, for field-mapping reference):", JSON.stringify(purchases[0]));
    }

    const itemById = new Map(items.map((item) => [String(item.Id), item]));

    let revenueThisMonth = 0;
    let itemCost = 0;
    let itemRevenue = 0;
    for (const invoice of invoices) {
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

    // Best-effort: sum Purchase expense-line amounts whose account name
    // looks payroll-related. See file header — unverified against a
    // real chart of accounts yet.
    let payrollTotal = 0;
    for (const purchase of purchases) {
      const lines = (purchase.Line as QboRecord[]) ?? [];
      for (const line of lines) {
        const detail = line.AccountBasedExpenseLineDetail as QboRecord | undefined;
        const accountRef = detail?.AccountRef as QboRecord | undefined;
        const accountName = (accountRef?.name as string | undefined)?.toLowerCase();
        if (accountName && PAYROLL_KEYWORDS.some((kw) => accountName.includes(kw))) {
          payrollTotal += num(line.Amount);
        }
      }
    }

    const totalHours = await prisma.client.aggregate({ _sum: { hoursThisMonth: true } });
    const allClientsHours = totalHours._sum.hoursThisMonth ?? 0;
    const blendedRate = allClientsHours > 0 ? payrollTotal / allClientsHours : 0;
    const laborCost = blendedRate * client.hoursThisMonth;

    const netProfit = revenueThisMonth - laborCost - itemCost;

    await prisma.clientFinancials.upsert({
      where: { clientId },
      update: { revenueThisMonth, laborCost, itemCost, itemRevenue, netProfit },
      create: { clientId, revenueThisMonth, laborCost, itemCost, itemRevenue, netProfit },
    });

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "QuickBooks sync failed.";
    console.error("QuickBooks client financials sync failed:", err);
    return { error: message };
  }
}
