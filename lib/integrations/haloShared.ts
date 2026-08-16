// Small helpers shared by every HaloPSA adapter file (halopsa.ts, haloClients.ts).
// HaloPSA's exact field names vary by instance/version, so callers pass a
// list of candidate keys and take the first that's actually present.

export type RawHaloRecord = Record<string, unknown>;

export function normalizeInstanceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// Web-portal deep link to a specific ticket — confirmed against a real
// ticket URL from this account's live instance (https://halo.dsnets.com/
// ticket?id=10265), not guessed. Distinct from the API base URL these
// adapter files otherwise use instanceUrl for.
export function haloTicketUrl(instanceUrl: string, haloTicketId: string): string {
  return `${normalizeInstanceUrl(instanceUrl)}/ticket?id=${haloTicketId}`;
}

export function firstString(raw: RawHaloRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export function firstNumber(raw: RawHaloRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

export function mapHaloDate(raw: RawHaloRecord, keys: string[]): Date | null {
  const value = firstString(raw, keys);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// For fields where only the calendar date is meaningful and the time
// portion is an unrelated artifact — confirmed live on /api/Timesheet's
// "date" field, which arrives as e.g. "2026-08-05T05:32:44.99+00:00"
// (a fixed ~05:32 UTC timestamp, not midnight). Parsing that with `new
// Date()` and reading local getters shifts the day backward for any
// Pacific-negative-UTC-offset instance (05:32 UTC = previous day
// evening in Pacific time) — confirmed: "2026-08-05T05:32...+00:00"
// resolves to Aug 4 in local time, silently bucketing a whole day's
// timesheet hours onto the wrong day. This extracts the YYYY-MM-DD
// prefix directly and builds a *local* midnight Date from those
// components, so the calendar date HaloPSA actually means is preserved
// regardless of what time-of-day or UTC offset rides along with it.
export function mapHaloDateOnly(raw: RawHaloRecord, keys: string[]): Date | null {
  const value = firstString(raw, keys);
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

// HaloPSA action records identify the agent by free-text name (varies by
// instance), not a stable ID mapped to our known tech list — so matching
// is substring-based against KNOWN_TECHS. Shared by weekly (Team Time
// Gaps), monthly-per-client (Client Profitability) hours aggregation, and
// every United Cloud/NinjaOne name resolution across the app (Phase
// 12's audit found no stored ID-based mapping exists anywhere — this
// runtime heuristic is the only mechanism, everywhere).
export function matchKnownTech<T extends string>(agentName: string, techs: readonly T[]): T | undefined {
  const lower = agentName.toLowerCase();
  const matches = techs.filter((tech) => lower.includes(tech.toLowerCase()));
  if (matches.length > 1) {
    // Still first-match-wins (techs' own array order), same resolution
    // as before this fix — only the silence is fixed, not the tie-break
    // rule itself, so no output changes for any input that worked
    // correctly before. A real roster/name collision deserves a human
    // look, not a guess dressed up as certainty.
    console.warn(
      `matchKnownTech: "${agentName}" matches more than one known tech (${matches.join(", ")}) — using "${matches[0]}". Consider a less ambiguous name if this is unexpected.`,
    );
  }
  return matches[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The per-ticket Actions fan-out (fetchHaloActionsForTicket, one call per
// open ticket) can fire dozens to hundreds of requests from a single page
// load or backfill run, and HaloPSA rate-limits at 700 requests per
// rolling 5-minute window — confirmed hit in practice. Retries a 429 a
// few times with backoff (honoring Retry-After if the response sends one)
// rather than failing the whole computation over a transient limit.
async function haloGet(instanceUrl: string, accessToken: string, path: string, attempt = 1): Promise<unknown> {
  const res = await fetch(`${normalizeInstanceUrl(instanceUrl)}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 429 && attempt <= 4) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const delayMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : attempt * 3000;
    await sleep(delayMs);
    return haloGet(instanceUrl, accessToken, path, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HaloPSA request to ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

function unwrapList(data: unknown, key: string): RawHaloRecord[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key] as RawHaloRecord[];
  }
  return [];
}

// Time entries logged against tickets. Shared by Client Profitability
// (hours this month, grouped by ticket → client) and Team Time Gaps
// (hours this week, grouped by agent) — same underlying data, two views.
//
// Confirmed against the live API: /api/Actions with no ticket_id always
// returns record_count: 0 — Actions is a ticket-scoped endpoint, not a
// global feed, despite having no documented required parameter. Every
// caller must fetch per-ticket. `count=1000` sidesteps the API's default
// 50-row page (confirmed empirically: page_no/pageinate params return
// inconsistent slices, but a high `count` returns everything in one call).
export async function fetchHaloActionsForTicket(
  instanceUrl: string,
  accessToken: string,
  ticketId: string,
): Promise<RawHaloRecord[]> {
  const data = await haloGet(
    instanceUrl,
    accessToken,
    `/api/Actions?ticket_id=${encodeURIComponent(ticketId)}&count=1000`,
  );
  return unwrapList(data, "actions");
}

// In-memory cache so the per-ticket Actions fan-out (Client Profitability's
// hours-this-month, Team Time Gaps' hours-this-week — both one call per
// open ticket) doesn't refire on every page load. Both pages sync on
// every request with no cron/cache layer otherwise, and a browser tab
// left open on auto-refresh (or just normal navigation between
// /operations, /clients, /tech-performance) can rack up enough ~50-request
// bursts to hit HaloPSA's 700-per-5-minute rate limit within a minute or
// two. A module-level Map is enough here — this is a local-first app, one
// Node process in dev, not a multi-instance deployment.
const computeThrottleCache = new Map<string, { at: number; value: unknown }>();

// Shared window for both callers (Client Profitability's hoursThisMonth,
// Team Time Gaps' weekly hours) — each uses its own cache key, so they
// throttle independently rather than blocking each other.
export const HOURS_THROTTLE_MS = 2 * 60 * 1000;

export async function withComputeThrottle<T>(
  key: string,
  minIntervalMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = computeThrottleCache.get(key);
  if (cached && Date.now() - cached.at < minIntervalMs) {
    return cached.value as T;
  }
  const value = await compute();
  computeThrottleCache.set(key, { at: Date.now(), value });
  return value;
}

// Most recent tickets across the whole account — open AND closed, unlike
// fetchHaloTickets(open_only=true) in halopsa.ts. Used for the monthly
// hours backfill, which needs closed tickets to attribute historical
// Actions to a client.
//
// Confirmed against the live API: this hard-caps at 1000 rows no matter
// how large `count` is set (tested up to 10,000), and `page_no`/`pageinate`
// are silently ignored — every "page" returns the identical first 1000.
// There is no known way to page past this. On a busy instance the 1000
// most recent tickets may only span a few weeks, not a full year; callers
// must not assume a full 12 months of history is reachable.
export async function fetchHaloTicketHistory(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Tickets?open_only=false&count=1000");
  return unwrapList(data, "tickets");
}

// Runs `fn` over `items` with at most `limit` in flight at once. Shared by
// every caller that fans out one Actions call per ticket (the monthly
// Client Profitability backfill, up to ~1000 tickets; the weekly Team Time
// Gaps sync, ~50-150 tickets touched in a week) — an unbounded Promise.all
// would fire all of those at HaloPSA simultaneously.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchHaloClients(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Client");
  return unwrapList(data, "clients");
}

export async function fetchHaloClientContracts(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/ClientContract");
  return unwrapList(data, "contracts");
}

// Recurring billing templates — one per contract's active billing setup,
// tied back via contract_id. Confirmed live: the bulk list form below
// does NOT include each invoice's line items (real name/qty/unit_price
// per billed item), only the single-record detail endpoint does — see
// fetchHaloRecurringInvoiceLines. This list call is cheap (one request,
// ~40 rows on this instance) and exists to know which recurring invoice
// ids are worth a detail fetch, and which contract/client each belongs to.
export async function fetchHaloRecurringInvoices(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/RecurringInvoice?count=1000");
  return unwrapList(data, "invoices");
}

// One request per recurring invoice — this is the only endpoint that
// actually returns billed line items (item name, quantity, unit price),
// confirmed against a real response. Bounded by how many recurring
// invoices exist (dozens on this instance, not hundreds), same
// "small, explicit fan-out" cost profile as fetchHaloActionsForTicket,
// so it's fine to call once per recurring invoice via mapWithConcurrency
// rather than needing its own throttle.
export async function fetchHaloRecurringInvoiceLines(
  instanceUrl: string,
  accessToken: string,
  recurringInvoiceId: string,
): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, `/api/RecurringInvoice/${recurringInvoiceId}`);
  if (!data || typeof data !== "object") return [];
  const lines = (data as RawHaloRecord).lines;
  return Array.isArray(lines) ? (lines as RawHaloRecord[]) : [];
}

// HaloPSA's own billable-item catalog — confirmed live to carry a real
// wholesale cost (costprice) for resold products (Microsoft NCE seats,
// Fortress Security, DataStream Protect, etc.), not just a stub field.
// One bulk call, ~300 rows on this instance — a recurring invoice
// line's own _itemid cross-references a row here, giving real per-item
// margin without a second per-item fetch.
export async function fetchHaloItems(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Item?count=1000");
  return unwrapList(data, "items");
}

// Tickets only carry a numeric agent_id, not a name — this resolves it.
// Returns a Map<agentId, name> built from /api/Agent (a plain array on
// this instance, so unwrapList's Array.isArray branch handles it).
export async function fetchHaloAgentNames(instanceUrl: string, accessToken: string): Promise<Map<number, string>> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Agent");
  const rows = unwrapList(data, "agents");
  const names = new Map<number, string>();
  for (const row of rows) {
    const id = firstNumber(row, ["id"]);
    const name = firstString(row, ["name"]);
    if (id !== undefined && name) names.set(id, name);
  }
  return names;
}

// Same /api/Agent endpoint as fetchHaloAgentNames above, additionally
// reading the real `email` field HaloPSA returns per agent (confirmed
// live, e.g. "bjansen@dsnets.com") — used to address coaching-draft
// emails to the right person without a hand-maintained list. A separate
// function (not a shared fetch) rather than changing fetchHaloAgentNames'
// return shape, since that one's already relied on by live ticket sync
// and touching it isn't worth the risk for a second, unrelated caller.
export async function fetchHaloAgentEmails(instanceUrl: string, accessToken: string): Promise<{ name: string; email: string }[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Agent");
  const rows = unwrapList(data, "agents");
  const result: { name: string; email: string }[] = [];
  for (const row of rows) {
    const name = firstString(row, ["name"]);
    const email = firstString(row, ["email"]);
    if (name && email) result.push({ name, email });
  }
  return result;
}

// Same story as agent names: tickets only carry a numeric status_id, not a
// status string. Confirmed real status names ("New", "In Progress",
// "Waiting on Customer", ...) via /api/Status — a plain array here too.
export async function fetchHaloStatusNames(instanceUrl: string, accessToken: string): Promise<Map<number, string>> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Status");
  const rows = unwrapList(data, "statuses");
  const names = new Map<number, string>();
  for (const row of rows) {
    const id = firstNumber(row, ["id"]);
    const name = firstString(row, ["name"]);
    if (id !== undefined && name) names.set(id, name);
  }
  return names;
}

// Ground truth for "hours actually logged," per agent per day — HaloPSA's
// own Timesheet feature (target_hours/actual_hours/unlogged_hours),
// confirmed live as a real endpoint (200 on both /api/Timesheet and
// /api/TimeSheet — same data, case-insensitive route). This replaced an
// earlier approach that summed ticket Actions' timetaken instead: that
// undercounted badly, because most Actions' timetaken is a tiny
// system-computed duration between ticket status transitions (open →
// triage → resolved, often under a minute each), not the deliberate time
// entry a tech logs against their day — confirmed against a real tech's
// numbers, off by roughly 5x. This endpoint reports what a human looking
// at the actual Timesheet/Timecard screen in HaloPSA would see. No
// date-range query params observed or needed — the instance returns a
// rolling window around today; callers filter to whatever range they need.
export async function fetchHaloTimesheet(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const data = await haloGet(instanceUrl, accessToken, "/api/Timesheet");
  return unwrapList(data, "timesheet");
}
