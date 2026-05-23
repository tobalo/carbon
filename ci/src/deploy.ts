import { $ } from "execa";

import { fetchWorkspaces } from "./client";

export type Workspace = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  seeded: boolean;

  // AWS Configuration
  aws: boolean;
  aws_account_id: string | null;
  aws_region: string | null;

  // Domain Configuration
  domain_name: string | null;
  cert_arn_erp: string | null;
  cert_arn_mes: string | null;

  // Database Configuration
  connection_string: string | null;
  database_url: string | null;
  database_connection_pooler_url: string | null;

  // App Configuration
  auth_providers: string | null;
  carbon_edition: string | null;
  cloudflare_turnstile_secret_key: string | null;
  cloudflare_turnstile_site_key: string | null;
  controlled_environment: string | null;
  exchange_rates_api_key: string | null;
  google_places_api_key: string | null;
  inngest_base_url: string | null;
  inngest_event_key: string | null;
  inngest_signing_key: string | null;
  jira_client_id: string | null;
  jira_client_secret: string | null;
  jira_oauth_redirect_url: string | null;
  jira_state_secret: string | null;
  novu_api_url: string | null;
  novu_application_id: string | null;
  novu_secret_key: string | null;
  openai_api_key: string | null;
  posthog_api_host: string | null;
  posthog_project_public_key: string | null;
  quickbooks_client_id: string | null;
  quickbooks_client_secret: string | null;
  quickbooks_webhook_secret: string | null;
  redis_url: string | null;
  resend_api_key: string | null;
  resend_domain: string | null;
  session_secret: string | null;
  slack_bot_token: string | null;
  slack_client_id: string | null;
  slack_client_secret: string | null;
  slack_oauth_redirect_url: string | null;
  slack_signing_secret: string | null;
  slack_state_secret: string | null;
  stripe_bypass_company_ids: string | null;
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  url_erp: string | null;
  url_mes: string | null;
  xero_client_id: string | null;
  xero_client_secret: string | null;
  xero_webhook_secret: string | null;
};

async function deploy(): Promise<void> {
  console.log("✅ 🌱 Starting deployment");

  const imageTag = process.env.IMAGE_TAG;
  if (!imageTag) {
    console.error("🔴 🍳 Missing IMAGE_TAG environment variable");
    process.exit(1);
  }

  console.log(`✅ 🏷️ Using image tag: ${imageTag}`);

  const workspaces = await fetchWorkspaces<Workspace>();

  let hasErrors = false;

  console.log("✅ 🛩️ Successfully retreived workspaces");

  for await (const workspace of workspaces) {
    try {
      console.log(`✅ 🥚 Migrating ${workspace.id}`);
      const {
        auth_providers,
        aws_account_id,
        aws_region,
        aws,
        carbon_edition,
        cert_arn_erp,
        cert_arn_mes,
        cloudflare_turnstile_secret_key,
        cloudflare_turnstile_site_key,
        controlled_environment,
        database_connection_pooler_url,
        database_url,
        domain_name,
        exchange_rates_api_key,
        google_places_api_key,
        inngest_base_url,
        inngest_event_key,
        inngest_signing_key,
        jira_client_id,
        jira_client_secret,
        jira_oauth_redirect_url,
        jira_state_secret,
        novu_api_url,
        novu_application_id,
        novu_secret_key,
        openai_api_key,
        posthog_api_host,
        posthog_project_public_key,
        quickbooks_client_id,
        quickbooks_client_secret,
        quickbooks_webhook_secret,
        redis_url,
        resend_api_key,
        resend_domain,
        session_secret,
        slack_bot_token,
        slack_client_id,
        slack_client_secret,
        slack_oauth_redirect_url,
        slack_signing_secret,
        slack_state_secret,
        slug,
        stripe_bypass_company_ids,
        stripe_secret_key,
        stripe_webhook_secret,
        url_erp,
        url_mes,
        xero_client_id,
        xero_client_secret,
        xero_webhook_secret,
      } = workspace;

      if (!aws) {
        continue;
      }

      if (!aws_account_id) {
        console.log(`🔴🍳 Missing AWS account id for ${workspace.id}`);
        continue;
      }

      if (!aws_region) {
        console.log(`🔴🍳 Missing AWS region for ${workspace.id}`);
        continue;
      }

      if (!domain_name) {
        console.log(`🔴🍳 Missing domain name for ${workspace.id}`);
        continue;
      }

      if (!cert_arn_erp) {
        console.log(`🔴🍳 Missing ERP domain cert ARN for ${workspace.id}`);
        continue;
      }

      if (!cert_arn_mes) {
        console.log(`🔴🍳 Missing MES domain cert ARN for ${workspace.id}`);
        continue;
      }

      const runtimeDatabaseUrl =
        database_connection_pooler_url ?? database_url ?? workspace.connection_string;

      if (!runtimeDatabaseUrl) {
        console.log(
          `🔴🍳 Missing runtime database url for ${workspace.id}`
        );
        continue;
      }

      if (!resend_api_key) {
        console.log(`🔴🍳 Missing Resend API key for ${workspace.id}`);
        continue;
      }

      if (!session_secret) {
        console.log(`🔴🍳 Missing session secret for ${workspace.id}`);
        continue;
      }

      if (!inngest_signing_key) {
        console.log(`🔴🍳 Missing Inngest signing key for ${workspace.id}`);
        continue;
      }

      if (!inngest_event_key) {
        console.log(`🔴🍳 Missing Inngest event key for ${workspace.id}`);
        continue;
      }

      if (!redis_url) {
        console.log(`🔴🍳 Missing Redis URL for ${workspace.id}`);
        continue;
      }

      if (!url_erp) {
        console.log(`🔴🍳 Missing ERP url for ${workspace.id}`);
        continue;
      }

      if (!url_mes) {
        console.log(`🔴🍳 Missing MES url for ${workspace.id}`);
        continue;
      }

      console.log(`✅ 🔑 Setting up environment for ${workspace.id}`);

      const $$ = $({
        // @ts-ignore
        env: {
          AWS_ACCOUNT_ID: aws_account_id,
          AWS_REGION: aws_region,
          AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
          AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
          IMAGE_TAG: imageTag,
          AUTH_PROVIDER: process.env.AUTH_PROVIDER ?? "better_auth",
          AUTH_PROVIDERS: auth_providers ?? undefined,
          BETTER_AUTH_SECRET: session_secret,
          CARBON_EDITION: carbon_edition ?? "enterprise",
          CERT_ARN_ERP: cert_arn_erp,
          CERT_ARN_MES: cert_arn_mes,
          CLOUDFLARE_TURNSTILE_SECRET_KEY:
            cloudflare_turnstile_secret_key ?? undefined,
          CLOUDFLARE_TURNSTILE_SITE_KEY:
            cloudflare_turnstile_site_key ?? undefined,
          CONTROLLED_ENVIRONMENT: controlled_environment ?? undefined,
          DATABASE_SERVICE_URL: database_url ?? runtimeDatabaseUrl,
          DATABASE_URL: runtimeDatabaseUrl,
          DOMAIN: domain_name,
          EXCHANGE_RATES_API_KEY: exchange_rates_api_key ?? undefined,
          GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
          GOOGLE_PLACES_API_KEY: google_places_api_key ?? undefined,
          INNGEST_BASE_URL: inngest_base_url ?? undefined,
          INNGEST_EVENT_KEY: inngest_event_key,
          INNGEST_SIGNING_KEY: inngest_signing_key,
          JOBS_DATABASE_URL: runtimeDatabaseUrl,
          JIRA_CLIENT_ID: jira_client_id ?? undefined,
          JIRA_CLIENT_SECRET: jira_client_secret ?? undefined,
          JIRA_OAUTH_REDIRECT_URL: jira_oauth_redirect_url ?? undefined,
          JIRA_STATE_SECRET: jira_state_secret ?? undefined,
          NOVU_APPLICATION_ID: novu_application_id ?? undefined,
          NOVU_API_URL: novu_api_url ?? undefined,
          NOVU_SECRET_KEY: novu_secret_key ?? undefined,
          OPENAI_API_KEY: openai_api_key,
          POSTHOG_API_HOST: posthog_api_host ?? undefined,
          POSTHOG_PROJECT_PUBLIC_KEY: posthog_project_public_key ?? undefined,
          QUICKBOOKS_CLIENT_ID: quickbooks_client_id ?? undefined,
          QUICKBOOKS_CLIENT_SECRET: quickbooks_client_secret ?? undefined,
          QUICKBOOKS_WEBHOOK_SECRET: quickbooks_webhook_secret ?? undefined,
          REDIS_URL: redis_url ?? undefined,
          RESEND_API_KEY: resend_api_key,
          RESEND_DOMAIN: resend_domain ?? "carbon.ms",
          S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
          S3_ENDPOINT: process.env.S3_ENDPOINT,
          S3_PRIVATE_BUCKET: process.env.S3_PRIVATE_BUCKET,
          S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
          S3_PUBLIC_BUCKET: process.env.S3_PUBLIC_BUCKET,
          S3_REGION: process.env.S3_REGION,
          S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
          SESSION_SECRET: session_secret,
          SLACK_BOT_TOKEN: slack_bot_token ?? undefined,
          SLACK_CLIENT_ID: slack_client_id ?? undefined,
          SLACK_CLIENT_SECRET: slack_client_secret ?? undefined,
          SLACK_OAUTH_REDIRECT_URL: slack_oauth_redirect_url ?? undefined,
          SLACK_SIGNING_SECRET: slack_signing_secret ?? undefined,
          SLACK_STATE_SECRET: slack_state_secret ?? undefined,
          STRIPE_BYPASS_COMPANY_IDS: stripe_bypass_company_ids ?? undefined,
          STRIPE_SECRET_KEY: stripe_secret_key ?? undefined,
          STRIPE_WEBHOOK_SECRET: stripe_webhook_secret ?? undefined,
          URL_ERP: url_erp,
          URL_MES: url_mes,
          VERCEL_ENV: "production",
          XERO_CLIENT_ID: xero_client_id ?? undefined,
          XERO_CLIENT_SECRET: xero_client_secret ?? undefined,
          XERO_WEBHOOK_SECRET: xero_webhook_secret ?? undefined,
        },
        // Run SST from the repository root where sst.config.ts is located
        cwd: "..",
        stdio: "inherit",
      });

      console.log(`🚀 🐓 Deploying apps for ${workspace.id} with SST`);

      await $$`npx --yes sst@3.17.24 deploy --stage prod`;

      console.log(`✅ 🍗 Successfully deployed ${workspace.id}`);
    } catch (error) {
      console.error(`🔴 🍳 Failed to deploy ${workspace.id}`, error);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("🔴 Deployment completed with errors");
    process.exit(1);
  }

  console.log("✅ All deployments completed successfully");
}

deploy().catch((error) => {
  console.error("🔴 Unexpected error during deployment", error);
  process.exit(1);
});
