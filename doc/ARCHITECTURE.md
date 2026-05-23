# Architecture

Carbon is now organized around a clean Postgres-first runtime. The platform uses Better Auth to establish user, organization, and role context, Drizzle to own schema and migrations, and request-scoped database clients to keep app reads and writes bound to the authenticated tenant.

```mermaid
flowchart LR
  user["Users and API clients"] --> edge["Ingress<br/>Portless locally, Vercel in prod"]

  subgraph appLayer["Application layer"]
    erp["ERP<br/>React Router"]
    mes["MES<br/>React Router"]
    academy["Academy"]
    starter["Starter"]
    api["REST API, MCP, webhooks"]
  end

  edge --> appLayer

  subgraph authLayer["Authorization boundary"]
    auth["Better Auth<br/>sessions, API keys, org membership"]
    rbac["RBAC / ABAC checks<br/>requirePermissions"]
    requestClient["Request DB client<br/>carbon_app role + RLS context"]
    serviceClient["Service DB client<br/>carbon_service role"]
  end

  appLayer --> auth
  auth --> rbac
  rbac --> requestClient
  appLayer --> serviceClient

  subgraph dataLayer["Data and state"]
    db["Postgres 18 + pgvector<br/>pg18-trixie locally"]
    drizzle["Drizzle<br/>schema, migrations, generated types"]
    storage["S3-compatible object storage<br/>MinIO locally"]
    redis["Redis<br/>cache and coordination"]
  end

  requestClient --> db
  serviceClient --> db
  drizzle --> db
  appLayer --> storage
  appLayer --> redis

  subgraph asyncLayer["Async work"]
    inngest["Inngest<br/>events, scheduled jobs, workers"]
    mail["Email and notifications<br/>Resend, Novu, Inbucket locally"]
  end

  appLayer --> inngest
  inngest --> serviceClient
  inngest --> mail

  subgraph external["External systems"]
    stripe["Stripe"]
    slack["Slack"]
    jira["Jira / Linear"]
    accounting["Xero and accounting providers"]
    manufacturing["Onshape and Paperless Parts"]
  end

  appLayer --> external
  inngest --> external
```

## Runtime Principles

- Postgres 18 with pgvector is the source of truth. Local Docker uses `pgvector/pgvector:pg18-trixie`.
- Drizzle owns schema definition, migrations, generated types, and greenfield database initialization.
- Better Auth owns identities, sessions, API keys, organization membership, and permission checks.
- The normal request path uses `carbon_app` with RLS context derived from `requirePermissions`.
- `carbon_service` is a narrow privileged boundary for trusted jobs, signed webhooks, bootstrap flows, and other server-only workflows after explicit scope validation.
- S3-compatible storage replaces Supabase storage. MinIO is the local implementation.
- Polling and route revalidation replace Supabase realtime subscriptions.

## Greenfield Local Setup

The dev CLI is designed for clean setup and reset flows:

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs `crbn up`, which starts the per-worktree Docker stack, applies database migrations, validates schema types, and starts the selected apps behind portless.

For a clean local reset, use:

```bash
crbn reset
crbn up
```

The expected local database containers are `pgvector/pgvector:pg18-trixie` with PostgreSQL 18 and pgvector installed.
