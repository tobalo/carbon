import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  boolean,
  integer,
  pgTable,
  text
} from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { CONTROL_DATABASE_URL } from "./env";

const workspaces = pgTable("workspaces", {
  id: integer("id").primaryKey(),
  name: text("name"),
  slug: text("slug"),
  active: boolean("active"),
  seeded: boolean("seeded"),

  aws: boolean("aws"),
  awsAccountId: text("aws_account_id"),
  awsRegion: text("aws_region"),

  domainName: text("domain_name"),
  certArnErp: text("cert_arn_erp"),
  certArnMes: text("cert_arn_mes"),

  connectionString: text("connection_string"),
  databaseUrl: text("database_url"),
  databaseConnectionPoolerUrl: text("database_connection_pooler_url"),
  anonKey: text("anon_key"),
  jwtSecret: text("jwt_secret"),
  serviceRoleKey: text("service_role_key"),

  authProviders: text("auth_providers"),
  carbonEdition: text("carbon_edition"),
  cloudflareTurnstileSecretKey: text("cloudflare_turnstile_secret_key"),
  cloudflareTurnstileSiteKey: text("cloudflare_turnstile_site_key"),
  controlledEnvironment: text("controlled_environment"),
  exchangeRatesApiKey: text("exchange_rates_api_key"),
  googlePlacesApiKey: text("google_places_api_key"),
  inngestBaseUrl: text("inngest_base_url"),
  inngestEventKey: text("inngest_event_key"),
  inngestSigningKey: text("inngest_signing_key"),
  jiraClientId: text("jira_client_id"),
  jiraClientSecret: text("jira_client_secret"),
  jiraOauthRedirectUrl: text("jira_oauth_redirect_url"),
  jiraStateSecret: text("jira_state_secret"),
  openaiApiKey: text("openai_api_key"),
  posthogApiHost: text("posthog_api_host"),
  posthogProjectPublicKey: text("posthog_project_public_key"),
  quickbooksClientId: text("quickbooks_client_id"),
  quickbooksClientSecret: text("quickbooks_client_secret"),
  quickbooksWebhookSecret: text("quickbooks_webhook_secret"),
  redisUrl: text("redis_url"),
  resendApiKey: text("resend_api_key"),
  resendDomain: text("resend_domain"),
  sessionSecret: text("session_secret"),
  slackBotToken: text("slack_bot_token"),
  slackClientId: text("slack_client_id"),
  slackClientSecret: text("slack_client_secret"),
  slackOauthRedirectUrl: text("slack_oauth_redirect_url"),
  slackSigningSecret: text("slack_signing_secret"),
  slackStateSecret: text("slack_state_secret"),
  stripeBypassCompanyIds: text("stripe_bypass_company_ids"),
  stripeSecretKey: text("stripe_secret_key"),
  stripeWebhookSecret: text("stripe_webhook_secret"),
  urlErp: text("url_erp"),
  urlMes: text("url_mes"),
  xeroClientId: text("xero_client_id"),
  xeroClientSecret: text("xero_client_secret"),
  xeroWebhookSecret: text("xero_webhook_secret")
});

function getSslConfig(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode === "disable") return false;
  if (sslMode) return { rejectUnauthorized: sslMode === "verify-full" };
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return false;
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: CONTROL_DATABASE_URL,
  max: 5,
  allowExitOnIdle: true,
  ssl: getSslConfig(CONTROL_DATABASE_URL)
});

const db = drizzle(pool);

export async function closeWorkspaceDatabase() {
  await pool.end();
}

export async function getMigrationWorkspaces() {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      active: workspaces.active,
      seeded: workspaces.seeded,
      connection_string: workspaces.connectionString,
      database_url: workspaces.databaseUrl,
      anon_key: workspaces.anonKey,
      service_role_key: workspaces.serviceRoleKey
    })
    .from(workspaces);
}

export async function getDeployWorkspaces() {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      active: workspaces.active,
      seeded: workspaces.seeded,
      aws: workspaces.aws,
      aws_account_id: workspaces.awsAccountId,
      aws_region: workspaces.awsRegion,
      domain_name: workspaces.domainName,
      cert_arn_erp: workspaces.certArnErp,
      cert_arn_mes: workspaces.certArnMes,
      database_url: workspaces.databaseUrl,
      database_connection_pooler_url: workspaces.databaseConnectionPoolerUrl,
      anon_key: workspaces.anonKey,
      jwt_secret: workspaces.jwtSecret,
      service_role_key: workspaces.serviceRoleKey,
      auth_providers: workspaces.authProviders,
      carbon_edition: workspaces.carbonEdition,
      cloudflare_turnstile_secret_key: workspaces.cloudflareTurnstileSecretKey,
      cloudflare_turnstile_site_key: workspaces.cloudflareTurnstileSiteKey,
      controlled_environment: workspaces.controlledEnvironment,
      exchange_rates_api_key: workspaces.exchangeRatesApiKey,
      google_places_api_key: workspaces.googlePlacesApiKey,
      inngest_base_url: workspaces.inngestBaseUrl,
      inngest_event_key: workspaces.inngestEventKey,
      inngest_signing_key: workspaces.inngestSigningKey,
      jira_client_id: workspaces.jiraClientId,
      jira_client_secret: workspaces.jiraClientSecret,
      jira_oauth_redirect_url: workspaces.jiraOauthRedirectUrl,
      jira_state_secret: workspaces.jiraStateSecret,
      openai_api_key: workspaces.openaiApiKey,
      posthog_api_host: workspaces.posthogApiHost,
      posthog_project_public_key: workspaces.posthogProjectPublicKey,
      quickbooks_client_id: workspaces.quickbooksClientId,
      quickbooks_client_secret: workspaces.quickbooksClientSecret,
      quickbooks_webhook_secret: workspaces.quickbooksWebhookSecret,
      redis_url: workspaces.redisUrl,
      resend_api_key: workspaces.resendApiKey,
      resend_domain: workspaces.resendDomain,
      session_secret: workspaces.sessionSecret,
      slack_bot_token: workspaces.slackBotToken,
      slack_client_id: workspaces.slackClientId,
      slack_client_secret: workspaces.slackClientSecret,
      slack_oauth_redirect_url: workspaces.slackOauthRedirectUrl,
      slack_signing_secret: workspaces.slackSigningSecret,
      slack_state_secret: workspaces.slackStateSecret,
      stripe_bypass_company_ids: workspaces.stripeBypassCompanyIds,
      stripe_secret_key: workspaces.stripeSecretKey,
      stripe_webhook_secret: workspaces.stripeWebhookSecret,
      url_erp: workspaces.urlErp,
      url_mes: workspaces.urlMes,
      xero_client_id: workspaces.xeroClientId,
      xero_client_secret: workspaces.xeroClientSecret,
      xero_webhook_secret: workspaces.xeroWebhookSecret
    })
    .from(workspaces);
}

export async function getJobWorkspaces() {
  return db
    .select({
      id: workspaces.id,
      url_erp: workspaces.urlErp
    })
    .from(workspaces);
}

export async function getBackupTemplateWorkspaces() {
  return db
    .select({
      id: workspaces.id,
      database_url: workspaces.databaseUrl,
      service_role_key: workspaces.serviceRoleKey
    })
    .from(workspaces);
}

export async function markWorkspaceSeeded(id: number) {
  await db
    .update(workspaces)
    .set({ seeded: true })
    .where(eq(workspaces.id, id));
}
