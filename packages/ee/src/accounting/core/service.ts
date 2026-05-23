import type { DatabaseQueryClient } from "@carbon/database/query-client";
import { XeroProvider } from "../providers/xero";
import type { ProviderID } from "./models";
import {
  DEFAULT_SYNC_CONFIG,
  ProviderIntegrationMetadataSchema
} from "./models";
import type { ProviderCredentials, ProviderIntegrationMetadata } from "./types";

type AccountingIntegrationQueryResult<T> = {
  error: unknown;
  data: T | null;
};

async function requireActiveCompany(
  client: DatabaseQueryClient,
  companyId: string,
  lookupDescription: string
) {
  const company = await client
    .from("company")
    .select("id")
    .eq("id", companyId)
    .eq("active", true)
    .single();

  if (company.error || !company.data) {
    throw new Error(`No active company found for ${lookupDescription}`);
  }
}

function parseAccountingIntegration<
  T extends ProviderID,
  Row extends { metadata: unknown }
>(
  integration: AccountingIntegrationQueryResult<Row>,
  provider: T,
  lookupDescription: string
) {
  if (integration.error || !integration.data) {
    throw new Error(`No ${provider} integration found for ${lookupDescription}`);
  }

  const config = ProviderIntegrationMetadataSchema.safeParse(
    integration.data.metadata
  );

  if (!config.success) {
    console.dir(config.error, { depth: null });
    throw new Error("Invalid provider config");
  }

  return {
    ...integration.data,
    id: provider as T,
    metadata: config.data
  } as const;
}

export const getAccountingIntegrationByCompany = async <T extends ProviderID>(
  client: DatabaseQueryClient,
  companyId: string,
  provider: T
) => {
  await requireActiveCompany(client, companyId, `company ${companyId}`);

  const integration = await client
    .from("companyIntegration")
    .select("*")
    .eq("id", provider)
    .eq("companyId", companyId)
    .eq("active", true)
    .single();

  return parseAccountingIntegration(
    integration,
    provider,
    `company ${companyId}`
  );
};

export const getAccountingIntegrationByTenant = async <T extends ProviderID>(
  client: DatabaseQueryClient,
  tenantId: string,
  provider: T
) => {
  const integration = await client
    .from("companyIntegration")
    .select("*")
    .eq("id", provider)
    .eq("metadata->credentials->>tenantId", tenantId)
    .eq("active", true)
    .single();

  if (integration.error || !integration.data?.companyId) {
    return parseAccountingIntegration(
      integration,
      provider,
      `tenant ${tenantId}`
    );
  }

  await requireActiveCompany(
    client,
    integration.data.companyId,
    `tenant ${tenantId}`
  );

  return parseAccountingIntegration(
    integration,
    provider,
    `tenant ${tenantId}`
  );
};

export const getAccountingIntegration = getAccountingIntegrationByCompany;

export const getProviderIntegration = (
  client: DatabaseQueryClient,
  companyId: string,
  provider: ProviderID,
  config?: ProviderIntegrationMetadata
) => {
  const { accessToken, refreshToken, tenantId } = config?.credentials || {};

  // For now don't use the company level sync config
  const syncConfig = DEFAULT_SYNC_CONFIG;

  // Create a callback function to update the integration metadata when tokens are refreshed
  const onTokenRefresh = async (auth: ProviderCredentials) => {
    try {
      console.log("Refreshing tokens for", provider, "integration");
      const update: ProviderCredentials = {
        ...auth,
        expiresAt:
          auth.expiresAt || new Date(Date.now() + 3600000).toISOString(), // Default to 1 hour if not provided
        tenantId: auth.tenantId || tenantId
      };

      await client
        .from("companyIntegration")
        .update({ metadata: { ...config, credentials: update } })
        .eq("companyId", companyId)
        .eq("id", provider)
        .eq("active", true);
    } catch (error) {
      console.error(
        `Failed to update ${provider} integration metadata:`,
        error
      );
    }
  };

  switch (provider) {
    // case "quickbooks": {
    //   const environment = process.env.QUICKBOOKS_ENVIRONMENT as
    //     | "production"
    //     | "sandbox";
    //   return new QuickBooksProvider({
    //     companyId,
    //     tenantId,
    //     environment: environment || "sandbox",
    //     clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    //     clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    //     redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
    //     onTokenRefresh
    //   });
    // }
    case "xero": {
      const settings = {
        defaultSalesAccountCode: config?.defaultSalesAccountCode,
        defaultPurchaseAccountCode: config?.defaultPurchaseAccountCode
      };
      console.log(
        "[getProviderIntegration] Creating XeroProvider with settings:",
        settings
      );
      console.log("[getProviderIntegration] Full config received:", config);
      return new XeroProvider({
        companyId,
        tenantId,
        accessToken,
        refreshToken,
        clientId: process.env.XERO_CLIENT_ID!,
        clientSecret: process.env.XERO_CLIENT_SECRET!,
        redirectUri: process.env.XERO_REDIRECT_URI,
        syncConfig,
        onTokenRefresh,
        settings
      });
    }
    // Add other providers as needed
    // case "sage":
    //   return new SageProvider(config);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};
