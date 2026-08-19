// Keap REST API v1 (api.infusionsoft.com/crm/rest/v1) — confirmed live
// against a real connection. Only ever used for a one-time/re-runnable
// import of company records into CrmAccount (see that model's schema
// comment for why this isn't a live sync) — Keap's own Opportunity
// pipeline isn't used anywhere in this app; confirmed live it has zero
// rows in an open/working stage on this account.
import { getValidKeapAccessToken } from "@/lib/auth/keapOAuth";
import { prisma } from "@/lib/prisma";

const BASE = "https://api.infusionsoft.com/crm/rest/v1";

type RawKeapCompany = {
  id: number;
  company_name: string | null;
  website: string | null;
  email_address: string | null;
  phone_number: { number: string } | null;
  address: { line1: string | null; locality: string | null; region: string | null; zip_code: string | null } | null;
};

async function fetchKeapCompaniesPage(accessToken: string, offset: number, limit: number): Promise<{ companies: RawKeapCompany[]; hasNext: boolean }> {
  const res = await fetch(`${BASE}/companies?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Keap company request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { companies: RawKeapCompany[]; next?: string };
  return { companies: data.companies ?? [], hasNext: Boolean(data.next) };
}

// Every company on the account, paginated — confirmed live at 631 rows
// on a 200-per-page fetch (~4 requests), small enough to not need
// throttling/concurrency limiting the way the per-ticket HaloPSA
// fan-outs do.
async function fetchAllKeapCompanies(accessToken: string): Promise<RawKeapCompany[]> {
  const limit = 200;
  const all: RawKeapCompany[] = [];
  let offset = 0;
  for (;;) {
    const { companies, hasNext } = await fetchKeapCompaniesPage(accessToken, offset, limit);
    all.push(...companies);
    if (!hasNext || companies.length === 0) break;
    offset += limit;
  }
  return all;
}

export type ImportKeapCompaniesResult = { imported: number; updated: number; total: number };

// Upserts by keapCompanyId — creates a new CrmAccount (defaulting to the
// SUSPECT stage) for a company not yet in the pipeline, or refreshes
// just the denormalized contact-info fields for one that's already
// there. Never touches stage/notes/stageChangedAt on an existing row —
// this app owns pipeline progress once a company's been imported, a
// re-import is purely "pick up new companies / refreshed contact info."
export async function importKeapCompanies(): Promise<ImportKeapCompaniesResult> {
  const accessToken = await getValidKeapAccessToken();
  const companies = await fetchAllKeapCompanies(accessToken);

  let imported = 0;
  let updated = 0;
  for (const c of companies) {
    if (!c.company_name) continue; // no usable name to show on a card
    const data = {
      name: c.company_name,
      website: c.website || null,
      email: c.email_address || null,
      phone: c.phone_number?.number?.trim() || null,
      addressLine1: c.address?.line1 || null,
      city: c.address?.locality || null,
      region: c.address?.region || null,
      postalCode: c.address?.zip_code || null,
    };
    const existing = await prisma.crmAccount.findUnique({ where: { keapCompanyId: c.id } });
    if (existing) {
      await prisma.crmAccount.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.crmAccount.create({ data: { ...data, keapCompanyId: c.id } });
      imported++;
    }
  }

  return { imported, updated, total: companies.length };
}
