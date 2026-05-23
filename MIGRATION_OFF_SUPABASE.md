# Carbon Replatform — Architecture & Implementation Spec

**Status:** Implementation in progress
**Last updated:** 2026-05-22
**Scope:** Greenfield target architecture for Carbon (ERP/MES/Academy) that breaks the Supabase vendor dependency while remaining portable across cloud providers.

---

## Current implementation checkpoint

This repo is partway through the replatform, using the existing package names rather than the greenfield names in the original spec.

- Service/jobs database pools now require their role-specific URLs (`DATABASE_SERVICE_URL` and `JOBS_DATABASE_URL`) instead of falling back to `DATABASE_URL`, and Drizzle migrations now require `DATABASE_MIGRATION_URL` or the CI `CARBON_CONTROL_DATABASE_URL` instead of falling back to runtime roles. Greenfield deployments now fail closed when owner/service runtime roles are not configured explicitly.
- Supabase application references are removed outside this migration note and audit scripts that intentionally guard against vendor regressions. `pnpm --filter @carbon/database db:audit:vendor-removal` verifies live source/config files, vendor-named paths, package manifests, the lockfile, legacy hosted API paths such as `/auth/v1`, `/rest/v1`, and `/storage/v1`, legacy edge-function terminology, and the removed `packages/database/supabase` directory so the greenfield workspace cannot regain a Supabase runtime dependency or Deno/Supabase function mental model unnoticed.
- `packages/database` now owns a generated Drizzle schema declaration at `packages/database/src/schema/index.ts`, exported publicly as `@carbon/database/schema` and consumed by the direct Drizzle runtime client. `packages/database/scripts/audit-schema.mjs` verifies table, column, view, and enum parity between the generated Drizzle schema and migration SQL, including migration SQL coverage for all generated view names. `pnpm --filter @carbon/database db:audit:declarative-schema` verifies the Drizzle Kit config points at that schema declaration, the package exports `./schema`/`./drizzle` without exposing `./types`, `./compat`, or root-level `Database`/`Json` compatibility types, the runtime client is typed from `typeof schema`, and the legacy generated `src/types.ts` plus `src/compat.ts` facade remain deleted.
- The generated Drizzle schema exports `TableRow<Name>`, `TableInsert<Name>`, `TableUpdate<Name>`, `EnumValue<Enum>`, `Json`, and `QueryDatabase` helpers for app/package code that needs schema-derived row, mutation, enum, JSON, or direct-query-client types without depending on the legacy Supabase-shaped `Database` type. `packages/utils`, `packages/documents`, ERP/MES services/routes, EE integrations, jobs, notifications, Stripe, and JSON/custom-field UI code now use those helpers; `db:audit:declarative-schema` fails if any app/package reintroduces `Database`/`Json` imports from `@carbon/database` and currently reports zero compatibility consumers.
- Remaining PostgREST-shaped type/docs references have been removed from live examples and exported API docs: `examples/upload-3d-model` now imports the neutral `QueryError` type from the direct query client, `examples/upload-3d-model` and `examples/quote-configurator` no longer require stale `CARBON_API_KEY`/`CARBON_PUBLIC_KEY` settings for their monorepo direct-query path, and the old generated `packages/database/src/swagger-docs-schema.ts` artifact has been replaced by a compact Drizzle-derived `packages/database/src/api-docs-schema.ts`. The ERP docs route now presents schema metadata without `/rest/v1` snippets and hides internal Better Auth tables from the menu. A live source scan now only finds PostgREST/Supabase strings in the runtime-stack audit guard and this migration note.
- The base Drizzle migration lives at `packages/database/drizzle/0000_outgoing_the_fallen.sql`. It creates pgvector/pgcrypto, runtime roles, helper functions (`app_uid`, `app_api_key`, `app_companies_for_context`), tables, FKs, and a baseline tenant RLS policy for every table with `companyId`. `packages/database/scripts/audit-rls.mjs` verifies the generated Drizzle schema and migration SQL stay aligned for baseline RLS policies.
- Better Auth persistence is isolated from Carbon's legacy `user` and `account` tables through generated `authUser`, `authSession`, `authAccount`, and `authVerification` tables, added by `packages/database/drizzle/0001_supreme_amazoness.sql`. `pnpm --filter @carbon/database db:audit:auth-provider` verifies the Better Auth-only provider entrypoint, Better Auth Drizzle/Postgres adapter, generated `authSchema` mapping, auth package/lockfile dependency surface, bearer-token support, env defaults, and absence of legacy hosted-auth provider surfaces.
- ERP, MES, Academy, and Starter now expose Better Auth's API through app-owned `/api/auth/*` route splats that delegate to `betterAuthServer.handler(request)`. Browser OAuth login uses `startOAuthSignIn()` to post to Better Auth's social sign-in endpoint instead of a Supabase-style `carbonClient.auth.signInWithOAuth` client, and each `/callback` route now server-bridges the Better Auth request cookie into Carbon's encrypted session cookie through `signInWithRequest(...)`; there is no browser `onAuthStateChange`, hash-token, or `session?.refresh_token` bridge left in the live apps.
- Exported API docs no longer publish hosted-auth endpoints or SDK examples: the old `/auth/v1/*` snippets and `carbon.auth.*` helpers have been removed from `apps/erp/app/modules/api/ui/Snippets.tsx`. `db:audit:auth-provider` now guards this hosted-auth compatibility surface and the required Better Auth route-handler delegates.
- Stale planning/helper notes have been retargeted from deleted Supabase/Deno function paths to the greenfield Node route and direct Postgres layout. The direct Postgres pool helper is now Node-only and no longer carries a Deno runtime fallback. The broad vendor scan across live source, package/config files, scripts, examples, and `llm/` notes now reports no Supabase/PostgREST/hosted-auth/realtime/edge-function/Deno runtime terminology outside this migration note and audit scripts.
- `packages/database/drizzle/0002_modern_mysterio.sql` extends the baseline tenant RLS policy to `company` plus company-owned tables whose `id` is the tenant key (`companyAccountsPayableBillingAddress`, `companyAccountsReceivableBillingAddress`, `companyPlan`, `companySettings`, and `terms`).
- `packages/database/drizzle/0003_jittery_ravenous.sql` adds `app_company_groups_for_context()` and baseline tenant RLS for `companyGroup` plus tables scoped by `companyGroupId` (`account`, `currency`, `dimension`, `dimensionValue`, `exchangeRateHistory`, and `intercompanyTransaction`).
- `packages/database/drizzle/0004_soft_adam_warlock.sql` adds inherited parent-scope RLS for direct child tables whose parent already has tenant RLS, covering favorites, status histories, contact/location joins, quote/invoice/order auxiliary tables, and user-attribute values.
- `packages/database/drizzle/0005_nasty_agent_brand.sql` closes the baseline RLS gap for the remaining app tables: legacy `user` is gated through `userToCompany`, user-owned training/feedback/permission tables inherit through `userId`/`id`, global lookup/config tables are public read-only to `carbon_app`, and the generated search index table is RLS-enabled with no app policy so only service/owner paths can access it.
- `packages/database/scripts/rls-semantic-review.json` makes permission-policy app-layer decisions machine-checkable without reading the deleted vendor migration history. `pnpm --filter @carbon/database db:audit:rls:review` validates all 57 review entries, their four decision profiles, evidence paths, and 19 permission tuples. `pnpm --filter @carbon/database db:audit:rls:gates` parses cached and untracked app/package source to verify the manifest's 19 permission tuples have server `requirePermissions(...)` coverage, including the shared import route's `importPermissions` map; this caught and fixed the missing `create: "documents"` gate on `apps/erp/app/routes/x+/documents+/new.tsx`.
- Document read/write-group authorization is now enforced in the app layer where the legacy RLS manifest delegates it: `apps/erp/app/modules/documents/documents.service.ts` filters document list/detail reads by `readGroups` overlap and checks `writeGroups` before edit/delete/trash/restore. The authenticated principal set includes both `groups_for_user(userId)` and the user ID itself so personal documents created with `[userId]` groups remain accessible. Document routes and MCP document tools pass `userId` into these service checks, the document table UI uses the same user-plus-groups write set, and `/file/preview/private/*` denies private storage downloads when the key belongs to a document row the user cannot read.
- Customer/supplier invite claim generation now uses valid greenfield permission keys (`documents_update` and `production_view` instead of the stale legacy/typo keys), and `pnpm --filter @carbon/database db:audit:permissions` verifies static permission-claim keys against `apiKeyPermissionModules` so malformed external-account claims fail CI-style checks. `requirePermissions(...)` now resolves active customer/supplier account scope centrally and returns `customerId`/`supplierId` alongside the role, denying external-account sessions whose Better Auth claims do not have a matching active account row in the selected company. Customer/supplier detail, child, and risk routes now use shared `assertCustomerAccountScope(...)` / `assertSupplierAccountScope(...)` helpers to reject external users whose URL/form record does not match that scope; list routes filter external users to their scoped account row; single contact/location/process child lookups now include the parent customer/supplier ID where needed; and child mutation forms verify submitted contact, address, payment, shipping, tax, and process IDs against the scoped route before writing. Customer-facing production job reads now also verify `job.customerId` against the scoped customer account on reachable job detail/method/event/quantity loaders, and the production dashboard filters/suppresses customer-visible aggregate data. Supplier-facing item, item-cost, and supplier-part routes now force supplier list filters to the scoped supplier account, verify item access through `createdBy` or `supplierPart` rows, require supplierPart ownership for item cost access, and validate submitted supplierPart item/supplier IDs before writes. Protected search, Radan export, and outstanding-training API routes now use the request-scoped Better Auth database client instead of `carbon_service` for their company-scoped RPCs/document enrichment; Radan also requires `view: "production"` before exporting job operation data. The AI purchase-order tool now checks Better Auth `create:purchasing` claims before writing and uses the request-scoped client for purchase-order sequence allocation instead of `carbon_service`. Item method save/get/version activation/version creation and item revision routes now dispatch method copy/activation/revision work through the request-scoped parts client, including a company check before copying item revisions. Purchase-order dashboard/finalize/detail/status/delete routes now keep approval checks, approval cancellations, document writes, settings/email context, and MRP dispatch payload construction inside the authorized request client; purchase-order status writes also carry an optional company filter through the shared service helper and MCP tool. Quality document approval/detail/bulk-update routes, gauge create/detail routes, and inbound-inspection rejection-to-NCR routes now use request-scoped quality clients for approval checks, sequence allocation, NCR creation/linking, and company-filtered status updates instead of `carbon_service`. Quality issue create/close/bulk-update routes now use the request-scoped Better Auth client for sequence allocation, issue writes, closure disposition, and company-filtered bulk reads/writes instead of `carbon_service`. Stock-transfer and warehouse-transfer item-rule/status routes now evaluate rule preflights and status writes through the request-scoped inventory client with company filters instead of `carbon_service`; inventory adjustment, receipt posting, and shipment posting now do the same for item-rule preflight and adjacent pending/draft/document reads and writes while leaving the actual posting execution behind explicit function dispatch. Receipt/shipment creation routes no longer instantiate `carbon_service` before dispatching explicit greenfield `create` function payloads, and receipt/shipment line split/tracking routes now verify line/company scope and use request-scoped tracking writes/RPC calls. Quote new/convert/drag/duplicate/line-detail/configure routes now use request-scoped sales clients for quote/line/method/price/document reads and writes, with quote/line company checks and company-filtered direct model/material/item updates. Quote method save/get/material/operation routes now also use request-scoped sales clients for method-copy dispatch, material/operation mutations, company-filtered deletes, and quote price recalculation. Sales-order confirmation/detail/line detail/job/shipment/bulk-job routes now keep protected reads, PDF document writes, email context, job conversion, shipment creation preflight, and MRP dispatch on the Better Auth request client with company checks instead of using `carbon_service` as an auth translation layer. Sales-RFQ detail, line-detail, and convert-to-quote routes now likewise use request-scoped sales clients for RFQ/opportunity/document reads, company checks, conversion dispatch, and quote price seeding. Purchasing-RFQ detail, line-detail, and supplier-quote compare routes now use request-scoped purchasing clients for RFQ/line/supplier-link/document/comparison reads with company checks. Supplier-quote detail, line detail/new-line, and convert-to-order routes now use request-scoped purchasing clients for quote/line/price/supplier/settings/document reads, supplier approval checks, line writes, and conversion dispatch with company checks. Shipment packing-slip and job-traveler PDF routes now also use the request-scoped client instead of `carbon_service`, with explicit company filters on direct source-document/customer/item/method reads. `db:audit:rls:gates` verifies the central scope contract, list filters, per-route helper coverage for customer/supplier param routes, customer job-scope guards, supplier item/supplierPart app gates, these request-scoped protected RPC route boundaries, the AI write-tool permission boundary, the item method route boundary, the quote core and quote method route boundaries, the sales-order route boundary, the sales-RFQ route boundary, the purchasing-RFQ route boundary, the supplier-quote route boundary, the purchasing route boundary, the quality document route boundary, the quality issue route boundary, the inventory transfer, inventory creation, item-rule, line mutation, and inventory/invoicing route boundaries, and the file/PDF request-scoped client boundary.
- The shipment/traveler PDF file boundary now carries explicit `companyId` predicates through the shared read helpers as well: shipment, shipment-line, source-document, customer/supplier, item, method, operation, payment-term, and shipping-method reads all stay bound to the Better Auth request company before PDF rendering.
- The Radan integration export now has SQL-level company scoping in addition to the protected route boundary: `get_radan_v1(company_id, processes)` binds jobs, locations, sales-order context, operations, make methods, finished-good items, job materials, material items, and material taxonomy metadata to the requested Better Auth company. The material subquery now returns one top material per make method instead of applying a global export-wide `LIMIT 1`.
- Maintenance location RPCs now also bind joined metadata to the Better Auth request company: dispatch-by-location checks the requested location belongs to the company before returning rows and only enriches work-center names from the same company/location, while schedule-by-location scopes work-center and location joins to the same company/location. The RPC return declarations now match the underlying table types for JSON, text time fields, and numeric durations.
- Training assignment definer RPCs now explicitly translate Better Auth company membership before returning data: `get_training_assignment_status(p_company_id)` gates `carbon_app` with `app_companies_for_context()`, scopes `training` and `trainingCompletion` joins to the requested company, and returns the numeric completion key without a type mismatch; the summary RPC delegates to that scoped status function.
- Receipt tracking RPCs now require the Better Auth request company instead of trusting route-only checks: batch and serial tracking writes bind receipt, receipt-line, item, supplier, shelf-life, and tracked-entity updates to `p_company_id`, reject cross-company tracked entity IDs, and gate `carbon_app` through `app_companies_for_context()`. The ERP receipt tracking route forwards the request `companyId` into both RPC calls, so the service client is not acting as an auth translation layer for these mutations.
- The scheduled maintenance dispatch job still runs as privileged background work, but it now explicitly loads company rows for maintenance-enabled settings instead of relying on Supabase/PostgREST embedded selectors, skips inactive companies, and binds service-client child reads and writes to the active company being processed: schedules only dispatch after the work center is verified in-company, schedule items and work-center notification lookups include `companyId`, and the schedule advancement update carries the same company filter.
- The scheduled cleanup job still performs global service-client scans for expired commercial documents and out-of-calibration gauges, but it now filters candidate rows to active companies before notifications or mutations. Its follow-up writes carry company predicates derived from the active-company rows being changed: supplier quotes, purchasing RFQs, sales quotes, and gauge calibration status updates all add `companyId` filters before mutation.
- The audit event worker remains privileged event processing, but it now groups work by event `companyId`, skips inactive or audit-disabled companies, scopes indirect customer/supplier junction lookups and FK snapshots to that company, and inserts through the company-scoped audit-log batch RPC.
- The scheduled audit archive job still performs a global service-client scan for archive candidates, but it now scans only active audit-enabled companies, calls archive/delete RPCs with the company being archived, writes direct S3 archive objects under company-prefixed `audit-logs/` keys, cleans those objects up through the same company scope, and inserts `auditLogArchive` metadata with the archived `companyId`.
- The scheduled MRP job still runs as privileged background work, but it now derives each dispatch from `companyPlan` plus an explicit company lookup, skips inactive companies, and invokes the direct Postgres MRP function with `id` and `companyId` set to the same company being processed instead of translating request auth through `carbon_service`.
- The timecard auto-close job still performs a global service-client scan for companies with time clocks enabled, but it now explicitly loads matching company rows and skips inactive companies before row-level work. Each row-level step stays bound to the company being processed: open-entry and employee-job reads carry `companyId`, shift reads require the same company, and the final `timeCardEntry` update filters by both entry ID and `companyId`.
- Weekly cloud cleanup remains privileged system work, but destructive company deletes now derive candidates only from active company rows, skip the delete call entirely when no candidates exist, and bind the delete to active row-derived company IDs before dropping each deleted company's search index.
- Weekly training reminders now defensively preserve the company boundary before and after the service-client training status RPC: the job batches by `trainingAssignment.companyId`, filters that set to active companies, calls `get_training_assignment_status` with the active company being processed, filters returned rows back to that company, and only then emits `carbon/notify` events for the scoped employee assignment.
- Scheduled exchange-rate refresh remains privileged background work, but it now carries the resolved company group through both sides of the currency mutation: active integrations provide the company, the active company row provides `companyGroupId`, currency reads use that group, and writes update each currency by both currency ID and `companyGroupId` instead of issuing a service-client upsert over selected rows.
- The onboarding job still uses the service client for system-owned CRM/signup side effects, but it now verifies the event `userId` belongs to the event `companyId` through `userToCompany` before loading the user/company payload or writing CRM external IDs back to Carbon.
- The post-transaction job still dispatches privileged direct posting functions, but it now preflights the event by checking the company is active and the receipt, purchase invoice, or shipment row belongs to that `companyId` before invoking the direct Postgres posting function with the verified tenant key.
- The Paperless Parts job now carries the webhook company through its service-client side effects: quote/order customer default reads include `companyId`, existing sales-order status updates include the mapping company, quote external-link updates include `companyId`, quote/sales-order rollback deletes require both document ID and `companyId`, external mapping cleanup binds `companyId` before inserting replacement mappings, and CAD model reuse/upload side effects bind item plus sales-order-line reads/writes to the event company.
- The search-index event worker now threads the grouped event company into enrichment callbacks before privileged search-index RPC writes. Related customer, supplier, item, job, invoice, issue, gauge, and commercial-document enrichment reads all add `companyId` predicates instead of resolving display metadata from IDs alone.
- Stripe billing remains a signed-provider webhook/service-client boundary rather than a Better Auth request path, but the Carbon writes now carry concrete tenant keys: checkout tax ID updates bind to the checkout metadata company, subscription deletion resolves the Carbon `companyPlan` first and deletes by both company ID and Stripe customer ID, and Stripe company/customer cache fallbacks plus user-count updates stay keyed by company membership.
- Jira and Linear sync helpers still run as signed provider/background service-client work, but mapping cleanup now binds the company as well as entity type, action ID, and integration in both link and unlink paths. Employee-email matching and Slack task metadata lookup now use explicit direct-query reads instead of PostgREST relation selectors (`user(email)` / embedded required-action names), so provider helpers do not depend on Supabase relationship projection semantics. This prevents an external issue mapping delete for one tenant from removing another tenant's mapping that happens to share the same action ID/integration tuple; `db:audit:rls:gates` now guards both providers' service-client mapping deletes and the direct-query metadata shape.
- The replacement `/api/functions/embed` path now carries company scope through its internal token-protected payload. The embedding event worker includes `companyId` with each item/customer/supplier embedding job, and the service-client embedding route filters both the source read and embedding update by `job.companyId`.
- The OAuth token endpoint remains a client-secret authenticated public protocol route, but its service-client work now derives tenant scope from the authenticated `oauthClient` and binds authorization-code lookup/deletion plus refresh-token lookup/update to the client ID and company instead of mutating by code or token alone.
- Starter and Academy health endpoints remain public service-client reachability checks, but they now read only the `attributeDataType.id` probe column with `limit(1)` instead of selecting whole rows.
- Better Auth permission claims are now cached by both user and company in the shared auth package and the ERP user module, so `getUserClaims(userId, companyId)` cannot reuse permissions from a different org. Invite acceptance, new-company bootstrap, company switching, user deactivation, and async permission updates clear the company-scoped cache key plus the legacy user-only key, and `db:audit:rls:gates` now verifies this org-scoped cache contract.
- Carbon session refresh now revalidates the Better Auth user against current `userToCompany` membership before carrying a company forward. If the cookie's company is no longer valid, refresh falls back to the user's first current company, re-reads that company's group from Postgres, and only then mints the refreshed Carbon session; this keeps stale cookies from preserving removed org access.
- MES console-mode pin-in state is now signed with the auth session secret instead of stored as forgeable JSON. `requirePermissions(...)` verifies the signed pin payload and confirms the pinned user is still an active employee in the selected company before using it as the effective database user; MES middleware repeats the active-employee check before exposing `effectiveUserId` to route context.
- API-key authentication still translates the signed key to an API-key scoped direct database client only after expiration, rate-limit, plan, and scope checks, and its privileged bookkeeping is now bound to the resolved tenant: `lastUsedAt` updates require both API key ID and `companyId`. API-key edit/delete helpers and routes also carry `companyId` through the request/MCP context so mutations do not target by key ID alone; `db:audit:rls:gates` verifies these API-key org boundaries.
- ERP MCP tools no longer trust caller-supplied `companyGroupId` values for org-scoped accounting/settings operations. Existing schemas remain compatible, but tool handlers now pass `ctx.companyGroupId` from the authenticated MCP context into company-group reads, reporting RPCs, exchange-rate reads, subsidiary reads, and company creation. Consolidated-balance company selections are filtered against that authenticated group before any downstream reporting/translation RPC calls. `db:audit:rls:gates` fails if MCP tool code reintroduces `params.companyGroupId` or if consolidated balances forward unfiltered caller company IDs.
- Job method and job core routes now use request-scoped production clients for method copy/save-back, job creation/update/status/completion/recalculation, maintenance issue/unissue dispatch, and company-scoped job side effects. Approval-rule, shared import, audit-log archive, resource feedback/suggestion, user-admin route-layer, onboarding user profile, existing-company onboarding updates, and company list/delete routes now likewise use request-scoped clients. MES protected routes now use the request-scoped Better Auth client for submission/attribute actions, job/operation loaders, maintenance/inventory actions, production start/end/complete/finish flows, maintenance dispatch creation, operation detail reads, console PIN validation, and console-mode employee lookup. MES production operation helpers, routes, and SQL RPCs now also carry explicit `companyId`/`company_id` predicates through active-operation, employee active/recent operations, assigned operations, work-center operations, active counts, operation-detail, job, procedure, material, production-event, production-quantity, traceability-lineage, tracked-entity, work-center, failure-mode, finish/start-operation, operation-label, and job operation step-record paths. ERP production schedule board RPCs now require request `companyId` from the Better Auth route/MCP context instead of accepting location-only reads. ERP item detail and material-naming RPCs now require request `company_id` as well: part/tool/material/consumable detail helpers drop the legacy item-only signatures, filter item/detail/model/cost/supplier/taxonomy joins by company, and the item, sales quote-line, MCP, and Paperless Parts callers thread the Better Auth company scope into those RPCs. ERP related-record lookup RPCs now require request `company_id`, drop the legacy ID-only overloads, and scope opportunity/supplier-interaction parents plus RFQ, quote, sales-order, supplier-quote, purchase-order, purchase-invoice, and RFQ-link related rows by company. ERP item/job/quote method-tree RPCs now require request `company_id`, drop the legacy ID-only overloads, scope recursive material rows, item rows, item costs, make-method fallback, and external mappings by company, and company-partition `activeMakeMethods` so cross-company versions cannot win before a caller filter is applied. ERP inventory quantity RPCs now bind company/location through item tracking, job on-hand, and aggregate inventory quantity functions, including child supply/demand rows plus storage-unit, tracked-entity, model-upload, item-planning, and material taxonomy metadata joins. ERP planning RPCs now bind company/location through purchasing and production planning projections, including item replenishment, item planning, model-upload, supplier-part, demand, and supply joins. ERP accounting reporting RPCs now bind journal-line balances and trial-balance translation to the requested company group, including journal/company matching and source-company group validation. ERP intercompany RPCs now bind matching, common-parent discovery, balance reads, and elimination generation to the requested Better Auth company group; the MCP tools derive `companyGroupId` from the authenticated context, the service helper validates source/target companies and accounts inside that group, and `generateEliminationEntries` rejects spoofed `p_user_id` values when `app_uid()` is present. ERP storage-unit requirement RPCs now also carry company scope through child demand/supply and metadata joins: job material, stock-transfer line, purchase-order line, item, storage-unit, model-upload, and pick-method joins are explicitly bound to request company/location. `pnpm --filter @carbon/database db:smoke:mes-runtime` applies the full migration stack to a temporary `pgvector/pgvector:pg18-trixie` database and verifies the MES operation and traceability RPCs require company parameters and isolate cross-company rows at runtime. `pnpm --filter @carbon/database db:smoke:item-details` does the same for part/tool/material/consumable details and material naming, including item-cost, supplier-part, model-upload, and material taxonomy company-scope checks. `pnpm --filter @carbon/database db:smoke:related-record-lookups` covers opportunity and supplier-interaction related-record signatures and related row isolation across sales and purchasing documents. `pnpm --filter @carbon/database db:smoke:method-tree` covers item/job/quote method-tree signatures and recursive company isolation, including item-cost, active-method fallback, and external mapping company-scope checks. `pnpm --filter @carbon/database db:smoke:inventory-quantities` covers inventory quantity signatures and proves child supply/demand rows plus storage/tracked/model/planning/taxonomy metadata joins stay company-isolated. `pnpm --filter @carbon/database db:smoke:planning-rpcs` covers purchasing/production planning signatures and proves replenishment, planning, model, supplier, demand, and supply rows stay company-isolated. `pnpm --filter @carbon/database db:smoke:accounting-reporting` covers accounting report signatures and proves cross-group journal lines, mismatched journals, and cross-group translation company context stay isolated. `pnpm --filter @carbon/database db:smoke:intercompany` covers intercompany signatures and proves cross-group transactions, mismatched source lines, elimination line copies, and Better Auth user context stay isolated. `pnpm --filter @carbon/database db:smoke:storage-unit-requirements` covers storage-unit requirement signatures and proves child demand/supply rows plus item/storage/model/pick metadata joins stay company-isolated. New-company bootstrap remains an audited service-client exception because the company and membership do not exist yet; `db:audit:rls:gates` now fails if any other ERP or MES protected route reintroduces direct `carbon_service`.
- `packages/database/drizzle/0006_solid_runtime_helpers.sql` ports the first runtime RPC/helper slice for greenfield Postgres: claims/permission helpers rewritten to `app_uid()`/`app_api_key()`, group membership views and RPCs, sequence helpers, and API-key rate limiting.
- `packages/database/drizzle/0007_plain_audit_event_rpcs.sql` ports event subscription RPCs, per-company audit-log RPCs, custom-field unique values, dynamic tenant search-index RPCs, and training assignment summary/status RPCs. These definitions avoid Supabase auth/session APIs and generate dynamic IDs with `gen_random_uuid()` instead of the old `id()` helper.
- Local dev now defaults to plain Postgres 18 via `pgvector/pgvector:pg18-trixie` in both `docker-compose.yml` (`carbon-shared`) and `docker-compose.dev.yml` (per-worktree), plus MinIO, Inbucket, and Inngest. The Supabase local stack has been removed, PG18 volumes mount at `/var/lib/postgresql` so the image can use its versioned `PGDATA=/var/lib/postgresql/18/docker` layout, and MinIO dev ports are named `PORT_STORAGE`/`PORT_CONSOLE` instead of the legacy API/Studio port names. The per-worktree MinIO bucket initializer now receives the generated bucket names and fails if they are missing. On May 21, 2026, the shared `carbon-shared_postgres-data` and per-worktree `carbon-carbon_pgdata` volumes were wiped/recreated from the `pg18-trixie` compose definitions; both containers reported PostgreSQL 18.4 with pgvector 0.8.2, and `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` completed greenfield migrations and schema validation against the empty per-worktree database. The same dev entrypoint was rerun after the local Docker engine was restarted normally; it booted services, applied migrations, validated schema types, and both Carbon Postgres containers still reported PostgreSQL 18.4, pgvector 0.8.2, and 382 public tables. After the MES RPC scope changes, both `carbon-shared` and per-worktree `carbon-carbon` Postgres volumes were wiped/recreated again from the `pg18-trixie` compose definitions; `carbon-shared` was migrated explicitly, `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` completed on the clean per-worktree stack, both Postgres containers reported PostgreSQL 18.4, pgvector 0.8.2, and 382 public tables, and both exposed the company-scoped MES RPC signatures. After the inventory quantity RPC scope changes, `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` completed again, with migrations applied, schema types validated, and both Carbon Postgres containers still reporting PostgreSQL 18.4, pgvector 0.8.2, and 382 public tables. On May 22, 2026, the shared `carbon-shared_postgres-data` volume was reset again and migrated explicitly from `pgvector/pgvector:pg18-trixie`; the per-worktree `carbon-carbon` volumes were also wiped, and `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` completed against the empty stack with migrations applied and schema types validated. After the receipt-tracking RPC scope changes on May 22, 2026, the shared `carbon-shared_postgres-data` volume was reset/migrated again, the per-worktree `carbon-carbon` volumes were wiped again, and `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` completed from empty volumes with migrations applied and schema types validated. After the purchased-price RPC gate change on May 22, 2026, the shared `carbon-shared_postgres-data` volume and per-worktree `carbon-carbon` volumes were reset again; shared migrations and the per-worktree `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` run both completed from empty volumes, and both loaded `update_purchased_prices` with the Better Auth company gate. Both `carbon-postgres` and `carbon-carbon-postgres-1` report PostgreSQL 18.4, pgvector 0.8.2, 382 public information-schema tables, and the `pgvector/pgvector:pg18-trixie` image. `pnpm --filter @carbon/database db:audit:runtime-stack` verifies the compose images, generated `.env.local` settings, `.env.example`, scoped Postgres role init SQL, deploy workflow provider/S3 env, MinIO port naming, generated bucket env wiring, absence of legacy Supabase service images/names in live runtime config, and every `db:smoke:*` script's PG18/pgvector Docker migration path so a local `initdb`/fake-vector shim cannot return.
- Supabase-style browser realtime has been removed rather than shimmed: `packages/react` no longer exports `useRealtimeChannel`, the Carbon browser client no longer exposes `channel()`/`removeChannel()`/`realtime.setAuth()`, API docs no longer render `postgres_changes` subscription snippets, and ERP/MES screens that previously registered dead channel handlers now use `PollingDataProvider` plus `usePollingRevalidation`/direct query polling. `pnpm --filter @carbon/database db:audit:runtime-stack` now also scans app/package source for the deleted realtime client shape (`useRealtimeChannel`, `postgres_changes`, `carbon.channel(...)`, realtime auth-ready state, and removed realtime docs text).
- Database URLs are split by role: `DATABASE_MIGRATION_URL` for schema ownership, `DATABASE_URL` for `carbon_app`, and `DATABASE_SERVICE_URL`/`JOBS_DATABASE_URL` for `carbon_service`. `getCarbonServiceClient()` is the privileged system database client for `carbon_service`; it is not the Better Auth RBAC/org translation layer. Better Auth session, company/org scope, API-key scope, and permission checks resolve through `requirePermissions(...)` and user-scoped request clients first; request routes may use the service client only as a post-authorization implementation detail or for explicitly system-owned work. `requirePermissions(...)` only returns the service client for `bypassRls: true` employee-session paths after permission checks; API-key requests stay on the API-key-scoped client. The notification and send-email jobs now follow that same boundary: service-client notification description lookups receive the event `companyId`, every tenant document lookup adds a `companyId` predicate, relation metadata for work centers, jobs, trainings, and suggestion authors is loaded through explicit direct-query follow-up reads instead of Supabase/PostgREST embedded selectors, bulk/group recipients are filtered through `userToCompany` before Novu subscriber IDs are generated, and send-email checks the event company is active before loading the active email integration inside that company. The async and synchronous user-permission update helpers also verify the target user belongs to the request/event company before reading claims or writing `userPermission`; the user-admin resend/revoke invite flows now require the invite row to belong to the request/event company and still be pending (`acceptedAt`/`revokedAt` null) before rotating or revoking it; customer/supplier account invite helpers bind contact reads and user-link updates to the requested parent customer/supplier before issuing the invite; invite creation/list helpers also use that same pending-state definition, clearing both `acceptedAt` and `revokedAt` on a newly issued invite and listing only rows where both are null; shared user deactivation only infers roles from pending invite rows and only revokes pending invite rows in the resolved company; public invite acceptance loads pending invite rows, fetches active company display data through an explicit company lookup instead of a PostgREST relation selector, binds the final accept write to the resolved invite company, and rolls back customer/supplier account rows by account `id` plus `companyId`; the timecard auto-close background job skips inactive companies, then scopes shift reads and timecard writes to the company being processed before using its service client.
- ERP and MES protected routes that use `getCarbonServiceClient()` are now statically guarded by `db:audit:rls:gates`: after the route conversions, the only direct `x+` route service-client calls left are the two audited ERP company-bootstrap actions that create/seed a company before RLS membership exists. All other converted ERP and MES protected route work now uses the Better Auth request client returned by `requirePermissions(...)`, with company/org checks at the route layer where needed. The same audit verifies every request-scoped `bypassRls: true` call has a concrete `view`/`create`/`update`/`delete` permission tuple and carries `companyId` or `companyGroupId` from `requirePermissions(...)`, keeping privileged reads/writes behind the Better Auth org boundary. It also verifies `getCarbonServiceClient()` remains a thin `carbon_service` database wrapper rather than a Better Auth/RBAC/org translation layer, API-key requests stay on `getCarbonAPIKeyClient(...)`, and employee sessions receive the service client only for explicit post-permission `bypassRls`. Traceability graph/sidebar/expand reads and job batch-number writes now thread `companyId` into their direct Postgres helpers and SQL RPCs. Post-authorization API paths now have targeted tenant-scope checks: the Kanban route verifies the kanban company before job/method/MRP side effects, runs method association, MRP dispatch, and job status updates through the request-scoped Better Auth client, and filters the job status update by created job ID plus `companyId`, while the Onshape sync route verifies the make-method company and replaces item integration mappings through the request-scoped Better Auth client with a complete tenant row (`id`, timestamps, `createdBy`, and `companyId`).
- Public integration webhooks/interactions that need `carbon_service` now have explicit non-session auth boundaries: Jira and Linear integration installs preserve or generate `metadata.webhookSecret`, their setup instructions expose the webhook URL plus signing secret, and `apps/erp/app/routes/api+/webhook.{jira,linear}.$companyId.ts` now reads the raw request body, verifies a SHA-256 HMAC in `x-carbon-webhook-signature` with timing-safe comparison, and only then parses/dispatches tenant-scoped jobs. Slack interactive callbacks verify Slack's timestamp/signature with timing-safe comparison before the route looks up the workspace integration through the service client; Slack document sync now caches Carbon-to-Slack user IDs by company and verifies `userToCompany` before translating a user through a workspace token, with action/review task metadata reads bound to the event company. Xero keeps a distinct signed-webhook lookup by external tenant ID, while request/background accounting paths use the explicit company-scoped integration lookup instead of an OR helper that accepts either tenant or company identifiers. Stripe billing webhooks verify Stripe's signed raw body before service-client plan updates, and the billing helper scopes company-plan cleanup by both resolved company ID and Stripe customer ID. `db:audit:rls:gates` now verifies those service-client webhook/interactive handlers, HMAC helper contract, secret generation, Jira OAuth install metadata, setup URL rendering, Slack document user/task scope, Xero tenant-vs-company lookup separation, Stripe company-plan tenant scope, and timing-safe comparison contracts.
- Accounting backfill remains privileged background work after an authorized settings request, but the route now starts it only after `update: "settings"` and active Xero integration checks in the request company. The shared accounting integration lookup also fails closed on inactive integrations for both company-scoped background jobs and tenant-scoped Xero webhooks, and the backfill job carries `payload.companyId` through provider construction, mapping reads, and syncer writes instead of using `carbon_service` as an org translator.
- Public share routes that intentionally use `carbon_service` now have stronger tenant-scope guards for external-link flows: the SCAR route resolves the external link, binds the issue and supplier lookups to the link's company, rejects mismatched supplier form data, validates the task through the link-derived company/supplier/nonconformance set, and writes status/content updates through helper filters that include company, nonconformance, and supplier IDs. Sales and supplier digital-quote share/API routes now resolve the external link first, bind quote reads to the link's company/document/customer or supplier scope, validate submitted quote-line IDs against that scoped quote before privileged writes, and add company/link predicates to quote, opportunity, price, and external-link updates. Customer portal routes reject expired customer links, pass the link-derived `companyId` into the sales-order-line RPC, and bind public file downloads back to the link's company/customer before direct S3 reads. `db:audit:rls:gates` verifies these public-share service-client boundaries.
- CAD model file routes are no longer anonymous service-client readers: `/file/model/:id` authorizes either Better Auth company scope or the thumbnail-service token before returning model metadata, and `/file/model/public/*` applies the same check before direct S3 download. The model upload API now rejects model paths outside the request company's `models/` prefix and binds related item, RFQ-line, quote-line, sales-order-line, and job `modelUploadId` writes to the Better Auth request company. The model-thumbnail job now verifies the model upload belongs to the event company before using `THUMBNAIL_SERVICE_TOKEN` in the render URL so headless thumbnail generation can still load the model without opening tenant files publicly, and its `modelUpload` thumbnail-path write is scoped by the event `companyId`. `db:audit:rls:gates` now also scans every service-client route outside `x+` and requires a recognized auth boundary or an explicit public-flow allowlist; it verifies the model viewer, model object route, model upload API, shared token/session helper, and thumbnail task URL/write-scope contract.
- Accounting integration lookups now treat active-company status as part of the explicit service-client boundary: company-scoped lookups verify the requested company is active, tenant-scoped Xero webhook lookups derive the company from the active integration and then verify that company is active, and token-refresh writes remain company/provider-scoped instead of translating through Better Auth RBAC.
- Jira and Linear webhook jobs now repeat the active-company and active-integration checks after signature verification and queueing, then carry the webhook company through external-mapping lookups and nonconformance action updates. Their provider clients also only read or refresh active integration rows.
- Paperless Parts webhook handling now also rejects inactive integrations before signature-triggered enqueueing, and the worker repeats active-company plus active-integration checks before service-client quote/order synchronization.
- Slack document sync jobs now share an active Slack token helper that verifies the event company is active and the Slack integration is active before posting created/status/task/assignment updates.
- The legacy hosted-auth public-key config surface is gone from the greenfield schema: `config.anonKey` was removed from the base migration, generated Drizzle schema, seed path, Drizzle snapshots, and exported API docs. `db:audit:auth-provider` now fails if that `anonKey` config surface or the old `getCarbonServiceRole()` helper name returns.
- The old hosted REST-schema generator is removed: `scripts/generate-swagger-docs.ts`, the root `generate:swagger` script, and dev CLI post-migration swagger regeneration are gone because the greenfield stack no longer runs the hosted Studio REST metadata endpoint. `db:audit:runtime-stack` now guards against restoring that generator path.
- The Drizzle `withAuth` wrapper and the direct Postgres query adapter now set the same transaction-local RLS context keys that the SQL helpers read (`app.user_id` and `app.api_key_id`). `packages/database/scripts/audit-rls.mjs` guards that contract for both direct Drizzle and direct query-client paths.
- S3-backed storage, Better Auth, and the direct Postgres query layer are active. Storage keys are normalized in `packages/storage/src/path.ts`, private/public tenant uploads require a company-prefixed key, feedback uploads are constrained to the `feedback/` public namespace, and avatar uploads/removals are constrained to the active user's public `avatars/` namespace. Browser uploads now have app-owned signed-upload helpers in ERP and MES that call `/file/upload` and then PUT directly to the returned S3 URL; ERP browser removals go through `/file/remove` instead of the old storage facade. The broad ERP upload surface is now off `carbon.storage` for object bytes, including notes, document attachments, CSV imports, thumbnails, feedback/suggestion attachments, company logos, profile photos, quality-document editors, bill-of-process editors, and copy-to-parts document moves. Server-side PDF/document object writes in quote, purchase-order, sales-invoice, shipment, digital quote, shared sales-order generation, Paperless Parts integration routes, and the upload-3d-model example now call `@carbon/storage` directly; remaining server list/download/move/signing flows also use `listObjects`, `downloadObject`, `moveObject`, and `signDownload` directly. Public service workers now cache the direct `/avatars/` public namespace instead of legacy hosted storage URLs. The direct query client, browser Carbon client, and jobs query-client type no longer expose a Supabase-shaped `storage.from(...)` facade. `pnpm --filter @carbon/database db:audit:storage` verifies the path helper contract, signing/download/remove/list mapping helpers, query-client/browser-client/jobs-client storage facade removal, ERP/MES upload/remove and preview routes, document-backed private preview authorization, customer-share download scoping, browser upload/remove clients, service-worker avatar paths, guarded ERP direct-upload adopters, absence of storage-facade consumers in app/package/example source, that app/package/example code cannot import direct S3 primitives outside `packages/storage`, and that `@carbon/storage` retains a MinIO runtime smoke. `pnpm --filter @carbon/storage smoke:minio` runs an isolated `minio/minio:latest` container and verifies direct S3 signed private upload/download, server-side upload/list/move/remove, tenant path rejection, encoded traversal rejection, and public signed upload/remove behavior. The direct query adapter preserves legacy mutation return behavior where mutation calls return `data: null` unless callers chain `.select()`. It also supports common JSON path filters such as `attributes->>Job Make Method` and `metadata->credentials->>tenantId`.
- First-party source is off the temporary Kysely bridge. ERP invoice/purchasing/sales line-order helpers use the request-scoped direct query client; item inventory/supplier-price transactional helpers live in server-only Drizzle `withAuth` helpers; shared approval decisions and weekly period creation use Drizzle instead of `getDatabaseClient()`; `duplicatePriceOverrides` uses direct query reads plus a Drizzle-authenticated write transaction; and ERP quality NCR/inbound-inspection transactions now use direct Drizzle `withAuth` writes plus direct query reads. The old ERP `database.server.ts` singleton, package-level `@carbon/database/client` bridge, and first-party direct `kysely` dependencies have been removed. Jobs PGMQ polling uses direct `pg` through `@carbon/database/postgres`, jobs accounting entry points use the EE Drizzle database factory, and EE Xero accounting syncers use Drizzle transactions/direct SQL instead of Kysely transaction/query-builder types. `db:audit:declarative-schema` guards the removed ERP/package bridge surfaces so `@carbon/database/client`, `Kysely`, `getPostgresClient`, or `getDatabaseClient()` cannot be reintroduced in first-party app/package source.
- `apps/erp/app/routes/api+/functions.$name.ts` now provides the replacement `/api/functions/:name` dispatch route for the bounded embedding, production-accounting, document-conversion, sales-invoice posting, purchased-price, job-requirement recalculation, invoked create-task/create-outside-processing slices, receipt posting, shipment posting, stock-transfer posting, CSV imports, inventory issue, method/procedure copy, Onshape sync, MRP planning, production scheduling, and greenfield company-seeding slices: `embedding` generates an embedding through the AI SDK/OpenAI provider, `embed` batches company-scoped item/supplier/customer embedding refreshes through the service database client, `close-job`/`post-production-event` dispatch to SQL-owned Postgres RPCs, `convert` runs the currently invoked method activation and quote/order/invoice document conversions through direct Postgres, `get-method` runs item-to-item method copy, make-method-to-make-method copy, item-to-job/job-make-method expansion, item-to-quote-line/quote-make-method expansion, quote-line-to-job copy, quote-line-to-quote-line copy, job/quote method save-back, quote duplicate/revision copy, and procedure-to-job-operation sync through direct Postgres, `issue` runs non-tracked job-operation material issue, manual part-to-operation adjustment, tracked job-material issue/unconsume/scrap, tracked-entity revision conversion, tracked operation batch/serial completion, make-to-order job completion through the SQL completion RPC, maintenance dispatch inventory issue/unissue, and maintenance dispatch tracked-entity issue/unconsume/unissue paths through direct Postgres, `update-purchased-prices` dispatches to the purchased-price/lead-time SQL RPC, `post-receipt` posts purchase-order receipts, voids posted purchase-order receipts, and posts inbound-transfer receipts through direct Postgres, `post-shipment` posts and voids sales-order shipments through direct Postgres, `post-sales-invoice` posts and voids sales-order invoice quantity/status effects through direct Postgres, `post-purchase-invoice` posts and voids purchase-order invoice quantity/status effects through direct Postgres, `post-stock-transfer` runs the stock-transfer item-ledger and tracked-entity movement logic through direct Postgres, `recalculate` runs the Node/Postgres job material quantity cascade for `jobRequirements` and `jobMakeMethodRequirements`, `create` runs the currently invoked `nonConformanceTasks` and `purchaseOrderFromJob` payloads through direct Postgres, `import-csv` downloads tenant CSV files through direct S3 and imports through direct Postgres, `sync` runs the Onshape BOM/method sync through direct Postgres, `mrp` runs the time-phased planning regeneration through direct Postgres, `schedule` runs job operation dependency/date/work-center/priority scheduling through direct Postgres, and `seed-company` runs the Node/Postgres company seed service without recreating old storage bucket rows. The direct query client no longer exposes a Supabase-shaped `functions.invoke(...)` facade; server code calls the explicit `invokeFunction(...)` wrapper, and `db:audit:function-routes` verifies invoked names, token auth, and the company-scoped embed service-client contract.
- `pnpm --filter @carbon/database db:audit:function-routes` inventories literal `invokeFunction(...)` names against the Node dispatcher and verifies the service-function bearer-token contract. It currently finds 20 invoked names, 20 implemented route cases, zero dynamic dispatch sites, zero invoked names missing from `/api/functions/:name`, and zero legacy `.functions.invoke(...)` calls; it also checks that the dispatcher validates `CARBON_FUNCTIONS_TOKEN` before request parsing/dispatch, server-side invocation wrappers forward it as a Bearer header, and the removed `db:function:new` generator alias stays out of package manifests.
- The direct query adapter supports `.rpc(...)`, and `pnpm --filter @carbon/database db:audit:rpc` now audits multiline and same-line source RPC calls across cached and untracked worktree source files against generated migrations only. It currently detects 77 source-used RPCs and 110 functions created by generated migrations, with zero missing source-used RPCs. It also checks 102 literal `.rpc("name", { ... })` call sites against generated SQL function parameter names, with zero signature mismatches, and verifies every generated function explicitly declares `SECURITY INVOKER` or `SECURITY DEFINER` while all 34 `SECURITY DEFINER` functions pin `SET search_path = public`.
- `pnpm --filter @carbon/database db:audit:sql-portability` strips generated migration comments and verifies executable SQL stays portable: only `pgcrypto`, `pg_trgm`, and `vector` extensions are allowed, all 110 generated functions explicitly declare invoker/definer security with definer functions pinned to `public`, and generated SQL cannot reintroduce hosted-auth helpers, managed scheduler/storage/realtime/vault/network/http extension schemas, edge-runtime schemas, or hosted database vendor tokens.
- Generated migration RPC coverage now includes item detail, MES job/operation, traceability lineage, maintenance location, production schedule, operational helper, receipt tracking, related-record lookup, embedding search, Radan integration, inventory quantity, method tree, storage-unit requirement, accounting reporting, intercompany, planning, job completion/backflush, production function replacement RPCs, and the purchased-price update RPC. `0019_method_tree_rpcs.sql` also restores the generated view surface before SQL-language RPCs compile, including the company-partitioned `activeMakeMethods` view and the `itemStockQuantities` materialized view without the old Supabase `pg_cron` scheduling hook.
- `packages/database/drizzle/0027_tenant_scope_indexes.sql` adds deterministic direct-Postgres scope indexes for every generated table with `companyId`, `companyGroupId`, or `userId`. `pnpm --filter @carbon/database db:audit:schema` now verifies the migration set contains a dynamic scope-index migration and currently reports 261 tenant/principal scope index targets covered.
- `packages/database/drizzle/0028_item_stock_quantities_refresh.sql` replaces the old database-extension scheduler for `itemStockQuantities` with a portable `refresh_item_stock_quantities()` service function, and `packages/jobs/src/inngest/functions/scheduled/refresh-materialized-views.ts` calls it every 30 minutes through the service query client. `pnpm --filter @carbon/database db:audit:schema` now verifies the refresh function exists, is executable by `carbon_service`, and that every SQL migration file is present in Drizzle's migration journal so custom SQL cannot be skipped by `db:migrate`.
- The base migration has been smoke-tested as raw SQL, and the full migration stack has now been applied against clean local Docker databases on the intended `pgvector/pgvector:pg18-trixie` image. On 2026-05-21, `carbon-shared` was reset by removing `carbon-postgres` and `carbon-shared_postgres-data`, re-created on `pg18-trixie`, verified as PostgreSQL 18.4 with `vector` 0.8.2 available, and migrated successfully through `DATABASE_MIGRATION_URL=postgresql://carbon:carbon@localhost:5432/carbon pnpm --filter @carbon/database db:migrate`; it was reset/reinitialized again on 2026-05-21 after this checkpoint and re-verified with PostgreSQL 18.4, `vector` 0.8.2, `carbon_app`/`carbon_service` roles, and 382 public schema tables. The per-worktree `carbon-carbon` compose stack was also brought up from fresh `pgdata`/`minio`/`inngest` volumes on free local ports, migrated successfully through the same Drizzle stack, and verified with PG18.4, the `carbon_app` and `carbon_service` roles, 382 public schema tables, and generated MinIO buckets; `pnpm exec tsx packages/dev/src/main.ts up --no-portless --no-apps` was re-run after wiping those volumes and completed migrations plus schema validation. After the traceability RPC company-scope hardening, the full migration stack was re-smoked in a temporary clean `pg18-trixie` container and verified with PostgreSQL 18.4, `vector` 0.8.2, and the new `p_company_id` lineage RPC signatures. The embedding search RPCs also have repeatable `pg18-trixie`/pgvector smoke coverage through `pnpm --filter @carbon/database db:smoke:embedding-search`. This checkpoint treats deployment as greenfield fresh/clean database creation, not an in-place upgrade from an existing Supabase/Postgres data directory. Better Auth was also runtime-smoked earlier by creating and signing in a user against the migrated database, confirming auth rows land in the isolated `auth*` tables and not legacy `user`/`account`.
- The PG18 default path was re-verified again on 2026-05-21 after the greenfield reset request: `carbon-postgres` and `carbon-shared_postgres-data` were removed, `docker compose up -d postgres` recreated the shared database on `pgvector/pgvector:pg18-trixie`, `DATABASE_MIGRATION_URL=postgresql://carbon:carbon@localhost:5432/carbon pnpm --filter @carbon/database db:migrate` applied all 29 Drizzle migrations, and SQL verification reported PostgreSQL 18.4, `vector` 0.8.2, `carbon_app`/`carbon_service`, and 382 public relations. The per-worktree `carbon-carbon` stack was also wiped with `docker compose -f docker-compose.dev.yml -p carbon-carbon --env-file .env.local down -v`, Redis DB 0 was flushed, and `pnpm exec tsx packages/dev/src/main.ts up --no-portless --no-apps` completed from empty volumes with migrations, schema validation, PG18.4/vector verification, and generated MinIO buckets. On 2026-05-22, the same shared Postgres reset was repeated after the method-tree scope changes: `carbon-postgres` and `carbon-shared_postgres-data` were removed, `docker compose up -d postgres` recreated `carbon-postgres` on `pgvector/pgvector:pg18-trixie`, `db:migrate` applied all 29 Drizzle migrations, and SQL verification reported PostgreSQL 18.4, `vector` 0.8.2, `carbon_app`/`carbon_service`, 383 public relations, the company-scoped method-tree RPC signatures, and company-partitioned `activeMakeMethods`. The per-worktree `carbon-carbon` stack was also wiped again with `docker compose -f docker-compose.dev.yml -p carbon-carbon --env-file .env.local down -v`, Redis DB 0 was flushed, and `pnpm exec tsx packages/dev/src/main.ts up --no-portless --no-apps` completed from empty volumes with migrations and schema validation; SQL verification reported PG18.4, `vector` 0.8.2, 383 public relations, the company-scoped method-tree RPC signatures, and company-partitioned `activeMakeMethods`. `@carbon/dev` compose helpers now always pass `.env.local` to per-worktree Docker Compose calls when present so `crbn reset`, `crbn down`, `crbn status`, and log/inspection paths parse the greenfield compose file with the generated dynamic ports instead of blank environment values.
- On 2026-05-22, after the timecard auto-close service-client scope change, the shared `carbon-shared` Postgres state was reset again by removing `carbon-postgres` and `carbon-shared_postgres-data`, recreating `carbon-postgres` with `docker compose up -d postgres`, and applying the full Drizzle migration stack through `DATABASE_MIGRATION_URL=postgresql://carbon:carbon@localhost:5432/carbon pnpm --filter @carbon/database db:migrate`. The per-worktree greenfield stack was also wiped with `docker compose -f docker-compose.dev.yml -p carbon-carbon --env-file .env.local down -v`, then `pnpm exec tsx packages/dev/src/main.ts up --no-portless --no-apps` completed from empty volumes with migrations and schema validation. Both `carbon-postgres` and `carbon-carbon-postgres-1` were verified to run `pgvector/pgvector:pg18-trixie`; direct SQL reported PostgreSQL 18.4, `vector` 0.8.2, `carbon_app`/`carbon_service` roles, and 382 public information-schema tables in both clean databases.
- On 2026-05-22, after the scheduled audit-archive service-client scope change, the shared `carbon-shared` Postgres state was reset again by stopping/removing `carbon-postgres`, wiping `carbon-shared_postgres-data`, recreating `carbon-postgres` with `docker compose -f docker-compose.yml up -d --wait postgres`, and applying the full Drizzle migration stack through `DATABASE_MIGRATION_URL=postgresql://carbon:carbon@localhost:5432/carbon pnpm --filter @carbon/database db:migrate`. The per-worktree greenfield stack was wiped with `docker compose -f docker-compose.dev.yml -p carbon-carbon --env-file .env.local down -v`, then `pnpm tsx packages/dev/src/main.ts up --no-apps --no-portless` completed from empty volumes with migrations and schema validation. Both `carbon-postgres` and `carbon-carbon-postgres-1` were verified to run `pgvector/pgvector:pg18-trixie`; direct SQL reported PostgreSQL 18.4, `vector` 0.8.2, and 382 public information-schema tables in both clean databases, and `pnpm --filter @carbon/database db:audit:runtime-stack` passed after the reset.
- `complete_job_to_inventory`/`backflush_job_materials`, `post_production_event_to_gl`, `close_job_to_gl`, and `update_purchased_prices` have targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:job-completion` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: accounting-enabled completion creates the accounting period, journals, journal lines, and material/output cost ledger rows; cumulative completion calls (`5`, then `8`, then `8`) keep `quantityReceivedToInventory` cumulative while only writing the 3-unit output delta and 1.2-unit material delta; tracked batch and serial completions write real output ledger rows with tracked-entity status, storage-unit receipt, pick-method defaulting, and serial status updates; FIFO backflush consumes old/new cost layers in order, writes the expected consumption/output cost ledger rows, clears WIP, and updates finished-good average unit cost; the production-event and close-job ports create the expected GL journals, mark the event posted, and clear the WIP balance; incomplete, zero-cost, and machine-rate production-event edge cases return the expected JSON result and posting behavior; the purchased-price port creates a purchase-order cost ledger, updates item cost, creates supplier part pricing, updates item replenishment supplier metadata, permits an in-company `carbon_app` Better Auth context, and rejects out-of-company `carbon_app` calls with real pgvector column semantics.
- `seed-company` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:seed-company` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it creates the company group, user membership, high-order groups, admin employee type and permissions, employee row, company lookups, shared currencies/accounts, account defaults, fiscal-year settings, and merged user permissions without touching the removed Supabase storage bucket surface.
- `recalculate` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:recalculate` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies the Node/Postgres route service recalculates job material estimated quantities, scrap quantities, make-method quantity-per-parent values, and operation target/operation quantities for both full-job and make-method-subtree recalculation with real pgvector column semantics.
- `create` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:create` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies non-conformance task/reviewer materialization, workflow-content backfill, obsolete task cleanup, outside-processing purchase order creation, PO sequence allocation, and purchase-order line pricing/defaults with real pgvector column semantics.
- `sync` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:sync` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies Onshape sync creates/reuses draft make methods, copies active method operations/tools/parameters/steps into drafts, replaces method materials, creates new part/item rows, writes Onshape data mappings, and updates existing item mappings with real pgvector column semantics.
- `post-stock-transfer` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:post-stock-transfer` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies inventory pick/unpick, serial pick/unpick, expired-batch warning behavior, full batch pick/unpick, split batch pick/unpick, item-ledger entries, tracked activities, tracked entity status/quantity changes, and stock-transfer-line picked quantity updates with real pgvector column semantics.
- `mrp` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:mrp` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies weekly period creation, sales-order demand actuals, BOM-derived MRP demand forecasts, production-order supply actuals, and rerun replacement behavior with real pgvector column semantics.
- `import-csv` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:import-csv` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies customer import/re-import, tax identifier updates, CSV external mapping, and part item/type-specific row creation with real pgvector column semantics. The route path uses direct S3 for tenant CSV download; the row importer preserves the legacy `methodMaterial` not-implemented behavior.
- `schedule` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:schedule` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies operation dependency creation, initial job readiness, backward date scheduling, work-center assignment, priority calculation, conflict-free persistence with real pgvector column semantics, and company-scoped `get_jobs_by_date_range`/`get_unscheduled_jobs` reads that reject cross-company location IDs.
- `post-receipt` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:post-receipt` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies purchase-order receipt posting, purchase-order received quantity/status updates, item-ledger entries, purchase-order receipt voiding, item-ledger reversal, and PO quantity/status rollback with real pgvector column semantics.
- `post-shipment` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:post-shipment` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies sales-order shipment posting, sales-order sent quantity/status updates, item-ledger entries, sales-order shipment voiding, item-ledger reversal, and sent quantity/status rollback with real pgvector column semantics.
- `post-sales-invoice` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:post-sales-invoice` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies sales invoice posting, invoice posting date/status, sales-order invoiced quantity/status updates, sales invoice voiding, and invoiced quantity/status rollback with real pgvector column semantics.
- `post-purchase-invoice` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:post-purchase-invoice` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies purchase invoice posting, invoice posting date/status, purchase-order invoiced quantity/status updates, purchase invoice voiding, and invoiced quantity/status rollback with real pgvector column semantics.
- `convert` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:convert` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies method-version activation, previous-active method archival, dependent method-material rewiring, purchase-order-to-purchase-invoice conversion, and sales-order-to-sales-invoice conversion with real pgvector column semantics.
- `issue` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:issue` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies non-tracked job-operation material issue, manual part-to-operation material adjustment, tracked job-material issue with batch split, tracked job-material unconsume, tracked job-material scrap, tracked-entity revision conversion with cost/ledger updates, tracked operation batch completion, tracked operation serial completion and next-entity reservation, maintenance dispatch inventory issue, maintenance dispatch unissue, tracked maintenance dispatch issue with batch split, tracked maintenance unconsume, tracked maintenance unissue, and item-ledger reversal behavior with real pgvector column semantics. The `jobCompleteMakeToOrder` compatibility payload delegates to the same `complete_job_to_inventory` SQL function covered by `pnpm --filter @carbon/database db:smoke:job-completion`.
- `get-method` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:get-method` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it verifies item-to-item method copy, make-method-to-make-method copy, operation child row copying, material-to-operation relinking, item-to-job method expansion, job material estimated quantity creation, item-to-quote-line method expansion, quote-line-to-job copy, quote-line-to-quote-line copy, job-to-item save-back, job-make-method-to-item save-back, quote-line-to-item save-back, quote-make-method-to-item save-back, quote-to-quote duplicate, quote-to-quote revision, and procedure-to-job-operation step/parameter/work-instruction sync with real pgvector column semantics.
- `embedding-search` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:embedding-search` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack through the owner URL, verifies PostgreSQL 18 plus the installed pgvector extension, inserts real `vector` embeddings for item/supplier rows, and verifies vector-distance ordering, `LEAST(match_count, 10)` capping, and company filtering for `items_search` and `suppliers_search`.
- `refresh-materialized-views` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:refresh-materialized-views` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack from the journal, verifies `carbon_app` cannot execute `refresh_item_stock_quantities()`, verifies `carbon_service` can execute it, and verifies `itemStockQuantities` refresh behavior for normal, rejected, and null-location `itemLedger` rows.
- `mes-runtime` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:mes-runtime` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies the MES operation and traceability RPC signatures require request company parameters, rejects legacy unscoped overloads, and proves active-operation, employee active/recent operation, assigned operation, work-center operation, active-count, operation-detail, job operation step-record, descendant, and ancestor reads isolate cross-company rows.
- `item-details` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:item-details` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies part/tool/material/consumable detail and material-naming RPC signatures require request company parameters, rejects legacy unscoped overloads, and proves cross-company item detail, model-upload, item-cost, supplier-part, material taxonomy, and naming reads stay isolated.
- `related-record-lookups` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:related-record-lookups` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies opportunity and supplier-interaction related-record RPC signatures require request company parameters, rejects legacy unscoped overloads, and proves cross-company related RFQ, quote, sales-order, supplier-quote, purchase-order, purchase-invoice, and RFQ-link rows stay isolated.
- `method-tree` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:method-tree` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies item/job/quote method-tree RPC signatures require request company parameters, rejects legacy unscoped overloads, and proves recursive method rows, item-cost reads, active make-method fallback, and external integration mappings stay company-isolated.
- `inventory-quantities` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:inventory-quantities` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies item-tracking, job on-hand, and inventory quantity RPC signatures require request company/location parameters, and proves child supply/demand rows plus storage-unit, tracked-entity, model-upload, item-planning, and material taxonomy metadata joins stay company-isolated.
- `planning-rpcs` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:planning-rpcs` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies purchasing/production planning RPC signatures require request company/location parameters, and proves item-replenishment, item-planning, model-upload, supplier-part, demand, and supply rows stay company-isolated.
- `accounting-reporting` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:accounting-reporting` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies account-tree, trial-balance, and translation RPC signatures, and proves cross-group journal lines, journal/company mismatches, and cross-group translation company context stay isolated.
- `intercompany` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:intercompany` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies matching/common-parent/elimination/balance RPC signatures, and proves cross-group transaction matching, balance joins, mismatched source-line elimination, and Better Auth `app_uid()` user-context spoofing stay isolated.
- `maintenance-location` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:maintenance-location` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies dispatch/schedule-by-location RPC signatures and return types, proves location/work-center joins stay company-isolated under inconsistent cross-company fixtures, and verifies `carbon_app` only sees rows for the Better Auth user's company membership.
- `radan` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:radan` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies the Radan export signature, proves job/location/sales-order/operation/make-method/item/material joins stay company-isolated even under inconsistent cross-company fixtures, and verifies `carbon_app` only sees rows for the Better Auth user's company membership.
- `storage-unit-requirements` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:storage-unit-requirements` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies storage-unit requirement RPC signatures require request company parameters, and proves child demand/supply rows plus item, storage-unit, model-upload, and pick-method metadata joins stay company-isolated even under inconsistent cross-company fixture rows.
- `training-assignments` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:training-assignments` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies training status/summary RPC signatures, proves training and completion joins stay company-isolated under inconsistent cross-company fixtures, and verifies `carbon_app` rejects Better Auth users outside the requested company.
- `receipt-tracking` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:receipt-tracking` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, verifies batch/serial tracking and shelf-life helper signatures require request company parameters, proves receipt, line, item, shelf-life, and tracked-entity writes stay company-isolated under inconsistent cross-company fixtures, and verifies `carbon_app` rejects Better Auth users outside the requested company.
- `rls-context` has targeted runtime smoke coverage through `pnpm --filter @carbon/database db:smoke:rls-context` on a temporary Docker `pgvector/pgvector:pg18-trixie` database: it applies the full Drizzle migration stack, seeds minimal users/API keys/items, verifies `carbon_app` returns zero rows and rejects writes without `app.user_id` or `app.api_key_id`, verifies transaction-local user and API-key context isolate company rows, verifies context does not leak after commit, and verifies `carbon_service` bypass remains explicit and privileged.
- Focused verification currently passing in this workspace: `pnpm --filter @carbon/auth typecheck`, `pnpm --filter @carbon/database typecheck`, `pnpm --filter @carbon/dev typecheck`, `pnpm --filter @carbon/utils typecheck`, `pnpm --filter @carbon/documents typecheck`, `pnpm --filter @carbon/lib typecheck`, `pnpm --filter @carbon/notifications typecheck`, `pnpm --filter @carbon/ee typecheck`, `pnpm --filter @carbon/stripe typecheck`, `pnpm --filter erp typecheck`, `pnpm --filter mes typecheck`, `pnpm --filter academy typecheck`, `pnpm --filter starter typecheck`, `pnpm --filter @carbon/jobs typecheck`, `pnpm --filter upload-3d-model types`, `pnpm --filter quote-configurator types`, `pnpm --filter @carbon/database db:diff`, `pnpm --filter @carbon/database db:audit:vendor-removal`, `pnpm --filter @carbon/database db:audit:auth-provider`, `pnpm --filter @carbon/database db:audit:declarative-schema`, `pnpm --filter @carbon/database db:audit:runtime-stack`, `pnpm --filter @carbon/database db:audit:storage`, `pnpm --filter @carbon/database db:audit:rpc`, `pnpm --filter @carbon/database db:audit:sql-portability`, `pnpm --filter @carbon/database db:audit:function-routes`, `pnpm --filter @carbon/database db:audit:schema`, `pnpm --filter @carbon/database db:audit:rls`, `pnpm --filter @carbon/database db:audit:rls:open`, `pnpm --filter @carbon/database db:audit:rls:review`, `pnpm --filter @carbon/database db:audit:rls:gates`, `pnpm --filter @carbon/database db:audit:permissions`, `pnpm --filter @carbon/database db:types`, `pnpm --filter @carbon/database db:schema:generate`, `pnpm --filter @carbon/database db:smoke:job-completion`, `pnpm --filter @carbon/database db:smoke:seed-company`, `pnpm --filter @carbon/database db:smoke:recalculate`, `pnpm --filter @carbon/database db:smoke:create`, `pnpm --filter @carbon/database db:smoke:sync`, `pnpm --filter @carbon/database db:smoke:post-stock-transfer`, `pnpm --filter @carbon/database db:smoke:mrp`, `pnpm --filter @carbon/database db:smoke:import-csv`, `pnpm --filter @carbon/database db:smoke:schedule`, `pnpm --filter @carbon/database db:smoke:post-receipt`, `pnpm --filter @carbon/database db:smoke:post-shipment`, `pnpm --filter @carbon/database db:smoke:post-sales-invoice`, `pnpm --filter @carbon/database db:smoke:post-purchase-invoice`, `pnpm --filter @carbon/database db:smoke:convert`, `pnpm --filter @carbon/database db:smoke:issue`, `pnpm --filter @carbon/database db:smoke:get-method`, `pnpm --filter @carbon/database db:smoke:embedding-search`, `pnpm --filter @carbon/database db:smoke:refresh-materialized-views`, `pnpm --filter @carbon/database db:smoke:mes-runtime`, `pnpm --filter @carbon/database db:smoke:item-details`, `pnpm --filter @carbon/database db:smoke:related-record-lookups`, `pnpm --filter @carbon/database db:smoke:method-tree`, `pnpm --filter @carbon/database db:smoke:inventory-quantities`, `pnpm --filter @carbon/database db:smoke:planning-rpcs`, `pnpm --filter @carbon/database db:smoke:accounting-reporting`, `pnpm --filter @carbon/database db:smoke:intercompany`, `pnpm --filter @carbon/database db:smoke:storage-unit-requirements`, `pnpm --filter @carbon/database db:smoke:receipt-tracking`, `pnpm --filter @carbon/database db:smoke:rls-context`, targeted hosted-auth/vendor/edge-function no-match scans, targeted `git diff --check`, the clean PG18 Docker migration applies described above, and the targeted job completion/backflush/production-function/company-seed/runtime-recalculation/create-function/Onshape-sync/stock-transfer/MRP/import-csv/schedule/post-receipt/post-shipment/post-sales-invoice/post-purchase-invoice/convert/issue/get-method/embedding-search/refresh-materialized-views/MES-runtime/item-details/related-record-lookups/method-tree/inventory-quantities/planning-rpcs/accounting-reporting/intercompany/storage-unit-requirements/receipt-tracking/RLS-context smokes. Previously passing focused checks also include `pnpm --filter @carbon/storage typecheck`, storage path traversal smoke via `pnpm exec tsx`, and the clean Postgres migration/runtime Better Auth smoke through the available local database.
- Additional verification for the Radan, maintenance-location, training-assignment, receipt-tracking, purchased-price, scheduled maintenance-dispatch, scheduled cleanup, audit event worker, scheduled audit archive, scheduled MRP, timecard auto-close, weekly cloud cleanup, weekly training reminder, scheduled exchange-rate group scope, onboarding, onboarding route request scope, Paperless Parts, Jira/Linear mapping cleanup, Slack document user/task scope, Xero tenant-vs-company integration lookup split, accounting backfill, search-index enrichment, Stripe billing, OAuth token scope, function-route embedding scope, permission-cache org scope, session-refresh org scope, console pin-in org scope, MCP company-group context scope, consolidated-balance company selection scope, API-key org scope, notification service-client, user-admin pending-invite scope, customer/supplier account invite parent scope, invite helper pending-state scope, shared deactivation pending-invite scope, public invite acceptance scope, user-permission update, and CAD model upload/thumbnail slices currently passing in this workspace: `node --check packages/database/scripts/smoke-radan-integration.mjs`, `node --check packages/database/scripts/smoke-maintenance-location-rpcs.mjs`, `node --check packages/database/scripts/smoke-training-assignment-rpcs.mjs`, `node --check packages/database/scripts/smoke-receipt-tracking-rpcs.mjs`, `node --check packages/database/scripts/smoke-job-completion.mjs`, `node --check packages/database/scripts/audit-rls-app-gates.mjs`, `node --check packages/database/scripts/audit-function-routes.mjs`, `pnpm --filter @carbon/database db:smoke:radan`, `pnpm --filter @carbon/database db:smoke:maintenance-location`, `pnpm --filter @carbon/database db:smoke:training-assignments`, `pnpm --filter @carbon/database db:smoke:receipt-tracking`, `pnpm --filter @carbon/database db:smoke:job-completion`, `pnpm --filter @carbon/database db:audit:rls:gates`, `pnpm --filter @carbon/database db:audit:function-routes`, `pnpm --filter @carbon/database db:audit:runtime-stack`, `pnpm --filter @carbon/database db:audit:rpc`, `pnpm --filter @carbon/database db:audit:sql-portability`, `pnpm --filter @carbon/database db:audit:schema`, `pnpm --filter @carbon/database typecheck`, `pnpm --filter @carbon/auth typecheck`, `pnpm --filter @carbon/stripe typecheck`, `pnpm --filter @carbon/jobs typecheck`, and `pnpm --filter erp typecheck`.
- Direct S3 runtime verification currently passing in this workspace: `pnpm --filter @carbon/storage smoke:minio`.

Known gaps before this is complete:

- Runtime RPC discovery/coverage is now green. Inventory completion/backflush now has PG18 runtime smoke coverage for cumulative receipt/backflush accounting, tracked batch/serial receipt behavior, FIFO cost-layer depletion, and production-event edge cases. MES employee/assigned/work-center/count RPCs, ERP job operation step-record RPCs, ERP schedule board RPCs, ERP maintenance-location RPCs, ERP training-assignment RPCs, ERP receipt-tracking RPCs, ERP item detail/material-naming RPCs, ERP related-record lookup RPCs, ERP item/job/quote method-tree RPCs, ERP inventory quantity RPCs, ERP planning RPCs, ERP accounting reporting RPCs, ERP intercompany RPCs, ERP Radan integration RPCs, and ERP storage-unit requirement RPCs now have dedicated PG18 company-scope smoke coverage. The remaining RPC work is deeper semantic/domain review of the larger SQL bodies.
- The Node function replacement route now implements all 20 invoked legacy function names found by `db:audit:function-routes`, and the known `issue` payload variants now have direct Postgres behavior or a SQL-owned Postgres RPC delegate.
- Baseline RLS now has an audit guard covering all 287 generated app tables: 1,108 tenant/member policies, 9 public read-only policies, and 1 service-only table. This includes `companyId`, company-owned `id`, `companyGroupId`, inherited direct-parent scopes, legacy `user` membership scope, global lookup/config reads, and a closed app policy surface for the generated search index. The 57 permission/auth semantic review entries are locked in `packages/database/scripts/rls-semantic-review.json` as app-layer authorization decisions for Better Auth claims, API-key scopes, route permission gates, document app gates, customer/supplier account gates, and users-admin gates; `pnpm --filter @carbon/database db:audit:rls:review` validates 4 profiles, 57 review entries, 19 permission tuples, and all evidence paths without reading deleted vendor migration history. `pnpm --filter @carbon/database db:audit:rls:gates` verifies 19 manifest permission tuples against 52 server permission tuples found in app/package source, with zero dynamic permission calls skipped, and now also verifies `requirePermissions(...)` resolves active customer/supplier account scope for external-account roles, request-scoped `bypassRls: true` calls retain concrete permission and org bindings, customer/supplier list routes filter by that scope, every authenticated customer/supplier param route calls the shared scope helper, customer/supplier account route trees do not use `carbon_service`, customer/supplier contact creation plus contact/location API lookups apply that same external-account scope without `carbon_service`, supplier process API lookups filter supplier users to their scoped supplier account, customer/supplier payment, shipping, and tax routes reject mismatched form account IDs, supplier approval reads/writes stay on the request-scoped Better Auth client with company-filtered supplier status updates, the MCP API rejects external customer/supplier sessions before exposing broad dynamic tools, customer-visible production job loaders check `job.customerId`, supplier-visible item/itemCost/supplierPart routes enforce supplier account ownership, post-authorization Kanban side effects and Onshape mapping writes stay on the request-scoped Better Auth client, public SCAR share writes carry external-link-derived company/supplier/nonconformance scope, public digital-quote writes carry external-link-derived company/document/customer or supplier scope, public customer portal reads/downloads carry external-link-derived company/customer scope, Onshape OAuth saves credentials through the request-scoped Better Auth client, Jira/Linear/Slack/Xero/Paperless Parts webhooks verify provider or Carbon HMAC signatures before service-client work, accounting backfill starts only after request-company settings/integration checks and carries `payload.companyId` through provider/mapping/syncer work, protected search/Radan/training RPC routes use request-scoped Better Auth clients instead of `carbon_service` where SQL functions already bind company context, the MRP API route requires inventory update permission and validates requested locations against the Better Auth company scope before dispatch, the AI purchase-order write tool checks Better Auth `create:purchasing` claims before sequence allocation or writes, item method/revision routes use request-scoped clients with company-scoped revision checks, quote core and method routes use request-scoped clients with company-scoped quote/line/method/pricing/model/material/operation side effects, sales-order confirmation/detail/line/job/shipment routes use request-scoped clients with company-scoped document/status/job/shipment side effects, sales-RFQ detail/line/convert routes use request-scoped clients with company-scoped document/conversion/quote-pricing side effects, purchasing-RFQ detail/line/compare routes use request-scoped clients with company-scoped supplier-link/document/comparison reads, supplier-quote detail/line/new/convert routes use request-scoped clients with company-scoped supplier/settings/document/line/conversion side effects, purchase-order dashboard/finalize/detail/status/delete routes use request-scoped clients with company-scoped approval/status/document side effects, quality document/gauge/inbound-inspection rejection routes use request-scoped clients with company-scoped approval/status/NCR side effects, quality issue create/close/bulk-update routes use request-scoped clients with company-scoped reads/writes, stock-transfer/warehouse-transfer/inventory-adjustment/receipt/shipment item-rule flows and receipt/shipment line split/tracking flows use request-scoped clients with company-scoped reads/writes, receipt/shipment detail loaders/actions plus sales/purchase invoice creation/post/void routes use request-scoped clients with company-scoped status transitions and direct S3/document writes, shipment/traveler PDF routes stay on request-scoped clients with company-scoped direct reads, ERP/MES protected route trees reject direct `carbon_service` usage outside the audited new-company bootstrap boundary, MES production/console routes retain explicit request-company scope on the direct production helper paths, scheduled maintenance dispatch jobs scope work-center, schedule-item, notification-group, and schedule-update service-client work to the job company, scheduled cleanup jobs filter candidate rows to active companies before scoping status updates to row-derived company sets, scheduled audit archives scan active audit-enabled companies and archive/delete through company-scoped RPCs plus company-keyed S3 objects, scheduled MRP jobs skip inactive companies and dispatch direct MRP work with the companyPlan/company-derived company ID, timecard auto-close jobs scope shift reads and timecard writes to the company being processed, notification jobs scope service-client description reads plus bulk recipients to the event company, and async user-permission updates verify target user membership before service-client-backed permission writes. Runtime `carbon_app` fail-closed behavior, transaction-local user/API-key context, and `carbon_service` bypass behavior are covered by `db:smoke:rls-context`. Document module read/write-group behavior is now enforced by service-layer checks on list/detail/favorite/label/write paths plus document-backed private preview downloads, and static customer/supplier claim keys are guarded by `db:audit:permissions`. Remaining RLS work is deeper route/runtime verification for ownership-specific decisions beyond the currently audited document, customer/supplier account, production job, supplier item/supplierPart, request-scoped bypass, protected search/Radan/training RPCs, MRP API dispatch, AI purchase-order tool permissioning, item method/revision, sales order/RFQ, purchasing RFQ/supplier quote, purchasing/quality document/quality issue route flows, inventory item-rule/line mutation/invoicing route flows, and deeper runtime/domain invariants for the audited route flows, plus any narrower SQL ports discovered during that review. `pnpm --filter @carbon/database db:audit:rls:open` currently reports only the isolated Better Auth tables (`authAccount`, `authSession`, `authUser`, `authVerification`) as open non-baseline-RLS tables.
- The same RLS app-gate audit now also checks the weekly training reminder job's service-client tenant boundary: work batches are derived from `trainingAssignment.companyId`, the status RPC receives the company being processed, returned rows are filtered back to that company, and notification events use the scoped assignment company and employee.
- Generated table/column/view/enum parity now has an audit guard covering 287 generated schema tables, 3,612 generated app table columns, 4 Better Auth tables with 39 auth columns, 92 generated views, 92 migration views, 1,969 view columns, 121 enum types, and all 29 SQL migration journal entries. The generated migrations currently include 110 functions, 1 materialized view, 12 explicit/dynamic index statements, 1,254 foreign keys, 5 reviewed unique constraints, 2 reviewed static indexes, and zero generated triggers/table-column defaults; `db:audit:schema` now fails if unreviewed unique constraints, static indexes, triggers, generated table defaults, expected dynamic audit-log indexes, expected dynamic search indexes, or SQL migration files not listed in Drizzle's migration journal change. Tenant/principal scope index coverage is also guarded for 261 table/column targets, and `itemStockQuantities` refresh coverage is guarded through the service-callable refresh function plus `db:smoke:refresh-materialized-views`. `db:audit:rpc` guards generated SQL function signatures and security-mode declarations, and `db:audit:sql-portability` guards portable extension usage plus provider-specific SQL helpers, hosted auth JWT settings, hosted anon/authenticated/service-role grants, managed scheduler, realtime, storage, network, HTTP, vault, provider extension, and edge-runtime schemas. Remaining schema work is deeper stored-function behavior review against authoritative SQL.
- App/package `Database`/`Json` compatibility imports have been eliminated, and the package root no longer exports those legacy compatibility types. The legacy generated `packages/database/src/types.ts` file, `packages/database/src/compat.ts` facade, `packages/database/src/client.ts` Kysely bridge, and `packages/database/scripts/generate-drizzle-schema.mjs` generator have been removed. Database source now uses Drizzle schema helpers, the direct query client, and the plain `@carbon/database/postgres` pool helper; `db:audit:declarative-schema` fails if the legacy files return, if app/package code imports `Database`/`Json` from `@carbon/database`, if source imports `@carbon/database/types`, `./types.ts`, or `./compat.ts`, if `@carbon/database/client` or first-party Kysely query-builder usage returns, or if the removed ERP bridge surfaces return. `db:types` and `db:schema:generate` are now validation aliases for `db:audit:declarative-schema` rather than generators from a Supabase-shaped type surface. First-party source and package manifests now have zero direct Kysely usage; lockfile Kysely entries that remain are transitive dependency peer/optional edges.
- Legacy data cut-over/backfill from an existing Supabase deployment is out of scope for this greenfield checkpoint.

---

## 1. Principles

1. **Provider-agnostic by default.** The application depends on standard protocols (Postgres wire, S3 API, Redis protocol, SMTP), not vendor SDKs. Any compliant provider slots in via environment variables.
2. **Rapid setup.** New-developer onboarding is `docker compose up`. Production deploy is "build once, run anywhere that accepts a container."
3. **Simplicity on the path.** Reject infrastructure components unless there is a hard requirement the simpler path cannot meet. No realtime server, no message broker, no custom pooler.
4. **Postgres is the single source of truth.** Data, jobs, sessions (via Better Auth), and RLS policies all live in one database.
5. **Defense in depth for multi-tenancy.** RLS in Postgres plus application-layer `companyId` validation. A single bug must not leak tenants.
6. **Self-hosted auth first.** Better Auth is the target provider for this greenfield checkpoint, with users and sessions stored in Postgres. Hosted SSO can be added later behind the same interface, but it is not part of the zero-external-auth target.

---

## 2. Portability contract

The app code depends on six standard interfaces:

| Dependency | Protocol / API | Works with |
|------------|----------------|------------|
| Postgres | Postgres 18 wire protocol + pgvector | Neon, Supabase Postgres, Railway, Render, RDS, Aurora, Fly.io, Crunchy, self-hosted, local Docker |
| Object storage | S3 API | AWS S3, Cloudflare R2, Backblaze B2, Tigris, MinIO, Wasabi, DO Spaces |
| Cache | Redis protocol | Redis, Valkey, Upstash TCP, DragonflyDB, ElastiCache, Railway/Fly Redis |
| Email | SMTP + transactional API | Resend, Postmark, SES, SendGrid, Mailpit (dev) |
| LLM | Chat completion API (OpenAI-shaped) | OpenAI, Anthropic, Bedrock, Vercel AI Gateway, OpenRouter, Ollama |
| Host | Docker container on port 3000 | Fly, Railway, Render, ECS, Cloud Run, K8s, bare VM |

Switching providers is an environment-variable change. No code change is required.

---

## 3. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React Router + TanStack Query)                     │
│  • Polling for "realtime" — no websocket client             │
│  • Optimistic mutations via useMutation                     │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS
                ▼
┌─────────────────────────────────────────────────────────────┐
│  App container (Node + React Router SSR)                    │
│  • Route handlers call withAuth(db, ctx, fn) for all DB ops │
│  • Better Auth adapter                                      │
│  • Presigned S3 URL generation                              │
│  • pg-boss job producer/consumer                            │
└──────┬────────────┬─────────────┬─────────────┬─────────────┘
       │            │             │             │
       ▼            ▼             ▼             ▼
  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
  │Postgres │  │ Redis   │  │ S3       │  │ Email    │
  │ + RLS   │  │ (cache, │  │ private  │  │ provider │
  │ + pg-   │  │  rate-  │  │ + public │  │ (SMTP)   │
  │   boss  │  │  limit) │  │ buckets  │  │          │
  └─────────┘  └─────────┘  └──────────┘  └──────────┘
```

No realtime server. No message broker. No auth service container. No edge function runtime. Three external dependencies total (Postgres, Redis, S3) plus email.

---

## 4. Package structure

```
packages/
├── db/             drizzle schema + pg Pool + withAuth wrapper
├── auth/           provider interface + Better Auth adapter + session/cookie layer
├── storage/        S3 client + signUpload/signDownload + CloudFront URL helpers
├── cache/          ioredis client + typed key factories
├── email/          provider interface + Resend/Postmark/SES adapters
├── jobs/           pg-boss wrapper + job definitions
├── ai/             Vercel AI SDK client with provider flag
├── kv/             [exists] rate limiting primitives on Redis
├── react/          shared UI + hooks
└── ui/             design system
apps/
├── erp/            React Router app — ERP
├── mes/            React Router app — MES (includes console PIN mode)
├── academy/        React Router app — training
└── starter/        React Router app — public marketing
```

Each package exports only through `index.ts`. App code never imports a vendor SDK directly — always the package.

---

## 5. Authentication

### 5.1 Provider abstraction

Auth currently targets Better Auth only:

```bash
AUTH_PROVIDER=better_auth    # self-hosted, users stored in Postgres
```

Every call in the app goes through the `AuthProvider` interface, never the underlying SDK. The interface leaves room for a future hosted SSO adapter, but this migration target has no hosted auth dependency.

**`packages/auth/src/provider/types.ts`**

```ts
export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  metadata?: Record<string, unknown>;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

export interface AuthProvider {
  // ─── Admin (service-scoped) ──────────────────────────────
  createUser(args: {
    email: string;
    password?: string;          // random if omitted
    emailVerified?: boolean;    // default true for invites
    id?: string;                // predetermined ID (console operator promotion)
    metadata?: Record<string, unknown>;
  }): Promise<{ userId: string }>;

  deleteUser(userId: string): Promise<void>;
  getUserById(userId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  adminSetPassword(userId: string, password: string): Promise<void>;

  // ─── Sessions ────────────────────────────────────────────
  signInWithPassword(args: {
    email: string;
    password: string;
  }): Promise<Session>;

  sendMagicLink(args: {
    email: string;
    redirectTo: string;
  }): Promise<void>;

  generateMagicLink(args: {              // invite flow — no email sent
    email: string;
    redirectTo: string;
  }): Promise<{ url: string }>;

  verifyMagicLinkToken(token: string): Promise<Session>;
  refreshSession(refreshToken: string): Promise<Session>;
  getSessionByAccessToken(accessToken: string): Promise<Session | null>;
  getSessionFromRequest(request: Request): Promise<Session | null>;
  revokeSession(accessToken: string): Promise<void>;

  // ─── Self-service ────────────────────────────────────────
  updatePassword(args: {
    accessToken: string;
    newPassword: string;
  }): Promise<void>;
}
```

**`packages/auth/src/provider/index.ts`**

```ts
import { AUTH_PROVIDER } from "../config/env";
import { betterAuthServer, BetterAuthProvider } from "./better-auth";
import type { AuthProvider } from "./types";

if (AUTH_PROVIDER !== "better_auth") {
  throw new Error(`Unsupported AUTH_PROVIDER: ${AUTH_PROVIDER}`);
}

export const authProvider: AuthProvider = new BetterAuthProvider();
export { betterAuthServer };
export type { AuthProvider, Session, User } from "./types";
```

### 5.2 Better Auth adapter

Runs inside the Node process. Users stored in the same Postgres database as the rest of the app.

**`packages/auth/src/provider/better-auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, apiKey, bearer } from "better-auth/plugins";
import { dbService } from "@carbon/database/drizzle";
import { authSchema } from "@carbon/database/schema";
import type { AuthProvider, Session, User } from "./types";

const auth = betterAuth({
  database: drizzleAdapter(dbService, {
    provider: "pg",
    schema: authSchema,
  }),
  user: { modelName: "authUser" },
  session: { modelName: "authSession" },
  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.ERP_URL!,
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    microsoft: {
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
  },
  plugins: [magicLink(/* ... */), apiKey(), bearer()],
});

export const betterAuthServer = auth;

export class BetterAuthProvider implements AuthProvider {
  async createUser(args) {
    const password = args.password ?? crypto.randomUUID();
    const user = await auth.api.signUpEmail({
      body: { email: args.email, password, name: args.email },
    });
    return { userId: user.user.id };
  }
  // ... rest of methods map to auth.api.* calls
}
```

### 5.3 Hosted SSO adapter (future)

Enterprise SSO can be added later behind the same `AuthProvider` interface. It is deliberately excluded from this checkpoint so local development and production can run without any external auth service.

### 5.4 Session storage and cookie layer (provider-agnostic)

Cookie management is independent of Better Auth internals. The provider returns the shared `Session` shape; the cookie layer owns encrypted HTTP-only cookies.

```ts
// packages/auth/src/session.server.ts
// Cookie: name="carbon", httpOnly, secure, sameSite=lax, 7-day maxAge
// Encrypted with SESSION_SECRET.
// Contains: { accessToken, refreshToken, userId, companyId, email, expiresAt }
```

Token refresh runs on the server:
- On each GET request, if `expiresAt` is within 10 minutes, call `authProvider.refreshSession(refreshToken)` and rewrite the cookie via a 302 redirect.
- On non-GET, refresh in memory without redirect.

### 5.5 API keys (unchanged, provider-independent)

API keys are never issued by Better Auth. Custom implementation:
- Generated with `crbn_` prefix + nanoid.
- SHA-256 hashed on store; only `keyHash` + last-5 preview persisted.
- `apiKey` header lookup happens in our `requirePermissions()`, not in the auth provider.

### 5.6 Console operators (MES PIN flow)

Console operators have no auth-provider user (they never log in with email). They authenticate via 4-digit PIN stored on `employee.pin`. The PIN cookie (`console-pin-{companyId}`) is checked inside `getEffectiveUser()`, which resolves to the employee's `userId` for RLS purposes.

When a console operator is promoted to a real employee (`convertConsoleOperatorToEmployee`), the adapter's `createUser({ id: existingUserId, ... })` is used — the `id` parameter is why both adapters must support predetermined IDs.

---

## 6. Authorization (RLS)

### 6.1 Two Postgres roles

```sql
-- Normal app connections. RLS always applies.
CREATE ROLE carbon_app LOGIN PASSWORD :'app_password';
GRANT USAGE ON SCHEMA public TO carbon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carbon_app;

-- Privileged ops (user bootstrap, cross-tenant admin). Bypasses RLS.
CREATE ROLE carbon_service LOGIN PASSWORD :'service_password' BYPASSRLS;
GRANT USAGE ON SCHEMA public TO carbon_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carbon_service;
```

Two connection pools in the app — `db` (carbon_app role) and `dbService` (carbon_service role). `bypassRls: true` paths use `dbService`; every other code path uses `db`. Request authorization is still driven by Better Auth session/company/org context and `requirePermissions(...)`; `dbService` is only for system work or narrowly scoped post-authorization operations.

### 6.2 Context helpers

No `auth.uid()` anywhere. Context is carried via `current_setting`:

```sql
CREATE FUNCTION app_uid() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT current_setting('app.current_user_id', true)
$$;

CREATE FUNCTION app_api_key() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT current_setting('app.api_key', true)
$$;

CREATE FUNCTION app_companies_with_permission(permission text) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  api_company text;
  result text[];
BEGIN
  IF app_api_key() <> '' THEN
    SELECT "companyId" INTO api_company FROM "apiKey"
    WHERE "keyHash" = encode(digest(app_api_key()::bytea, 'sha256'), 'hex');
    RETURN COALESCE(ARRAY[api_company], ARRAY[]::text[]);
  END IF;

  SELECT array_agg(DISTINCT utc."companyId") INTO result
  FROM "userToCompany" utc
  JOIN "userPermission" up ON up.id = utc."userId"
  WHERE utc."userId" = app_uid()
    AND utc."role" = 'employee'
    AND ((up.permissions->permission) ? utc."companyId"
         OR (up.permissions->permission) ? '0');

  RETURN COALESCE(result, ARRAY[]::text[]);
END;
$$;

-- Variants: app_companies_with_employee_role(), app_companies_with_any_role(),
-- app_customer_ids_with_permission(permission), app_supplier_ids_with_permission(permission),
-- groups_for_user(uid text).
```

### 6.3 `withAuth` transaction wrapper (mandatory)

Every database call in the app goes through this. No exceptions. Types prevent bypassing it.

```ts
// packages/db/src/with-auth.ts
import { sql } from "drizzle-orm";
import { db, dbService } from "./client";

type AuthContext =
  | { kind: "user"; userId: string }
  | { kind: "apiKey"; apiKey: string }
  | { kind: "service" };

export async function withAuth<T>(
  ctx: AuthContext,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  // Service path uses a separate BYPASSRLS pool — no transaction needed.
  if (ctx.kind === "service") {
    return fn(dbService as unknown as typeof db);
  }
  return db.transaction(async (tx) => {
    if (ctx.kind === "user") {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`
      );
    } else {
      await tx.execute(
        sql`SELECT set_config('app.api_key', ${ctx.apiKey}, true)`
      );
    }
    return fn(tx);
  });
}
```

**Critical:** `set_config(..., true)` scopes to the transaction. `SET LOCAL` in other words. Any value of `false` (or `pool.on('connect')` patterns) leak across tenants in transaction-mode pools. Reviewers should block any PR that sets a session-level variable.

### 6.4 Drizzle schema with inline RLS policies

Policies live with the schema — co-located, version-controlled, greppable.

```ts
// packages/db/src/schema/job.ts
import { pgTable, text, timestamp, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const job = pgTable("job", {
  id: text("id").primaryKey(),
  companyId: text("companyId").notNull(),
  jobId: text("jobId").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => [
  pgPolicy("job_select", {
    as: "permissive", for: "select", to: "carbon_app",
    using: sql`${t.companyId} = ANY((SELECT app_companies_with_permission('production_view')))`,
  }),
  pgPolicy("job_insert", {
    as: "permissive", for: "insert", to: "carbon_app",
    withCheck: sql`${t.companyId} = ANY((SELECT app_companies_with_permission('production_create')))`,
  }),
  pgPolicy("job_update", {
    as: "permissive", for: "update", to: "carbon_app",
    using: sql`${t.companyId} = ANY((SELECT app_companies_with_permission('production_update')))`,
    withCheck: sql`${t.companyId} = ANY((SELECT app_companies_with_permission('production_update')))`,
  }),
  pgPolicy("job_delete", {
    as: "permissive", for: "delete", to: "carbon_app",
    using: sql`${t.companyId} = ANY((SELECT app_companies_with_permission('production_delete')))`,
  }),
]).enableRLS();
```

The `(SELECT app_companies_with_permission(...))` subquery wrapper preserves the initPlan optimization — the function is evaluated once per statement, not per row.

### 6.5 Defense in depth: app-layer filter

A Drizzle middleware or query helper automatically appends `"companyId" IN (...allowedCompanies)` to every read. RLS is the authoritative gate; the app-layer filter is a second layer. A single bug in either cannot leak data on its own.

### 6.6 Testing

- **Policy text snapshot.** Commit `pg_dump --schema-only` of policies as a fixture. Diff in CI.
- **Per-user regression suite.** Table of `(userId, table, expected_row_count)` for ~40 canonical users (admin, multi-company employee, customer portal, supplier portal, API key holder, console operator). Each test wraps `withAuth(ctx, fn)` and asserts result counts.
- **Leakage fuzzer.** Single pool with `max=3`, 50 concurrent queries from 10 synthetic users, assert zero cross-tenant rows.
- **Missing-wrapper test.** A query run outside `withAuth` must return 0 rows (fail-closed). Assert in CI.
- **`EXPLAIN ANALYZE` on hot queries.** Verify `InitPlan 1 (returns $0)` fires — preserves the per-statement caching of helper function results.

---

## 7. Storage

### 7.1 Bucket layout

```
carbon-private-{stage}       Private. Served via CDN with signed URLs.
  {companyId}/job/{jobId}/...
  {companyId}/parts/{itemId}/...
  {companyId}/quality/...
  {companyId}/avatar/{userId}.png
  {companyId}/feedback/{id}.png

carbon-public-{stage}        Public-read. Marketing/system assets only.
  system/logo.svg
  marketing/...
```

Two buckets total. CompanyId prefix is the tenant boundary.

### 7.2 S3 client (provider-agnostic)

```ts
// packages/storage/src/client.ts
import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,            // set for R2/MinIO/B2
  forcePathStyle: !!process.env.S3_ENDPOINT,    // required for non-AWS
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const PRIVATE_BUCKET = process.env.S3_PRIVATE_BUCKET!;
export const PUBLIC_BUCKET = process.env.S3_PUBLIC_BUCKET!;
```

### 7.3 Presigned URL helpers

```ts
// packages/storage/src/sign.ts
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, PRIVATE_BUCKET } from "./client";
import { assertCompanyPath, companyKey } from "./path";

export async function signUpload(args: {
  companyId: string;
  path: string;            // "job/abc/file.pdf"
  contentType: string;
  expiresIn?: number;      // default 300s
}) {
  const key = companyKey(args.companyId, args.path);
  const cmd = new PutObjectCommand({
    Bucket: PRIVATE_BUCKET,
    Key: key,
    ContentType: args.contentType,
  });
  return {
    url: await getSignedUrl(s3, cmd, { expiresIn: args.expiresIn ?? 300 }),
    key,
  };
}

export async function signDownload(args: {
  companyId: string;
  key: string;
  expiresIn?: number;      // default 900s
}) {
  const key = assertCompanyPath(args.companyId, args.key);
  const cmd = new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: args.expiresIn ?? 900 });
}

export async function removeObject(args: { companyId: string; key: string }) {
  const key = assertCompanyPath(args.companyId, args.key);
  const cmd = new DeleteObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key });
  return s3.send(cmd);
}
```

`assertCompanyPath` is the single enforcement point for tenant-scoped private keys. It normalizes keys, rejects empty/dot-dot/dot segments, backslashes, control characters, URL fragments/query characters, and encoded traversal before checking the first segment against `companyId`. Public uploads are still validated as normalized S3 keys; app upload routes require public tenant assets to use a company prefix, while feedback attachments are constrained to the `feedback/` namespace. The ECS/container IAM role has access only to `carbon-private-{stage}/*` and `carbon-public-{stage}/*` as a backstop.

### 7.4 CDN strategy

- **Public bucket** → fronted by CloudFront or any CDN, long cache. Unauthenticated access.
- **Private bucket** → optional CloudFront with Origin Access + signed CloudFront URLs for repeat-served assets (avatars, shared quote PDFs) with 24-hour expiry + 24-hour cache.
- **One-off downloads** (hot previews, ephemeral) → direct S3 presigned, no CDN.

If the deployment target doesn't provide a CDN, serve directly from S3. Performance matters less than portability.

### 7.5 Image processing

`sharp` inside the Node app handles thumbnails/resizing on demand. Cache resized images back to S3 under a separate prefix (`{companyId}/.cache/{hash}.webp`). No Lambda@Edge, no provider-specific image service.

---

## 8. Realtime (TanStack Query polling)

### 8.1 Global query client configuration

```ts
// apps/erp/app/query-client.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 5_000,
      gcTime: 5 * 60_000,
    },
  },
});
```

### 8.2 Per-view tuning

| View | `refetchInterval` | Why |
|------|-------------------|-----|
| Entity lists (items, customers, suppliers, employees) | 30s | Rarely change cross-user; focus/reconnect covers actual edits |
| Production dashboard aggregations | 5s | Factory-floor viewer; 5s feels instant |
| Kanban boards (scheduling, MES) | 3s | Multi-user drag; 3s is acceptable jitter |
| MES operation view (job + productionEvent) | 3s | Active work; poll aggressively |
| Chat (job operation notes) | 2s | Only path where polling feels worse than push |
| Everything else | 15s (default) | — |

Set per-query via `useQuery({ queryKey, queryFn, refetchInterval })`.

### 8.3 Optimistic mutations

The actor always sees their own mutations instantly. Observers see them within one poll cycle.

```ts
const mutation = useMutation({
  mutationFn: saveJob,
  onMutate: async (next) => {
    await queryClient.cancelQueries({ queryKey: ["job", next.id] });
    const prev = queryClient.getQueryData(["job", next.id]);
    queryClient.setQueryData(["job", next.id], next);
    return { prev };
  },
  onError: (_e, next, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(["job", next.id], ctx.prev);
  },
  onSettled: (_d, _e, next) => {
    queryClient.invalidateQueries({ queryKey: ["job", next.id] });
  },
});
```

### 8.4 Escape hatch (future, if chat feels laggy)

If 2-second polling on chat feels insufficient, add one SSE route. No architectural change required.

```ts
// apps/mes/app/routes/api+/events.job-operation-notes.$id.tsx
import { eventStream } from "remix-utils/sse/server";
import { redis } from "@carbon/cache";

export async function loader({ request, params }) {
  const { companyId } = await requirePermissions(request, {});
  await assertOperationInCompany(params.id!, companyId);
  return eventStream(request.signal, (send) => {
    const sub = redis.duplicate();
    const channel = `jobOperationNote:${params.id}`;
    sub.subscribe(channel);
    sub.on("message", (_c, msg) => send({ data: msg }));
    return () => { sub.unsubscribe(channel); sub.quit(); };
  });
}
```

Day-1: not built. Polling only.

---

## 9. Jobs and scheduling (pg-boss)

Postgres-backed job queue. No broker, no separate service. Works on any Postgres ≥11 (no Supabase-specific features required).

### 9.1 Connection topology

pg-boss uses `LISTEN/NOTIFY` for instant job pickup. **`LISTEN/NOTIFY` does not survive a transaction-mode connection pooler** (RDS Proxy, Supavisor transaction mode, PgBouncer transaction mode). Give pg-boss its own connection string that bypasses the pooler:

```bash
DATABASE_URL=postgres://...via-pooler...         # app uses this via RDS Proxy / Supavisor
DATABASE_SERVICE_URL=postgres://...via-pooler... # carbon_service role via pooler
JOBS_DATABASE_URL=postgres://...direct...        # pg-boss: direct to Postgres, no pooler
```

In local dev all URLs point at the same Postgres instance, but use distinct roles: `DATABASE_MIGRATION_URL` uses the owner role, `DATABASE_URL` uses `carbon_app`, and service/jobs use `carbon_service`. In production, `JOBS_DATABASE_URL` connects directly to the database endpoint; the other runtime URLs may go through a pooler.

**Fallback if a direct connection isn't available** (some managed providers hide the direct endpoint): pg-boss falls back to polling via `newJobCheckInterval: 2000`. Up to 2s of added job-pickup latency. Usually acceptable.

### 9.2 Implementation

```ts
// packages/jobs/src/boss.ts
import PgBoss from "pg-boss";

export const boss = new PgBoss({
  connectionString: process.env.JOBS_DATABASE_URL!,
  // Leave LISTEN/NOTIFY on (default) when the connection is direct.
  // If forced through a pooler, set: newJobCheckInterval: 2000
});

export async function startBoss() {
  await boss.start();
  await boss.work("post-invoice", { teamSize: 4 }, handlePostInvoice);
  await boss.work("send-invite", { teamSize: 2 }, handleSendInvite);
  await boss.schedule("daily-mrp", "0 4 * * *", {}, { tz: "UTC" });
}
```

Producer (any route or service):

```ts
await boss.send("post-invoice", { invoiceId });
```

### 9.3 Properties

- Retries, exponential backoff, dead-letter queue, cron, job archival — all native to pg-boss.
- Creates its own schema (`pgboss`) on first start. Requires `CREATE SCHEMA` on the database.
- Scales by raising `teamSize` on workers or running multiple worker containers.
- Worker containers can be the same app container or a separate one (same image, different entrypoint that calls `startBoss()` without binding HTTP).

### 9.4 When to swap adapters

If the team outgrows pg-boss (specific workflow patterns, event sourcing, observability needs), add a second adapter behind a common `jobs.send()` interface. Realistic alternatives:

- **Inngest self-hosted** — durable workflows, step functions, better observability.
- **Trigger.dev self-hosted** — similar shape.

Both deploy as extra containers. Don't take this on unless you hit a specific pg-boss limitation.

---

## 10. Email

```ts
// packages/email/src/send.ts
import { sendViaResend } from "./resend";
import { sendViaSmtp } from "./smtp";
import { sendViaSes } from "./ses";

type SendArgs = { to: string; subject: string; html: string; text?: string };

export const sendEmail = (args: SendArgs) => {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";
  if (provider === "ses") return sendViaSes(args);
  if (provider === "smtp") return sendViaSmtp(args);
  return sendViaResend(args);
};
```

Dev uses `EMAIL_PROVIDER=smtp` pointing at local Mailpit. Prod uses Resend (default), or SES if inside AWS, or Postmark if the deployment target requires it.

---

## 11. AI / LLM

```ts
// packages/ai/src/client.ts
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const provider = process.env.AI_PROVIDER ?? "openai";
const model = process.env.AI_MODEL ?? "gpt-4o";

export const llm = provider === "anthropic"
  ? createAnthropic({ apiKey: process.env.AI_API_KEY! })(model)
  : createOpenAI({ apiKey: process.env.AI_API_KEY! })(model);
```

App code calls `generateText({ model: llm, prompt })` — doesn't know the provider. Bedrock/Gateway/OpenRouter plug in by adding new adapters.

---

## 12. Rapid setup

### 12.1 Local dev (`docker compose up`)

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg18-trixie
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: carbon
    ports: ["5432:5432"]
    volumes: [carbon-pg:/var/lib/postgresql/data]

  redis:
    image: valkey/valkey:8
    ports: ["6379:6379"]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes: [carbon-s3:/data]

  mailpit:
    image: axllent/mailpit
    ports: ["1025:1025", "8025:8025"]

volumes:
  carbon-pg:
  carbon-s3:
```

`.env.local`:
```bash
DATABASE_MIGRATION_URL=postgres://postgres:dev@localhost:5432/carbon
DATABASE_URL=postgres://carbon_app:carbon_app@localhost:5432/carbon
DATABASE_SERVICE_URL=postgres://carbon_service:carbon_service@localhost:5432/carbon
JOBS_DATABASE_URL=postgres://carbon_service:carbon_service@localhost:5432/carbon
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_PRIVATE_BUCKET=carbon-private
S3_PUBLIC_BUCKET=carbon-public
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
AUTH_PROVIDER=better_auth
BETTER_AUTH_SECRET=dev-secret-rotate-me
SESSION_SECRET=dev-session-secret
```

Dev onboarding:
```bash
docker compose up -d
pnpm install
pnpm db:migrate            # drizzle migrations
pnpm db:seed               # optional
pnpm dev                   # runs ERP + MES via Turbo
```

### 12.2 Reference deployments

Same Docker image, different environment. Pick per need:

| Profile | Providers | Env differences | Good for |
|---------|-----------|-----------------|----------|
| **A: Fly.io** | Fly Postgres, Fly Redis, Tigris, Resend | `DATABASE_URL=...fly...`, `S3_ENDPOINT=...tigris...` | Cheapest global, rapid launch |
| **B: Railway** | Railway Postgres, Railway Redis, R2, Resend | Railway auto-wires between services | Simplest UX, small teams |
| **C: AWS** | RDS Postgres (+ Proxy), ElastiCache, S3, SES | SST or Terraform provisions | Enterprise, GovCloud, compliance |
| **D: Self-host** | Docker Compose on a VM (same compose as dev + Caddy) | Raw container runtime | Air-gapped, lowest cost, full control |

In every profile, the application container is **identical**. Build once.

---

## 13. Environment variable surface

The complete contract:

```bash
# ─── Required ────────────────────────────────────────────
NODE_ENV=production
DATABASE_MIGRATION_URL=                # owner/admin role for schema migrations
DATABASE_URL=                          # carbon_app role, may be via pooler
DATABASE_SERVICE_URL=                  # carbon_service role (BYPASSRLS), may be via pooler
JOBS_DATABASE_URL=                     # pg-boss, DIRECT connection (no pooler) for LISTEN/NOTIFY
REDIS_URL=
S3_ENDPOINT=                           # empty for AWS S3, URL for others
S3_REGION=auto                         # "auto" for R2, region for AWS
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PRIVATE_BUCKET=
S3_PUBLIC_BUCKET=
SESSION_SECRET=                        # cookie encryption

# ─── Auth provider ───────────────────────────────────────
AUTH_PROVIDER=better_auth

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=                       # base URL for this instance

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# ─── Email ───────────────────────────────────────────────
EMAIL_PROVIDER=resend                  # resend | ses | postmark | smtp
RESEND_API_KEY=
# or: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
# or: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (for SES)

# ─── AI ──────────────────────────────────────────────────
AI_PROVIDER=openai                     # openai | anthropic | bedrock
AI_MODEL=gpt-4o
AI_API_KEY=

# ─── Optional integrations ───────────────────────────────
INNGEST_EVENT_KEY=                     # if using Inngest instead of pg-boss
JIRA_CLIENT_ID=
QUICKBOOKS_CLIENT_ID=
# ... existing integration vars unchanged
```

---

## 14. Implementation phasing

The greenfield build plan, each phase independently shippable.

### Phase 1 — Foundation (1–2 weeks)
- Scaffold `packages/db` with Drizzle schema, `withAuth` wrapper, two-pool client, migrations runner.
- Create `carbon_app` and `carbon_service` Postgres roles + helper functions (`app_uid`, `app_companies_with_permission`, etc.).
- Set up Docker Compose for local dev.
- Define the full Drizzle schema with RLS policies inline (~200 tables).

### Phase 2 — Authentication (2 weeks)
- Define `AuthProvider` interface in `packages/auth`.
- Implement `BetterAuthProvider` adapter.
- Cookie/session layer, token refresh route, Better Auth `/api/auth/*` route handlers, and Carbon callback bridge routes.
- API key system (SHA-256, `apiKey` table, header extraction).
- `requirePermissions()` calls `authProvider` through the interface.

### Phase 3 — Storage (1 week)
- `packages/storage` with S3 client + sign helpers + `assertCompanyPath`.
- Port image resizer / thumbnail logic to Node route with `sharp`.
- CDN configuration in deployment templates.

### Phase 4 — Jobs (1 week)
- `packages/jobs` wrapping pg-boss.
- Migrate any cron/queue logic from Inngest (or keep Inngest as a second adapter if DX needed).

### Phase 5 — App integration (4–6 weeks)
- All route handlers updated to `withAuth(ctx, tx => ...)` pattern.
- Service files (`sales.service.ts`, `items.service.ts`, etc.) rewritten with Drizzle.
- Mutations wired for optimistic updates in TanStack Query.
- Poll intervals configured per view.

### Phase 6 — Testing & hardening (2 weeks)
- Policy snapshot fixture.
- Per-user regression suite (~40 canonical users).
- Leakage fuzzer in CI.
- Load test the polling endpoints.
- Better Auth runtime suite: signup, password sign-in, magic-link invite, session refresh, password update, social sign-in route handling, and Carbon callback bridge fixtures.

### Phase 7 — Ship (1 week)
- Provision target deployment (Fly / Railway / AWS / self-host).
- Cut over domains.
- Monitor.

**Total: 12–16 weeks for a full greenfield build. Phase 2 is the critical path; Phase 5 is the longest.**

---

## 15. Open decisions

Decide these before Phase 1 begins:

1. **Primary reference deployment for docs.** Fly, Railway, AWS, or self-host? Affects README/quickstart. Other profiles stay supported; this just picks the "happy path" example.
2. **Jobs: pg-boss vs Inngest.** Recommend **pg-boss** for portability; Inngest self-hosted if the DX is a requirement for the team.
3. **Image processing: on-demand sharp vs precomputed pipeline.** On-demand is simpler; recommend default.
4. **Public bucket CDN.** Required for the deployment, or acceptable to serve from object storage directly? Affects Phase 3 scope.

---

## 16. What this design deliberately excludes

- **Realtime infrastructure.** No websocket server, no Electric, no NATS, no Redis pub/sub for realtime. Polling-only, with SSE as a future escape hatch.
- **Supabase-specific features.** No PostgREST, no `auth.uid()`, no `supabase_realtime` publication, no storage RLS policies.
- **Hosted auth dependency.** Better Auth keeps auth in the app and Postgres; hosted SSO is a future integration, not a baseline dependency.
- **Vercel/Cloudflare/Supabase edge functions.** Business logic lives in Node routes in the main container. Edge function runtimes are not a target.
- **Legacy data cut-over tooling.** This is a greenfield spec. Backfill/cut-over from an existing Supabase deployment is a separate workstream.

---

## 17. Success criteria

The replatform is considered complete when:

1. A new developer runs `docker compose up && pnpm dev` and has a working local environment in under 10 minutes.
2. Better Auth signup, password sign-in, invite/magic-link, refresh, social sign-in route handling, Carbon callback bridging, and admin user-management flows pass against the same Postgres database as the app.
3. The same container image deploys unchanged to at least two of the four reference profiles (Fly, Railway, AWS, self-host).
4. Zero references to `@supabase/supabase-js` or `supabase` in the application packages.
5. RLS regression suite passes: 40 canonical users see exactly their expected row counts, no cross-tenant leakage under concurrent load.
6. p95 latency on the polling endpoints stays under 150ms at peak load.

---

## Appendix A — Auth surface replacement map

| Current call | Interface method |
|--------------|------------------|
| `auth.admin.createUser({ email, password, email_confirm })` | `authProvider.createUser({ email, password, emailVerified })` |
| `auth.admin.createUser({ id, email, ... })` | `authProvider.createUser({ id, email, ... })` (console promotion) |
| `auth.admin.deleteUser(userId)` | `authProvider.deleteUser(userId)` |
| `auth.admin.updateUserById(userId, { password })` | `authProvider.adminSetPassword(userId, password)` |
| `auth.admin.generateLink({ type: "magiclink", email, options })` | `authProvider.generateMagicLink({ email, redirectTo })` |
| `auth.getUser(accessToken)` | `authProvider.getSessionByAccessToken(accessToken)` |
| `auth.updateUser({ password })` | `authProvider.updatePassword({ accessToken, newPassword })` |
| `auth.refreshSession({ refresh_token })` | `authProvider.refreshSession(refreshToken)` |
| `auth.signInWithOtp({ email })` | `authProvider.sendMagicLink({ email, redirectTo })` |
| `auth.signInWithPassword({ email, password })` | `authProvider.signInWithPassword({ email, password })` |
| Browser social sign-in | `startOAuthSignIn({ provider, redirectTo })`, which posts to `/api/auth/sign-in/social` and follows Better Auth's returned redirect |
| Browser auth-state listener callback | Removed; `/callback` loaders call `signInWithRequest(request, preferredCompanyId?)` to bridge the Better Auth request cookie into the Carbon session cookie |

---

## Appendix B — Replaced components

| Supabase feature | Replacement |
|------------------|-------------|
| Supabase Auth | `AuthProvider` interface with Better Auth |
| Supabase DB (RLS via `auth.uid()`) | Plain Postgres with `app_uid()` + `withAuth` wrapper |
| Supabase Realtime | TanStack Query polling (SSE as future escape hatch) |
| Supabase Storage | S3 API (any provider) + presigned URLs + `assertCompanyPath` |
| Supabase Edge Functions (Deno) | Node routes in the main app container |
| `supabase gen types` | Drizzle-inferred types |
| `.from("t").select(...)` | `db.select().from(t).where(...)` (Drizzle) |
| `.rpc("fn", args)` | `db.execute(sql\`SELECT fn(${args})\`)` |
