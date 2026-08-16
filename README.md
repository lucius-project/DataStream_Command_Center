# DataStream Command Center

Local-first daily operating system for DataStream Networks Inc. — unifies HaloPSA
(tickets), United Cloud (phone), NinjaOne (remote support/RMM), QuickBooks
Online, and Microsoft 365 into one operations layer: a service desk manager's
daily view, technician performance and coaching, business health, client
profitability, and device health.

## Run it

```bash
cp .env.example .env   # fill in TOKEN_ENCRYPTION_KEY at minimum, see below
docker compose up --build
```

Open http://localhost:3001. SQLite lives at `data/dev.db` (bind-mounted, survives
rebuilds). Migrations and the Prisma client regenerate automatically on
container start.

Almost nothing above needs live credentials to boot — every integration below
is optional and the pages that depend on one degrade honestly (locked/
unavailable state, never fake data) until it's connected via the
**Integrations** page (`/integrations`).

## What's here

- **Business Health** (`/business-health`) — cross-integration KPI cockpit
  (margin, utilization, device health, pickup rate, etc.), plus an AI chat
  that *interprets* already-computed KPIs — it never calculates them.
- **Inbox Command** (`/inbox`) — live Microsoft 365 mail.
- **Operations** (`/operations`) — live HaloPSA ticket queue, backlog, and
  attention flags.
- **Call Activity** (`/calls`) — United Cloud phone analytics: answer rate,
  missed-call recovery, calls per client.
- **Command Flow** / **Focus Mode** / **Runbooks** — daily workflow and SOPs.
- **Client Profitability** (`/clients`) — margin per client, QuickBooks-backed.
- **Tech Performance** (`/tech-performance`, `/tech-performance/huddle`) — the
  Service Desk Command Center: Service Desk Health score, Manager Exception
  Engine (Needs Attention / SLA At Risk / Action Queue), technician
  performance scoring (role-normalized), cross-system activity correlation
  (Halo + phone + NinjaOne), historical trends, deterministic Coaching &
  Recognition, and a read-only Morning Brief / Huddle Mode. Every widget has
  a click-to-open info button explaining what it measures and how it's
  calculated. See `/admin` to change scoring weights and thresholds instead
  of editing code.
- **Device Health** (`/devices`) — NinjaOne-backed.
- **Admin Settings** (`/admin`) — centralized KPI weights, sample-size
  minimums, SLA/aging/answer-rate thresholds, and technician roles.
- **CRM**, **Marketing Automation**, **Department Dashboards**, **Mindset &
  Fitness** — not built yet (`status: "soon"` in `lib/nav.ts`).

## Connecting integrations

Two different patterns are used, both credential-storage-in-DB (encrypted
with `TOKEN_ENCRYPTION_KEY`), never plaintext in `.env`:

- **Enter directly on `/integrations`, no OAuth**: HaloPSA, United Cloud,
  Anthropic (for the Business Health chat). Just paste the API
  key/credentials from that system's admin panel.
- **OAuth apps you register yourself, then connect from `/integrations`**:
  Microsoft 365, NinjaOne, QuickBooks Online. Each needs an app registration
  in that vendor's developer portal first — see the steps below for
  Microsoft Graph (the others follow the same shape: register an app, set
  the redirect URI from `.env.example`, enter the resulting Client ID/Secret
  on `/integrations`, click Connect).

### Microsoft Graph (Inbox Command)

1. In the [Entra admin center](https://entra.microsoft.com), register a new
   app (App registrations → New registration).
2. Add a **Web** redirect URI: `http://localhost:3001/api/auth/microsoft/callback`.
3. Under **API permissions**, add delegated Microsoft Graph permissions
   `Mail.Read` and `Mail.ReadWrite`, then grant admin consent if your tenant
   requires it.
4. Under **Certificates & secrets**, create a client secret.
5. Make sure `TOKEN_ENCRYPTION_KEY` is set in `.env` (generate with
   `openssl rand -hex 32`) — this encrypts every credential below at rest.
6. Enter the client ID, tenant ID, and client secret on the **Integrations**
   page (`/integrations`) — no `.env` editing needed for these three.
   (`.env`'s `MICROSOFT_CLIENT_ID` / `_SECRET` / `_TENANT_ID` still work as a
   fallback if you'd rather set them there; values entered on the
   Integrations page take precedence.)
7. Click **Connect Microsoft 365** on that same page, or from `/inbox`.

NinjaOne and QuickBooks Online follow the same OAuth shape — register an app
in each vendor's portal, set the redirect URI from `.env.example`
(`NINJARMM_REDIRECT_URI` / `QUICKBOOKS_REDIRECT_URI`), then enter the Client
ID/Secret on `/integrations` and click Connect.

**Keap** is planned but not yet wired to anything (CRM is still `"soon"`).

### Optional demo data

```bash
docker compose exec web npx prisma db seed
```

Seeds a handful of illustrative attention flags on top of whatever real
HaloPSA/United Cloud/NinjaOne data you've already synced — useful for a demo,
not required to run the app. Every page here reads live data on load (there's
no background cron); nothing is mocked once an integration is connected.

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind, Prisma 7 + SQLite
(`better-sqlite3`), Docker Compose for local dev. Server Components fetch data
directly — no Server Actions anywhere in this app; client-side interactivity
calls dedicated `app/api/**/route.ts` handlers instead.

`npm test` runs Vitest over pure-logic unit tests (scoring math, KPI status
banding, business-hours/date math) — no DB or network in any of them. That's
deliberately the only automated layer: everything else in this app is
verified live against real data (a running dev server, real integrations),
not mocked, so there's no integration/e2e suite pretending otherwise.
