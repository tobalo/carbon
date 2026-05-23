import type { QueryDatabase } from "@carbon/database/schema";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";

export interface ChatContext {
  client: CarbonDatabaseClient<QueryDatabase>;
  userId: string;
  companyId: string;
  companyGroupId: string;
  fullName: string;
  companyName: string;
  baseCurrency: string;
  locale: string;
  currentDateTime: string;
  country?: string;
  city?: string;
  timezone: string;
  chatId: string;
  // Allow additional properties to satisfy Record<string, unknown> constraint
  [key: string]: unknown;
}

export function createChatContext(params: {
  userId: string;
  companyId: string;
  companyGroupId: string;
  client: CarbonDatabaseClient<QueryDatabase>;
  fullName: string;
  companyName: string;
  country?: string;
  city?: string;
  chatId: string;
  baseCurrency?: string;
  locale?: string;
  timezone?: string;
}) {
  return {
    userId: params.userId,
    companyId: params.companyId,
    companyGroupId: params.companyGroupId,
    client: params.client,
    fullName: params.fullName,
    companyName: params.companyName,
    country: params.country,
    city: params.city,
    chatId: params.chatId,
    baseCurrency: params.baseCurrency || "USD",
    locale: params.locale || "en-US",
    currentDateTime: new Date().toISOString(),
    timezone:
      params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
