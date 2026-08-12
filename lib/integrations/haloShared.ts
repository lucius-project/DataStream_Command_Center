// Small helpers shared by every HaloPSA adapter file (halopsa.ts, haloClients.ts).
// HaloPSA's exact field names vary by instance/version, so callers pass a
// list of candidate keys and take the first that's actually present.

export type RawHaloRecord = Record<string, unknown>;

export function normalizeInstanceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
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

// HaloPSA action records identify the agent by free-text name (varies by
// instance), not a stable ID mapped to our known tech list — so matching
// is substring-based against KNOWN_TECHS. Shared by weekly (Team Time
// Gaps) and monthly-per-client (Client Profitability) hours aggregation.
export function matchKnownTech<T extends string>(agentName: string, techs: readonly T[]): T | undefined {
  return techs.find((tech) => agentName.toLowerCase().includes(tech.toLowerCase()));
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
