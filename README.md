<p align="center">
   <a href="https://carbon.ms">
      <img width="auto" height="100" alt="Carbon Logo" src="https://github.com/user-attachments/assets/177634ca-5c37-43e2-8d55-1b9f490866d5" />
   </a>
</p>

<p align="center">
    The open core for manufacturing
    <br />
    <br />
    <a href="https://discord.gg/yGUJWhNqzy">Discord</a>
    ·
    <a href="https://carbon.ms">Website</a>
    ·
    <a href="https://docs.carbon.ms">Documentation</a>
  </p>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Typescript-1a67f3?style=for-the-badge&logo=react&logoColor=white" alt="Typescript" />
  <img src="https://img.shields.io/badge/React-23272F?style=for-the-badge&logo=react&logoColor=white" alt="React" />
</p>

![ERP Screenshot](https://github.com/user-attachments/assets/2e09b891-d5e2-4f68-b924-a1c8ea42d24d)

![MES Screenshot](https://github.com/user-attachments/assets/b04f3644-91aa-4f74-af8d-6f3e12116a6b)

## Does the world need another ERP?

We built Carbon after years of building end-to-end manufacturing systems with off-the-shelf solutions. We realized that:

- Modern, API-first tooling didn't exist
- Vendor lock-in bordered on extortion
- There is no "perfect ERP" because each company is unique

We built Carbon to solve these problems ☝️

## Architecture

Carbon is designed to make it easy for you to extend the platform by building your own apps through our API. We provide some examples to get you started in the [examples](https://github.com/crbnos/carbon/blob/main/examples) folder.

![Carbon Functionality](https://github.com/user-attachments/assets/d73b3297-afb4-4bd4-a381-61b31a78aa38)

![Carbon Architecture](https://github.com/user-attachments/assets/e5532a5f-609c-4404-8706-aa9bd59e180b)

Features:

- [x] ERP
- [x] MES
- [x] QMS
- [x] Custom Fields
- [x] Nested BoM
- [x] Traceability
- [x] MRP
- [x] Configurator
- [x] MCP Client/Server
- [x] API
- [x] Webhooks
- [ ] Accounting
- [ ] Capacity Planning
- [ ] Simulation
- [ ] [Full Roadmap](https://github.com/orgs/crbnos/projects/1/views/1)

Technical highlights:

- [x] Unified auth and permissions across apps
- [x] Full-stack type safety (Database → UI)
- [x] Realtime database subscriptions
- [x] Attribute-based access control (ABAC)
- [x] Role-based access control (Customer, Supplier, Employee)
- [x] Row-level security (RLS)
- [x] Composable user groups
- [x] Dependency graph for operations
- [x] Third-party integrations

## Techstack

- [React Router](https://reactrouter.com) – framework
- [Typescript](https://www.typescriptlang.org/) – language
- [Tailwind](https://tailwindcss.com) – styling
- [Radix UI](https://radix-ui.com) - behavior
- [PostgreSQL](https://www.postgresql.org/) / [PostgREST](https://postgrest.org/) - database and REST API
- [Better Auth](https://www.better-auth.com/) - auth
- S3-compatible object storage - files
- [Redis](https://redis.io) - cache
- [Inngest](https://inngest.com) - jobs
- [Resend](https://resend.com) – email
- [Lingui](https://lingui.dev) - i18n
- [Vercel](https://vercel.com) – hosting
- [Stripe](https://stripe.com) - billing


## Codebase

The monorepo follows the Turborepo convention of grouping packages into one of two folders.

1. `/apps` for applications
2. `/packages` for shared code

### `/apps`

| Package Name | Description     | How to run                                          |
| ------------ | --------------- | --------------------------------------------------- |
| `erp`        | ERP Application | `pnpm dev` (localhost mode; picker lets you choose ERP/MES) |
| `mes`        | MES             | `pnpm dev` (localhost mode; select MES in picker, or both)  |
| `academy`    | Academy         | `pnpm dev:academy`                                  |
| `starter`    | Starter         | `pnpm dev:starter`                                  |

`pnpm dev` runs the per-worktree dev CLI in localhost mode (`crbn up --no-portless`). ERP and MES are first-class — the CLI boots the docker stack, applies migrations, regenerates types/swagger, and spawns the selected apps. Localhost mode prefers API `:54321`, ERP `:3000`, and MES `:3001`, but falls back to assigned ports if a default is already occupied; use the URLs printed by `crbn up` as the source of truth. Run `crbn up` directly when you want portless `.dev` URLs. Academy and starter are standalone Turborepo entries.

### `/packages`

| Package Name        | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| `@carbon/database`  | Database schema, migrations and types                                      |
| `@carbon/documents` | Transactional PDFs and email templates                                     |
| `@carbon/ee`        | Integration definitions and configurations                                 |
| `@carbon/config`    | Shared configuration (vitest, tsconfig, tailwind) across apps and packages |
| `@carbon/jobs`      | Background jobs and workers                                                |
| `@carbon/logger`    | Shared logger used across apps                                             |
| `@carbon/react`     | Shared web-based UI components                                             |
| `@carbon/kv`        | Redis cache client                                                         |
| `@carbon/lib`       | Third-party client libraries (slack, resend)                               |
| `@carbon/stripe`    | Stripe integration                                                         |
| `@carbon/utils`     | Shared utility functions used across apps and packages                     |

## Development

### Setup

1. Clone the repo into a public GitHub repository (or fork https://github.com/crbnos/carbon/fork). If want to make the repo private, you should [acquire a commercial license](https://carbon.ms/sales) to comply with the AGPL license.

   ```sh
   git clone https://github.com/crbnos/carbon.git
   ```

2. Go to the project folder

   ```sh
   cd carbon
   ```

Make sure that you have [Docker installed](https://docs.docker.com/desktop/install/mac-install/) on your system since this monorepo uses the Docker for local development.

In addition you must configure the following external services:

| Service | Purpose                    | URL                                                            |
| ------- | -------------------------- | -------------------------------------------------------------- |
| Posthog | Product analytics platform | [https://us.posthog.com/signup](https://us.posthog.com/signup) |
| Stripe | Payments service | [https://dashboard.stripe.com/login](https://dashboard.stripe.com/login) |
| Resend | Email service | [https://resend.com](https://resend.com) |

Posthog has a free tier which should be plenty to support local development. If you're self hosting and you don't want to use Posthog, it's pretty easy to remove the analytics.

### Installation

First download and initialize the repository dependencies.

This repo uses **pnpm** as its package manager. Enable Corepack so the correct pnpm version (pinned via `packageManager` in `package.json`) is used automatically:

```bash
$ corepack enable    # one-time: activates pnpm shim from packageManager field
```

Then install dependencies:

```bash
$ nvm use            # use node v22
$ pnpm install       # install dependencies
```

The dev stack (Postgres, PostgREST, Kong, Realtime, edge-runtime, Inngest, and Inbucket) is booted later by `crbn up` — see [Local dev CLI](#local-dev-cli-crbn) below. There is no separate "start the database" step.

### Local dev CLI (`crbn`)

[![](https://cdn.loom.com/sessions/thumbnails/690e6a4ec1c24216b56a22aa2667ba51-ee9275cabb59a0aa-full-play.gif#t=0.1)](https://www.loom.com/embed/690e6a4ec1c24216b56a22aa2667ba51)

`crbn` is a small CLI at `packages/dev/bin/crbn` that wraps two things:

- **Git worktrees** — every feature branch can live in its own checkout dir, so you can switch branches without stashing.
- **Per-worktree docker compose stack** — each worktree gets its own Postgres/API services on dynamic ports, isolated under `carbon-<slug>` compose project. Routing is handled by [portless](https://github.com/portless-dev/portless) (a local HTTPS reverse proxy that serves `*.dev` hostnames on `:443` with locally-trusted certs — installed automatically on first `crbn up`).

> **Windows users:** the dev CLI (`crbn`, `setup.sh`) is POSIX-only and expects **WSL or Git Bash**. Native cmd.exe / PowerShell shells are not supported. From a WSL/Git Bash prompt, the standard flow (`./setup.sh`, `pnpm dev`, `crbn checkout …`) works the same as on macOS/Linux.

Run `setup.sh` once to put `crbn` on your `$PATH` and install the `crbn` shell function (so `crbn checkout` can change cwd):

```bash
$ ./setup.sh                   # writes a sentinel block to ~/.zshrc or ~/.bashrc
$ source ~/.zshrc              # or open a new shell
$ crbn                         # shows commands
```

Common flows:

```bash
$ crbn checkout sid/cool-thing       # cd into worktree (creates if missing,
                                     # auto-fetches from origin if needed)
$ crbn checkout -b feat/new-thing    # new branch off origin/main + worktree
$ crbn checkout sid/cool-thing --up  # …and boot the stack inside it
$ crbn checkout 760                  # fetch GitHub PR #760 into a `pr-760`
                                     # branch + worktree (fork PRs work too)
$ crbn copy                          # re-sync .env from main checkout
$ crbn up | down | reset | status    # per-worktree compose stack
$ crbn new | list | remove           # interactive worktree management
```

`crbn up` flags:

- `--no-migrate` — skip Carbon's Postgres migration runner (use when schema is already current and you just want to re-boot containers fast)
- `--no-regen` — skip regenerating `packages/database/src/types.ts` + `swagger-docs-schema.ts` (auto-skipped when `--no-migrate` is set, since no schema change implies no type drift)

Files synced by `crbn copy` are listed under `package.json#crbn.copy` (defaults to `[".env"]`). To uninstall the rc block: `./setup.sh --uninstall`.

Create an `.env` file and copy the contents of `.env.example` file into it

```bash
$ cp ./.env.example ./.env
```

1. **Social Sign In**: Signing in requires you to setup one of two methods:

- Email requires a Resend API key (you'll set this up later on)
- Sign-in with Google requires a Google OAuth client with these variables:
  - Set `Authorized JavaScript origins` to your app origin, such as `https://erp.<worktree>.dev` or `http://localhost:3000`.
  - Set `Authorized redirect URIs` to the Better Auth callback route on that same origin, such as `https://erp.<worktree>.dev/api/auth/callback/google` or `http://localhost:3000/api/auth/callback/google`.
  - For Microsoft/Outlook, use the same app origin with `/api/auth/callback/microsoft`.
- You should set environment variables like the following.
  - `CARBON_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="******.apps.googleusercontent.com"`
  - `CARBON_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET="GOCSPX-****************"`

2. **Carbon local services**: Backend services run inside the per-worktree docker stack — `crbn up` boots them and writes everything you need into `.env.local` automatically:

- `CARBON_API_URL` — portless alias (e.g. `https://local-dev.api.dev`)
- `CARBON_PUBLIC_KEY`, `CARBON_SERVICE_ROLE_KEY` — keys minted per-worktree from a random `CARBON_AUTH_JWT_SECRET`
- `CARBON_DATABASE_URL` — direct Postgres URL on a dynamic port

`.env.local` is generated; do not commit it or hand-edit values that came from `crbn up` (they are re-derived on each boot). Put genuine secrets (OAuth client IDs, Stripe keys, Resend) in `.env` only.

Run `crbn status` at any time to see the live port assignment and the URLs portless is serving.

3. **Redis** (Caching): No setup needed for local dev — `crbn up` boots a shared Redis container and writes `REDIS_URL` into `.env.local` automatically (each worktree gets its own logical Redis DB). For self-hosted production, set `REDIS_URL` to any Redis-compatible endpoint (Upstash, AWS ElastiCache, etc.) in your prod environment.

4. **Posthog** (Analytics): In Posthog go to [https://[region].posthog.com/project/[project-id]/settings/project-details](https://[region].posthog.com/project/[project-id]/settings/project-details) to find your Project ID and Project API key:

- `POSTHOG_API_HOST=[https://[region].posthog.com]`
- `POSTHOG_PROJECT_PUBLIC_KEY=[Project API Key starting 'phc*']`

5. **Stripe** (Payment service) - [Create a stripe account](https://dashboard.stripe.com/login), add a `STRIPE_SECRET_KEY` from the Stripe `Settings > Developers` interface

- `STRIPE_SECRET_KEY="sk_test_*************"`

6. **Resend** (Email service) - [Create a Resend account](https://resend.com) and configure:

- `RESEND_API_KEY="re_**********"`
- `RESEND_DOMAIN="carbon.ms"` (or your domain, no trailing slashes or protocols)
- `RESEND_AUDIENCE_ID="*****"` (Optional - required for contact management in `packages/jobs`)

Resend is used for transactional emails (user invitations, email verification, onboarding). All three variables are stored in `packages/auth/src/config/env.ts`.

Finally, boot the stack and the apps:

```bash
$ pnpm dev                # equivalent to `crbn up --no-portless` — picker lets you choose ERP/MES
```

`crbn up` prints a summary box with the live URLs once the stack is healthy. In localhost mode, it prefers `http://localhost:3000` for ERP, `http://localhost:3001` for MES, and `http://localhost:54321` for the Carbon API, but prints assigned fallback URLs when any of those ports are already in use. With portless enabled, defaults look like:

| Surface         | URL                                                            |
| --------------- | -------------------------------------------------------------- |
| ERP             | `https://<worktree>.erp.dev`                                   |
| MES             | `https://<worktree>.mes.dev`                                   |
| API             | `https://<worktree>.api.dev`                                   |
| Inngest         | `https://<worktree>.inngest.dev`                               |
| Mail (Inbucket) | `https://<worktree>.mail.dev`                                  |
| Postgres        | `postgresql://postgres:postgres@localhost:<PORT_DB>/postgres`  |

`<worktree>` is derived from the branch name (e.g. `sid-local-dev` → `local-dev`). The main checkout drops the prefix and just uses `erp.dev`, `mes.dev`, etc. Ports for raw TCP services (Postgres, Inbucket, Inngest) are dynamic per-worktree — `crbn status` is the source of truth.

Academy and starter still run on classic localhost ports via `pnpm dev:academy` / `pnpm dev:starter` (they are not part of the per-worktree stack).

### Code Formatting

This project uses [Biome](https://biomejs.dev/) for code formatting and linting. To set up automatic formatting on save in VS Code:

1. Install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)

2. Add the following to your VS Code settings (`.vscode/settings.json` or global settings):

```json
"editor.codeActionsOnSave": {
  "source.organizeImports.biome": "explicit",
  "source.fixAll.biome": "explicit"
},
"editor.defaultFormatter": "biomejs.biome"
```

### Commands

To add a database migration

```bash
$ pnpm run db:migrate:new <name>
```

To add an AI agent

```bash
$ pnpm run agent:new <name>
```

To add an AI tool

```bash
$ pnpm run tool:new <name>
```

To stop the stack (keeps volumes — data preserved):

```bash
$ crbn down
```

To wipe the stack and start clean (destroys Postgres volume + flushes the redis db for this worktree):

```bash
$ crbn reset
```

To regenerate types or swagger schema manually (normally `crbn up` does this for you after applying migrations):

```bash
$ pnpm db:types          # → packages/database/src/types.ts + functions/lib/types.ts
$ pnpm generate:swagger  # → packages/database/src/swagger-docs-schema.ts
```

To run a command against a single workspace, use `pnpm --filter`:

```bash
$ pnpm --filter @carbon/react test
```

To restore a production database snapshot locally:

1. Export a PostgreSQL backup from production (`pg_dump`, a managed Postgres backup, or a plain SQL/dump archive).
2. Boot the stack **without applying migrations** so they don't fight the dump's schema state:
   ```bash
   $ crbn up --no-migrate
   ```
3. Find the live Postgres port (`crbn status` shows it; or read `PORT_DB` from `.env.local`).
4. Pipe the backup into the local DB as the `postgres` superuser:
   ```bash
   $ source .env.local
   $ PGPASSWORD=postgres psql -h localhost -p "$PORT_DB" -U postgres -d postgres < /path/to/backup.sql
   # …or for .dump archives:
   $ PGPASSWORD=postgres pg_restore -h localhost -p "$PORT_DB" -U postgres -d postgres --no-owner /path/to/backup.dump
   ```
5. Regenerate types so app code reflects the restored schema:
   ```bash
   $ pnpm db:types
   ```

## API

The API documentation is located in the ERP app at `${ERP}/x/api/js/intro`. It is auto-generated based on changes to the database.

There are two ways to use the API:

1. From another codebase using direct HTTP requests or a client generated from the OpenAPI-compatible schema.
2. From within the codebase using our packages.

### From another Codebase

First, set up the necessary credentials in environment variables. For the example below:

1. Navigate to settings in the ERP to generate an API key. Set this in `CARBON_API_KEY`
2. Set `CARBON_API_URL` to the REST API base URL. For Carbon Cloud this is `https://rest.carbon.ms`; for local development use your worktree API URL.

```ts
const apiKey = process.env.CARBON_API_KEY;
const apiUrl = process.env.CARBON_API_URL;

export async function listItems() {
  const response = await fetch(`${apiUrl}/item?limit=100`, {
    headers: {
      "carbon-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  // returns items from the company associated with the api key
  return response.json();
}
```

### From the Monorepo

```tsx
import { getCarbonServiceRole } from "@carbon/auth/client.server";
const carbon = getCarbonServiceRole();

// returns all items across companies
const { data, error } = await carbon.from("item").select("*");

// returns items from a specific company
const companyId = "xyz";
const { data, error } = await carbon
  .from("item")
  .select("*")
  .eq("companyId", companyId);
```


## Translations

In order to run `pnpm run translate` you must first run:

```bash
brew install ollama
brew services start ollama
ollama pull llama3.2
curl http://localhost:11434/api/tags
npx linguito config set \
  llmSettings.provider=ollama \
  llmSettings.url=http://127.0.0.1:11434/api
```
## Migration Notes

### Trigger.dev to Inngest

Background jobs have been migrated from [Trigger.dev](https://trigger.dev) to [Inngest](https://inngest.com). Key changes:

- **Job definitions** moved from `packages/jobs/trigger/` to `packages/jobs/src/inngest/functions/`
- **Triggering jobs** from app code uses `trigger()` and `batchTrigger()` from `@carbon/jobs` instead of `tasks.trigger()` from `@trigger.dev/sdk`
- **Inngest dev server** runs via `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
- **Environment variables**: `TRIGGER_SECRET_KEY`, `TRIGGER_API_URL`, and `TRIGGER_PROJECT_ID` are no longer needed. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` instead (not required for local dev).

### Upstash to Local Redis

The caching layer (`@carbon/kv`) no longer depends on Upstash. A standard Redis instance is used instead. The `REDIS_URL` environment variable still applies, but you can point it at any Redis-compatible server (including a local Docker container).

### Local backend stack (`crbn`)

Local dev uses Carbon's backend stack directly. The backend stack (Postgres 15, PostgREST, Kong, Realtime, Inngest, Inbucket, and edge-runtime) runs from `packages/dev/docker/docker-compose.dev.yml` under a per-worktree compose project (`carbon-<slug>`), managed by `crbn up` / `down` / `reset`. Ports are allocated dynamically per worktree so multiple branches can run side-by-side. Key changes:

- `pnpm db:start` / `db:stop` / `db:kill` / `db:build` are removed — use `crbn up` / `down` / `reset`.
- `.env.local` is generated by `crbn up` (worktree-specific URLs, ports, JWT secret, anon/service keys). Genuine secrets stay in `.env`.
- `pnpm db:migrate` runs `crbn migrate`, which applies SQL files from `packages/database/migrations` through Carbon's Postgres migration runner.
- `pnpm db:types` generates database types from `CARBON_DATABASE_URL`.
