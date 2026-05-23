<p align="center">
   <a href="https://carbon.ms">
      <img width="auto" height="100" alt="Carbon Logo" src="https://github.com/user-attachments/assets/86a5e583-adac-4bf9-8192-508a0adf2308" />
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
  <img src="https://img.shields.io/badge/Postgres-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="Postgres" />
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

![Carbon Functonality](https://github.com/user-attachments/assets/150c3025-ddcb-4ae4-b7b4-27c670d6cb81)

```mermaid
flowchart LR
  user["Users and API clients"] --> ingress["App ingress<br/>Portless locally, Vercel in prod"]

  subgraph apps["Carbon apps"]
    erp["ERP<br/>React Router"]
    mes["MES<br/>React Router"]
    academy["Academy / Starter"]
    api["REST, MCP, webhooks"]
  end

  ingress --> apps
  apps --> auth["Better Auth<br/>sessions, API keys, org/RBAC"]
  auth --> requestClient["Request-scoped DB client<br/>carbon_app + RLS context"]
  apps --> serviceClient["Service boundary<br/>carbon_service for jobs and trusted webhooks"]

  requestClient --> db["Postgres 18 + pgvector<br/>Drizzle schema and migrations"]
  serviceClient --> db

  apps --> storage["S3-compatible storage<br/>MinIO locally"]
  apps --> redis["Redis cache"]
  apps --> jobs["Inngest events and jobs"]
  jobs --> serviceClient
  jobs --> mail["Email and notifications<br/>Resend, Novu, Inbucket locally"]
  serviceClient --> external["External integrations<br/>Stripe, Slack, Jira, Linear, Xero, Onshape, Paperless"]
```

The current platform topology is a greenfield Postgres deployment. Local development boots `pgvector/pgvector:pg18-trixie`, applies Drizzle migrations, validates schema types, and runs Carbon apps without a Supabase runtime dependency.

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
- [x] Fast server-side data loading and polling-friendly APIs
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
- [Postgres](https://www.postgresql.org/) - database
- [Drizzle](https://orm.drizzle.team/) - schema and migrations
- [Better Auth](https://www.better-auth.com/) – auth
- S3-compatible object storage - files
- [Redis](https://redis.io) - cache
- [Inngest](https://inngest.com) - jobs
- [Resend](https://resend.com) – email
- [Lingui](https://lingui.dev) - i18n
- [Novu](https://novu.co) – notifications
- [Vercel](https://vercel.com) – hosting
- [Stripe](https://stripe.com) - billing


## Codebase

The monorepo follows the Turborepo convention of grouping packages into one of two folders.

1. `/apps` for applications
2. `/packages` for shared code

### `/apps`

| Package Name | Description     | How to run                                          |
| ------------ | --------------- | --------------------------------------------------- |
| `erp`        | ERP Application | `pnpm dev` (boots stack + ERP via `crbn up` picker) |
| `mes`        | MES             | `pnpm dev` (select MES in picker, or both)          |
| `academy`    | Academy         | `pnpm dev:academy`                                  |
| `starter`    | Starter         | `pnpm dev:starter`                                  |

`pnpm dev` runs the per-worktree dev CLI (`crbn up`). ERP and MES are first-class — the CLI boots the docker stack, applies migrations, validates schema types, and spawns the selected apps behind portless. Academy and starter are standalone Turborepo entries.

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
| Novu | Notifications service | [https://dashboard.novu.co/auth/sign-in](https://dashboard.novu.co/auth/sign-in) |

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

The dev stack (Postgres, MinIO, Inngest, and Inbucket) is booted later by `crbn up` — see [Local dev CLI](#local-dev-cli-crbn) below. There is no separate "start the database" step.

### Local dev CLI (`crbn`)

[![](https://cdn.loom.com/sessions/thumbnails/690e6a4ec1c24216b56a22aa2667ba51-ee9275cabb59a0aa-full-play.gif#t=0.1)](https://www.loom.com/embed/690e6a4ec1c24216b56a22aa2667ba51)

`crbn` is a small CLI at `packages/dev/bin/crbn` that wraps two things:

- **Git worktrees** — every feature branch can live in its own checkout dir, so you can switch branches without stashing.
- **Per-worktree docker compose stack** — each worktree gets its own Postgres, MinIO, Inngest, and Inbucket services on dynamic ports, isolated under `carbon-<slug>` compose project. Routing is handled by [portless](https://github.com/portless-dev/portless) (a local HTTPS reverse proxy that serves `*.dev` hostnames on `:443` with locally-trusted certs — installed automatically on first `crbn up`).

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

- `--no-migrate` — skip Drizzle migrations (use when schema is already current and you just want to re-boot containers fast)
- `--no-regen` — skip schema type validation (auto-skipped when `--no-migrate` is set, since no schema change implies no schema drift)

Files synced by `crbn copy` are listed under `package.json#crbn.copy` (defaults to `[".env"]`). To uninstall the rc block: `./setup.sh --uninstall`.

Create an `.env` file and copy the contents of `.env.example` file into it

```bash
$ cp ./.env.example ./.env
```

1. **Social Sign In**: Signing in requires you to setup one of two methods:

- Email requires a Resend API key (you'll set this up later on)
- Sign-in with Google requires a Google auth client:
  - Set `Authorized JavaScript origins` to your ERP origin, for example `https://erp.carbon.dev`
  - Set `Authorized redirect URIs` to your ERP callback URL, for example `https://erp.carbon.dev/api/auth/callback/google`
- You should set environment variables like the following.
  - `GOOGLE_CLIENT_ID="******.apps.googleusercontent.com"`
  - `GOOGLE_CLIENT_SECRET="GOCSPX-****************"`

2. **Backend stack**: Backend services run inside the per-worktree docker stack — `crbn up` boots them and writes everything you need into `.env.local` automatically:

- `DATABASE_MIGRATION_URL`, `DATABASE_URL`, `DATABASE_SERVICE_URL`, `JOBS_DATABASE_URL` — direct Postgres URLs on a dynamic port, split into owner/app/service roles
- `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL` — MinIO/S3-compatible storage settings
- `BETTER_AUTH_SECRET` and `AUTH_PROVIDER=better_auth` — local Better Auth settings

`.env.local` is generated; do not commit it or hand-edit values that came from `crbn up` (they are re-derived on each boot). Put genuine secrets (OAuth client IDs, Stripe keys, Resend, Novu) in `.env` only.

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

7. **Novu** (In-app notifications) - [Create a Novu account](https://dashboard.novu.co/auth/sign-in) and configure:

- `NOVU_APPLICATION_ID="********************"` (Client-side, public)
- `NOVU_SECRET_KEY="********************"` (Server-side secret, backend only)

Novu is used for in-app notifications and notification workflows. After standing up the application and tunnelling port 3000, sync your Novu workflows:

```bash
pnpm run novu:sync
```

This command syncs your Novu workflows with the Carbon application using the bridge URL.

Finally, boot the stack and the apps:

```bash
$ pnpm dev                # equivalent to `crbn up` — picker lets you choose ERP/MES
```

`crbn up` prints a summary box with the live URLs once the stack is healthy. Defaults look like:

| Surface         | URL                                                            |
| --------------- | -------------------------------------------------------------- |
| ERP             | `https://<worktree>.erp.dev`                                   |
| MES             | `https://<worktree>.mes.dev`                                   |
| Storage         | `https://<worktree>.storage.dev`                               |
| Storage Console | `https://<worktree>.console.dev`                               |
| Inngest         | `https://<worktree>.inngest.dev`                               |
| Mail (Inbucket) | `https://<worktree>.mail.dev`                                  |
| Postgres        | `postgresql://carbon:carbon@localhost:<PORT_DB>/carbon`        |

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

To validate schema types manually (normally `crbn up` does this for you after applying migrations):

```bash
$ pnpm db:types          # validates Drizzle schema/type declarations
```

To run a command against a single workspace, use `pnpm --filter`:

```bash
$ pnpm --filter @carbon/react test
```

To restore a production database snapshot locally:

1. Export a backup from production with `pg_dump`.
2. Boot the stack **without applying migrations** so they don't fight the dump's schema state:
   ```bash
   $ crbn up --no-migrate
   ```
3. Find the live Postgres port (`crbn status` shows it; or read `PORT_DB` from `.env.local`).
4. Pipe the backup into the local DB as the app database user, or use `pg_restore` for `.dump` archives:
   ```bash
   $ source .env.local
   $ PGPASSWORD=carbon psql -h localhost -p "$PORT_DB" -U carbon -d carbon < /path/to/backup.sql
   # …or for .dump archives:
   $ PGPASSWORD=carbon pg_restore -h localhost -p "$PORT_DB" -U carbon -d carbon --no-owner /path/to/backup.dump
   ```
5. Validate the schema declarations against the restored schema:
   ```bash
   $ pnpm db:types
   ```

## API

The API documentation is located in the ERP app at `${ERP}/x/api/js/intro`. Its table and column metadata is derived from the generated Drizzle schema declarations.

There are two ways to use the API:

1. From another codebase using HTTP requests with a Carbon API key.
2. From within the codebase using our packages.

### From another Codebase

First, set up the necessary credentials in environment variables. For the example below:

1. Navigate to settings in the ERP to generate an API key. Set this in `CARBON_API_KEY`
2. Set `CARBON_API_URL` to your ERP origin.

```ts
const apiKey = process.env.CARBON_API_KEY;
const apiUrl = process.env.CARBON_API_URL;

// returns items from the company associated with the api key
const response = await fetch(`${apiUrl}/api/items`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});
const data = await response.json();
```

### From the Monorepo

Request handlers should use `requirePermissions(...)` so Better Auth session,
company/org scope, API-key scope, and module permissions are resolved before
any data access. `getCarbonServiceClient()` is the privileged service-role
client for system jobs and post-authorization implementation details; it does
not perform RBAC or org translation.

```tsx
import { getCarbonServiceClient } from "@carbon/auth/client.server";
const carbon = getCarbonServiceClient();

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

### Direct Postgres and S3 docker compose (`crbn`)

The backend stack (Postgres, MinIO, Inngest, and Inbucket) runs from `docker-compose.dev.yml` under a per-worktree compose project (`carbon-<slug>`), managed by `crbn up` / `down` / `reset`. Ports are allocated dynamically per worktree so multiple branches can run side-by-side. Key changes:

- `pnpm db:start` / `db:stop` / `db:kill` / `db:build` are removed — use `crbn up` / `down` / `reset`.
- `.env.local` is generated by `crbn up` with worktree-specific URLs, ports, database URLs, and S3-compatible storage settings. Genuine secrets stay in `.env`.
- `pnpm db:migrate` runs Drizzle migrations against `DATABASE_MIGRATION_URL` when set, then falls back to the service/app database URLs.
- `pnpm db:types` is retained as a compatibility command that validates the Drizzle schema/type declaration surface.
