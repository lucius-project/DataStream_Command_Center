# DataStream Command Center

Local-first daily operating system for DataStream Networks Inc. Phase 1: Inbox
Command (live Microsoft Graph) and Operations (mocked HaloPSA-shaped data).

## Run it

```bash
cp .env.example .env   # fill in the Microsoft Graph values, see below
docker compose up --build
```

Open http://localhost:3001. SQLite lives at `data/dev.db` (bind-mounted, survives
rebuilds). Migrations and the Prisma client regenerate automatically on
container start; seed the mock Operations data with:

```bash
docker compose exec web npx prisma db seed
```

## Microsoft Graph setup (required for Inbox Command)

Inbox Command is live from day one — it needs a real Microsoft Entra ID app
registration:

1. In the [Entra admin center](https://entra.microsoft.com), register a new
   app (App registrations → New registration).
2. Add a **Web** redirect URI: `http://localhost:3001/api/auth/microsoft/callback`.
3. Under **API permissions**, add delegated Microsoft Graph permissions
   `Mail.Read` and `Mail.ReadWrite`, then grant admin consent if your tenant
   requires it.
4. Under **Certificates & secrets**, create a client secret.
5. Make sure `TOKEN_ENCRYPTION_KEY` is set in `.env` (generate with
   `openssl rand -hex 32`) — this encrypts everything below at rest.
6. Enter the client ID, tenant ID, and client secret on the **Integrations**
   page (`/integrations`) — no `.env` editing needed for these three.
   (`.env`'s `MICROSOFT_CLIENT_ID` / `_SECRET` / `_TENANT_ID` still work as a
   fallback if you'd rather set them there; values entered on the
   Integrations page take precedence.)
7. Click **Connect Microsoft 365** on that same page, or from `/inbox`.

HaloPSA, NinjaRMM, and Keap are mocked in Phase 1 — see `lib/integrations/`.

## Stack

Next.js (App Router) + TypeScript + Tailwind, Prisma + SQLite, Docker Compose
for local dev.
