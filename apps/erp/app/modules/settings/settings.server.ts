import type {
  Json,
  QueryDatabase
} from "@carbon/database/schema";
import { getIntegrationConfigById, type IntegrationID } from "@carbon/ee";
import { getIntegrationServerHooks } from "@carbon/ee/hooks.server";
import { redis } from "@carbon/kv";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { z } from "zod";
import type { Integration } from "~/modules/settings/types";
import { sanitize } from "@carbon/utils";
import crypto from "crypto";
import type { customFieldValidator } from "./settings.models";

const INTEGRATION_CACHE_TTL = 3600;
const WEBHOOK_SIGNATURE_HEADER = "x-carbon-webhook-signature";

export function withIntegrationWebhookSecret(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  return typeof metadata.webhookSecret === "string" &&
    metadata.webhookSecret.length > 0
    ? metadata
    : {
        ...metadata,
        webhookSecret: crypto.randomUUID()
      };
}

function getIntegrationWebhookSecret(metadata: unknown): string {
  return typeof metadata === "object" &&
    metadata !== null &&
    typeof (metadata as Record<string, unknown>).webhookSecret === "string"
    ? ((metadata as Record<string, unknown>).webhookSecret as string)
    : "";
}

function normalizeWebhookSignature(signature: string): string {
  return signature.trim().replace(/^sha256=/i, "");
}

export function verifyIntegrationWebhookSignature(
  request: Request,
  metadata: unknown,
  payload: string
): boolean {
  const secret = getIntegrationWebhookSecret(metadata);
  const provided = request.headers.get(WEBHOOK_SIGNATURE_HEADER) ?? "";

  if (!secret || !provided) {
    return false;
  }

  const signature = normalizeWebhookSignature(provided);
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(signature, "hex");

  return (
    expectedBuffer.byteLength === providedBuffer.byteLength &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function clearCustomFieldsCache(companyId?: string) {
  const keys = companyId ? `customFields:${companyId}:*` : "customFields:*";
  redis.keys(keys).then(function (keys) {
    const pipeline = redis.pipeline();
    keys.forEach(function (key) {
      pipeline.del(key);
    });
    return pipeline.exec();
  });
}

export async function clearCompanyIntegrationCache(
  companyId: string
): Promise<void> {
  const cacheKey = `integrations:${companyId}`;

  try {
    // Clear both old and new key formats
    await redis.del(cacheKey, `json:${cacheKey}`);
  } catch (error) {
    console.error("Redis cache invalidation error:", error);
  }
}

export async function clearAllIntegrationCaches(): Promise<void> {
  try {
    // Clear both old and new key patterns
    const oldPattern = "integrations:*";
    const newPattern = "json:integrations:*";

    const [oldKeys, newKeys] = await Promise.all([
      redis.keys(oldPattern),
      redis.keys(newPattern)
    ]);

    const allKeys = [...oldKeys, ...newKeys];
    if (allKeys.length > 0) {
      console.log(`Clearing ${allKeys.length} integration cache entries`);
      await redis.del(...allKeys);
    }
  } catch (error) {
    console.error("Error clearing all integration caches:", error);
  }
}

export async function deactivateIntegration(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    companyId: string;
    updatedBy: string;
  }
) {
  const { id, companyId, updatedBy } = args;

  const result = await client
    .from("companyIntegration")
    .update({
      active: false,
      updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .eq("companyId", companyId);

  if (result.error) {
    return result;
  }

  await clearCompanyIntegrationCache(companyId);

  return result;
}

export async function deleteCustomField(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  try {
    clearCustomFieldsCache(companyId);
  } finally {
    return client.from("customField").delete().eq("id", id);
  }
}

interface CompanyIntegration {
  id: string;
  companyId: string;
  metadata: Record<string, any>;
  active: boolean;
}

export async function getCompanyIntegrations(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
): Promise<CompanyIntegration[]> {
  const cacheKey = `integrations:${companyId}`;

  try {
    // Try the new prefixed key first
    let cached = await redis.get(`json:${cacheKey}`);
    if (cached && typeof cached === "string") {
      try {
        return JSON.parse(cached);
      } catch (parseError) {
        console.error(
          `JSON parse error for prefixed cache key json:${cacheKey}:`,
          parseError
        );
        await redis.del(`json:${cacheKey}`);
      }
    }

    // Fallback to old key format for backwards compatibility
    cached = await redis.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      // Log the type and content for debugging
      console.log(`Cache hit for ${cacheKey}:`, {
        type: typeof cached,
        isArray: Array.isArray(cached),
        value: cached,
        constructor: cached?.constructor?.name
      });

      // Handle different response types from Upstash
      if (Array.isArray(cached)) {
        // Direct array return from Upstash
        return cached as CompanyIntegration[];
      } else if (typeof cached === "object" && cached !== null) {
        // Object return from Upstash - could be a parsed JSON already
        return cached as CompanyIntegration[];
      } else if (typeof cached === "string") {
        // String return - needs JSON parsing
        try {
          return JSON.parse(cached);
        } catch (parseError) {
          console.error(
            `JSON parse error for cache key ${cacheKey}:`,
            parseError
          );
          console.error("Cached value that failed to parse:", cached);
          await redis.del(cacheKey);
        }
      } else {
        console.warn(
          `Unexpected cache format for key ${cacheKey}:`,
          typeof cached,
          cached
        );
        await redis.del(cacheKey);
      }
    }
  } catch (error) {
    console.error("Redis cache read error:", error);
    // Clear the corrupted cache entry
    try {
      await redis.del(cacheKey);
    } catch (deleteError) {
      console.error("Failed to delete corrupted cache entry:", deleteError);
    }
  }

  const { data, error } = await client
    .from("companyIntegration")
    .select("*")
    .eq("companyId", companyId);

  if (error) {
    throw error;
  }

  const integrations = data || [];

  try {
    // Force string storage to avoid Upstash automatic deserialization issues
    const serializedData = JSON.stringify(integrations);
    if (typeof serializedData === "string" && serializedData.length > 0) {
      // Use a prefixed key to ensure we know this is a JSON string
      await redis.setex(
        `json:${cacheKey}`,
        INTEGRATION_CACHE_TTL,
        serializedData
      );
    } else {
      console.error("Failed to serialize integrations data for cache");
    }
  } catch (error) {
    console.error("Redis cache write error:", error);
  }

  return integrations as CompanyIntegration[];
}

export async function hasIntegration(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  integrationId: string
): Promise<boolean> {
  const integrations = await getCompanyIntegrations(client, companyId);
  return integrations.some((i) => i.id === integrationId && i.active === true);
}

export async function getCompanyIntegration(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  integrationId: string
): Promise<CompanyIntegration | null> {
  const integrations = await getCompanyIntegrations(client, companyId);
  return (
    integrations.find((i) => i.id === integrationId && i.active === true) ||
    null
  );
}

export async function getSlackIntegration(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
): Promise<{ token: string; channelId?: string } | null> {
  const integration = await getCompanyIntegration(client, companyId, "slack");

  if (!integration?.metadata) {
    return null;
  }

  const metadata = integration.metadata as any;

  if (!metadata.access_token) {
    return null;
  }

  return {
    token: metadata.access_token,
    channelId: metadata.channel_id || metadata.default_channel_id
  };
}

export async function hasSlackIntegration(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
): Promise<boolean> {
  return hasIntegration(client, companyId, "slack");
}

export async function upsertCompanyIntegration(
  client: CarbonDatabaseClient<QueryDatabase>,
  update: {
    id: string;
    active: boolean;
    metadata: Json;
    companyId: string;
    updatedBy: string;
  }
) {
  const result = await client
    .from("companyIntegration")
    .upsert([update], {
      onConflict: "id,companyId"
    })
    .select()
    .single();

  if (result.error) {
    return result;
  }

  await clearCompanyIntegrationCache(update.companyId);

  return result;
}

export async function upsertCustomField(
  client: CarbonDatabaseClient<QueryDatabase>,
  customField:
    | (Omit<z.infer<typeof customFieldValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof customFieldValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  try {
    clearCustomFieldsCache();
  } finally {
    if ("createdBy" in customField) {
      const sortOrders = await client
        .from("customField")
        .select("sortOrder")
        .eq("table", customField.table);

      if (sortOrders.error) return sortOrders;
      const maxSortOrder = sortOrders.data.reduce((max, item) => {
        return Math.max(max, item.sortOrder);
      }, 0);

      return client
        .from("customField")
        .insert([{ ...customField, sortOrder: maxSortOrder + 1 }]);
    }
    return client
      .from("customField")
      .update(
        sanitize({
          ...customField,
          updatedBy: customField.updatedBy
        })
      )
      .eq("id", customField.id);
  }
}

export async function updateCustomFieldsSortOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  try {
    clearCustomFieldsCache();
  } finally {
    const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
      client.from("customField").update({ sortOrder, updatedBy }).eq("id", id)
    );
    return Promise.all(updatePromises);
  }
}

export async function getIntegrationHealth(
  companyId: string,
  integration: Integration
): Promise<Integration & { health: "healthy" | "unhealthy" | "inactive" }> {
  if (!integration.active) {
    return {
      ...integration,
      health: "inactive"
    };
  }

  const serverHooks = getIntegrationServerHooks(integration.id!);
  const config = getIntegrationConfigById(integration.id as IntegrationID);
  const healthcheck = serverHooks?.onHealthcheck ?? config?.onHealthcheck;

  if (!healthcheck) {
    return {
      ...integration,
      health: "healthy"
    };
  }

  const key = `integrations:${companyId}:${integration.id}:health`;

  const cached = await redis.get(key);

  // Only cache healthy status
  if (cached === "1") {
    return {
      ...integration,
      health: "healthy"
    };
  }

  const status = await (
    healthcheck as (
      companyId: string,
      metadata: Record<string, any>
    ) => Promise<boolean>
  )(companyId, integration.metadata as Record<string, any>);

  await redis.set(key, status ? "1" : "0", "EX", INTEGRATION_CACHE_TTL * 5); // Cache for 5 minutes

  return {
    ...integration,
    health: status ? "healthy" : "unhealthy"
  };
}

export async function getIntegrationsWithHealth(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  const results = await client
    .from("integrations")
    .select("*")
    .eq("companyId", companyId);

  if (results.error) return results;

  const integrations = results.data;

  const withHealth = await Promise.all(
    integrations.map((i) => getIntegrationHealth(companyId, i))
  );

  return {
    data: withHealth,
    error: null
  };
}

export async function invalidateIntegrationHealthCache(
  integrationId: string,
  companyId: string
) {
  const key = `integrations:${companyId}:${integrationId}:health`;

  return await redis.del(key);
}
