import type { CarbonClient } from "@carbon/auth";
import { getPublicStorageUrl } from "@carbon/auth";
import { invokeCarbonServiceFunction } from "@carbon/auth/client.server";
import type { Json } from "@carbon/database";
import type {
  DocumentBlock,
  DocumentSectionPlacement,
  DocumentSettings,
  DocumentTemplate,
  DocumentTemplateType,
  DocumentTheme,
  ResolvedSection
} from "@carbon/documents/template";
import {
  CURRENT_TEMPLATE_FORMAT_VERSION,
  getBuiltInSection,
  isBuiltInSectionId,
  toDocumentTemplate
} from "@carbon/documents/template";
import type { JSONContent } from "@carbon/react";
import { sanitize } from "@carbon/utils";
import type { z } from "zod";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { interpolateSequenceDate } from "~/utils/string";
import type {
  accountsPayableBillingAddressValidator,
  accountsReceivableBillingAddressValidator,
  apiKeyValidator,
  companyValidator,
  kanbanOutputTypes,
  purchasePriceUpdateTimingTypes,
  sequenceValidator,
  subsidiaryValidator,
  webhookValidator
} from "./settings.models";

const getPublicLogoUrl = (path: string | null) =>
  path ? (getPublicStorageUrl("public", path) ?? path) : path;

export async function getAccountsPayableBillingAddress(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("companyAccountsPayableBillingAddress")
    .select("*")
    .eq("id", companyId)
    .single();
}

export async function getAccountsReceivableBillingAddress(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("companyAccountsReceivableBillingAddress")
    .select("*")
    .eq("id", companyId)
    .single();
}

export async function updateAccountsPayableBillingAddress(
  client: CarbonClient,
  companyId: string,
  data: z.infer<typeof accountsPayableBillingAddressValidator>,
  updatedBy: string
) {
  return client
    .from("companyAccountsPayableBillingAddress")
    .update(sanitize({ ...data, updatedBy }))
    .eq("id", companyId);
}

export async function updateAccountsReceivableBillingAddress(
  client: CarbonClient,
  companyId: string,
  data: z.infer<typeof accountsReceivableBillingAddressValidator>,
  updatedBy: string
) {
  return client
    .from("companyAccountsReceivableBillingAddress")
    .upsert(sanitize({ id: companyId, ...data, updatedBy }));
}

export async function deactivateWebhooks(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("webhook")
    .update({ active: false })
    .eq("companyId", companyId);
}

export async function deleteApiKey(client: CarbonClient, id: string) {
  return client.from("apiKey").delete().eq("id", id);
}

export async function deleteSubsidiary(
  client: CarbonClient,
  companyId: string
) {
  return client.from("company").delete().eq("id", companyId);
}

export async function deleteWebhook(client: CarbonClient, id: string) {
  return client.from("webhook").delete().eq("id", id);
}

export async function getApiKeys(
  client: CarbonClient,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("apiKey")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: true }
    ]);
  }

  return query;
}

export async function getCompanies(client: CarbonClient, userId: string) {
  const companies = await client
    .from("companies")
    .select("*, companyGroup(name)")
    .eq("userId", userId)
    .order("name");

  if (companies.error) {
    return companies;
  }

  return {
    data: companies.data.map(({ companyGroup, ...company }) => ({
      ...company,
      companyGroupName: (companyGroup as { name: string } | null)?.name ?? null,
      logoLight: getPublicLogoUrl(company.logoLight),
      logoDark: getPublicLogoUrl(company.logoDark),
      logoLightIcon: getPublicLogoUrl(company.logoLightIcon),
      logoDarkIcon: getPublicLogoUrl(company.logoDarkIcon),
      logoWatermark: getPublicLogoUrl(company.logoWatermark)
    })),
    error: null
  };
}

/**
 * The companies a user can enter in the ERP. ERP is an employee app, so
 * supplier/customer-only memberships (which belong to the portals) are
 * excluded. Single source of truth for the login callback, the select-company
 * picker, and the x+/_layout enforcement guard — keep those in sync via this.
 */
export async function getEmployeeCompanies(
  client: CarbonClient,
  userId: string
) {
  const companies = await client
    .from("companies")
    .select("*, companyGroup(name)")
    .eq("userId", userId)
    .eq("role", "employee")
    .order("name");

  if (companies.error) {
    return companies;
  }

  return {
    data: companies.data.map(({ companyGroup, ...company }) => ({
      ...company,
      companyGroupName: (companyGroup as { name: string } | null)?.name ?? null,
      logoLight: getPublicLogoUrl(company.logoLight),
      logoDark: getPublicLogoUrl(company.logoDark),
      logoLightIcon: getPublicLogoUrl(company.logoLightIcon),
      logoDarkIcon: getPublicLogoUrl(company.logoDarkIcon),
      logoWatermark: getPublicLogoUrl(company.logoWatermark)
    })),
    error: null
  };
}

export async function getIndustries(client: CarbonClient) {
  return client
    .from("industry")
    .select("id, name, description, iconName")
    .eq("active", true)
    .order("sortOrder");
}

export async function getCompany(client: CarbonClient, companyId: string) {
  const company = await client
    .from("company")
    .select("*")
    .eq("id", companyId)
    .single();
  if (company.error) {
    return company;
  }

  return {
    data: {
      ...company.data,
      logoLight: getPublicLogoUrl(company.data.logoLight),
      logoDark: getPublicLogoUrl(company.data.logoDark),
      logoLightIcon: getPublicLogoUrl(company.data.logoLightIcon),
      logoDarkIcon: getPublicLogoUrl(company.data.logoDarkIcon),
      logoWatermark: getPublicLogoUrl(company.data.logoWatermark)
    },
    error: null
  };
}

export async function getCompanyIntegrations(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("companyIntegration")
    .select("*")
    .eq("companyId", companyId);
}

export async function getCompanyPlan(client: CarbonClient, companyId: string) {
  return client.from("companyPlan").select("*").eq("id", companyId).single();
}

export async function getCompanySettings(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("companySettings")
    .select("*")
    .eq("id", companyId)
    .single();
}

export async function getConfig(client: CarbonClient) {
  return client.from("config").select("*").single();
}

export async function getCurrentSequence(
  client: CarbonClient,
  table: string,
  companyId: string
) {
  const sequence = await getSequence(client, table, companyId);
  if (sequence.error) {
    return sequence;
  }

  const { prefix, suffix, next, size } = sequence.data;

  const currentSequence = next.toString().padStart(size, "0");
  const derivedPrefix = interpolateSequenceDate(prefix);
  const derivedSuffix = interpolateSequenceDate(suffix);

  return {
    data: `${derivedPrefix}${currentSequence}${derivedSuffix}`,
    error: null
  };
}

export async function getCustomField(client: CarbonClient, id: string) {
  return client.from("customField").select("*").eq("id", id).single();
}

export async function getCustomFields(
  client: CarbonClient,
  table: string,
  companyId: string
) {
  return client
    .from("customFieldTables")
    .select("*")
    .eq("table", table)
    .eq("companyId", companyId)
    .single();
}

export async function getCustomFieldsTables(
  client: CarbonClient,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("customFieldTables")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getIntegration(
  client: CarbonClient,
  id: string,
  companyId: string
) {
  return client
    .from("companyIntegration")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .maybeSingle();
}

export async function getIntegrations(client: CarbonClient, companyId: string) {
  return client.from("integrations").select("*").eq("companyId", companyId);
}

export async function getKanbanOutputSetting(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("companySettings")
    .select("kanbanOutput")
    .eq("id", companyId)
    .single();
}

export async function getNextSequence(
  client: CarbonClient,
  table: string,
  companyId: string
) {
  return client.rpc("get_next_sequence", {
    sequence_name: table,
    company_id: companyId
  });
}

export async function getPlanById(client: CarbonClient, planId: string) {
  return client.from("plan").select("*").eq("id", planId).single();
}

export async function getPlans(client: CarbonClient) {
  return client.from("plan").select("*");
}

export async function getSequence(
  client: CarbonClient,
  table: string,
  companyId: string
) {
  return client
    .from("sequence")
    .select("*")
    .eq("table", table)
    .eq("companyId", companyId)
    .single();
}

export async function getSequences(
  client: CarbonClient,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("sequence")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getSequencesList(
  client: CarbonClient,
  table: string,
  companyId: string
) {
  return client
    .from("sequence")
    .select("id")
    .eq("table", table)
    .eq("companyId", companyId)
    .order("table");
}

export async function getSubsidiaries(
  client: CarbonClient,
  companyGroupId: string
) {
  return client
    .from("company")
    .select(
      "id, name, baseCurrencyCode, countryCode, parentCompanyId, isEliminationEntity, active"
    )
    .eq("companyGroupId", companyGroupId)
    .order("name");
}

export async function getSubsidiary(client: CarbonClient, companyId: string) {
  return client.from("company").select("*").eq("id", companyId).single();
}

export async function getTerms(client: CarbonClient, companyId: string) {
  return client.from("terms").select("*").eq("id", companyId).single();
}

export async function getDocumentTemplate(
  client: CarbonClient,
  companyId: string,
  documentType: DocumentTemplateType
) {
  return client
    .from("documentTemplate")
    .select("*")
    .eq("companyId", companyId)
    .eq("documentType", documentType)
    .maybeSingle();
}

/**
 * Load a stored document template as a `DocumentTemplate | null` ready to pass
 * to a PDF (which runs it through `resolveTemplate`). Returns null when no row
 * is stored, so the PDF falls back to the type's default.
 */
export async function getDocumentTemplateConfig(
  client: CarbonClient,
  companyId: string,
  documentType: DocumentTemplateType
): Promise<DocumentTemplate | null> {
  const stored = await getDocumentTemplate(client, companyId, documentType);
  return toDocumentTemplate(stored.data, documentType);
}

export async function upsertDocumentTemplate(
  client: CarbonClient,
  documentTemplate: {
    companyId: string;
    documentType: DocumentTemplateType;
    blocks: DocumentBlock[];
    theme: DocumentTheme;
    settings: DocumentSettings;
    headerSectionId: string | null;
    footerSectionId: string | null;
    createdBy: string;
    updatedBy: string;
  }
) {
  return client.from("documentTemplate").upsert(
    {
      ...documentTemplate,
      // Always persist the current schema version of the JSON we're writing.
      formatVersion: CURRENT_TEMPLATE_FORMAT_VERSION,
      updatedAt: new Date().toISOString()
    },
    { onConflict: "companyId,documentType" }
  );
}

export async function getDocumentSections(
  client: CarbonClient,
  companyId: string
) {
  return client
    .from("documentSection")
    .select("*")
    .eq("companyId", companyId)
    .order("name");
}

export async function getDocumentSection(
  client: CarbonClient,
  id: string,
  companyId: string
) {
  return client
    .from("documentSection")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .maybeSingle();
}

export async function getDocumentSectionsByIds(
  client: CarbonClient,
  companyId: string,
  ids: string[]
) {
  return client
    .from("documentSection")
    .select("*")
    .eq("companyId", companyId)
    .in("id", ids);
}

export async function upsertDocumentSection(
  client: CarbonClient,
  documentSection: {
    id?: string;
    companyId: string;
    name: string;
    placement: DocumentSectionPlacement;
    content: JSONContent;
    config?: Record<string, unknown>;
  } & ({ createdBy: string } | { updatedBy: string })
) {
  // Editing a system default forks it into a real row keyed by the same id, so
  // it overrides the built-in everywhere it's referenced. Upsert keeps repeat
  // edits idempotent (the row may or may not exist yet).
  if (documentSection.id && isBuiltInSectionId(documentSection.id)) {
    const actor =
      "createdBy" in documentSection
        ? documentSection.createdBy
        : documentSection.updatedBy;
    return client
      .from("documentSection")
      .upsert(
        {
          id: documentSection.id,
          companyId: documentSection.companyId,
          name: documentSection.name,
          placement: documentSection.placement,
          content: documentSection.content as Json,
          config: (documentSection.config ?? {}) as Json,
          createdBy: actor,
          updatedBy: actor,
          updatedAt: new Date().toISOString()
        },
        { onConflict: "id,companyId" }
      )
      .select("id");
  }

  if ("createdBy" in documentSection) {
    return client
      .from("documentSection")
      .insert({
        ...documentSection,
        content: documentSection.content as Json,
        config: (documentSection.config ?? {}) as Json
      })
      .select("id");
  }
  const { id, companyId, ...update } = documentSection;
  return client
    .from("documentSection")
    .update({
      ...update,
      content: update.content as Json,
      config: (update.config ?? {}) as Json,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id ?? "")
    .eq("companyId", companyId)
    .select("id");
}

export async function deleteDocumentSection(
  client: CarbonClient,
  id: string,
  companyId: string
) {
  return client
    .from("documentSection")
    .delete()
    .eq("id", id)
    .eq("companyId", companyId);
}

/** Fetch the given section ids and return them keyed by id for rendering. */
export async function resolveSections(
  client: CarbonClient,
  companyId: string,
  ids: string[]
): Promise<Record<string, ResolvedSection>> {
  if (ids.length === 0) return {};
  const map: Record<string, ResolvedSection> = {};

  // System sections live in code, not the DB. Seed them first so a stored row
  // with the same id (a customized/forked default) overrides below.
  for (const id of ids) {
    const builtIn = getBuiltInSection(id);
    if (builtIn) map[id] = builtIn;
  }

  const dbIds = ids.filter((id) => !map[id] || map[id]?.builtIn);
  const { data } = await getDocumentSectionsByIds(client, companyId, dbIds);
  for (const row of (data ?? []) as ResolvedSection[]) {
    map[row.id] = {
      id: row.id,
      name: row.name,
      placement: row.placement,
      content: row.content,
      config: row.config
    };
  }
  return map;
}

export async function getWebhook(client: CarbonClient, id: string) {
  return client.from("webhook").select("*").eq("id", id).single();
}

export async function getWebhooks(
  client: CarbonClient,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("webhook")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: true }
    ]);
  }

  return query;
}

export async function getWebhookTables(client: CarbonClient) {
  return client.from("webhookTable").select("*").order("name");
}

export async function insertCompany(
  client: CarbonClient,
  company: z.infer<typeof companyValidator>,
  companyGroupId?: string
) {
  return client
    .from("company")
    .insert({ ...company, companyGroupId })
    .select("id")
    .single();
}

export async function insertSubsidiary(
  client: CarbonClient,
  subsidiary: z.infer<typeof subsidiaryValidator> & {
    companyGroupId: string;
    createdBy: string;
    isEliminationEntity?: boolean;
  }
) {
  const { id: _, ...data } = subsidiary;
  return client.from("company").insert(data).select("id").single();
}

export async function updateSubsidiary(
  client: CarbonClient,
  id: string,
  subsidiary: Partial<z.infer<typeof subsidiaryValidator>> & {
    updatedBy: string;
  }
) {
  const { id: _, ...data } = subsidiary;
  return client.from("company").update(data).eq("id", id);
}

export async function seedCompany(
  _client: CarbonClient,
  companyId: string,
  userId: string,
  opts?: { parentCompanyId?: string; identityOnly?: boolean }
) {
  return invokeCarbonServiceFunction("seed-company", {
    body: {
      companyId,
      userId,
      parentCompanyId: opts?.parentCompanyId,
      identityOnly: opts?.identityOnly ?? false
    }
  });
}

export async function updateCompanyPlan(
  client: CarbonClient,
  data: {
    companyId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripeSubscriptionStatus: string;
    subscriptionStartDate: string;
  }
) {
  // Extract companyId and build the update data without it
  const { companyId, ...updateData } = data;

  return client.from("companyPlan").update(updateData).eq("id", companyId);
}

export async function updateDefaultCustomerCc(
  client: CarbonClient,
  companyId: string,
  defaultCustomerCc: string[]
) {
  return client
    .from("companySettings")
    .update({ defaultCustomerCc })
    .eq("companyId", companyId);
}

export async function updateCompany(
  client: CarbonClient,
  companyId: string,
  company: Partial<z.infer<typeof companyValidator>> & {
    updatedBy: string;
  }
) {
  return client.from("company").update(sanitize(company)).eq("id", companyId);
}

export async function updateShelfLifeSettings(
  client: CarbonClient,
  companyId: string,
  settings: {
    /** undefined disables expiry badges company-wide. */
    nearExpiryWarningDays: number | undefined;
    /** Seed for the "Shelf-life (days)" input on new items. */
    defaultShelfLifeDays: number;
    /** MIN expiry scope for Calculated-mode finished products. */
    calculatedInputScope: "AllInputs" | "ManagedInputsOnly";
    /** Policy enforced when an operator consumes an expired entity. */
    expiredEntityPolicy: "Warn" | "Block" | "BlockWithOverride";
  }
) {
  return client
    .from("companySettings")
    .update({
      inventoryShelfLife: {
        nearExpiryWarningDays: settings.nearExpiryWarningDays ?? null,
        defaultShelfLifeDays: settings.defaultShelfLifeDays,
        calculatedInputScope: settings.calculatedInputScope,
        expiredEntityPolicy: settings.expiredEntityPolicy
      }
    })
    .eq("id", companyId);
}

export async function updateDigitalQuoteSetting(
  client: CarbonClient,
  companyId: string,
  digitalQuoteEnabled: boolean,
  digitalQuoteNotificationGroup: string[],
  digitalQuoteIncludesPurchaseOrders: boolean
) {
  return client
    .from("companySettings")
    .update(
      sanitize({
        digitalQuoteEnabled,
        digitalQuoteNotificationGroup,
        digitalQuoteIncludesPurchaseOrders
      })
    )
    .eq("id", companyId);
}

export async function updateIntegrationMetadata(
  client: CarbonClient,
  companyId: string,
  integrationId: string,
  metadata: any,
  updatedBy?: string
) {
  return client
    .from("companyIntegration")
    .update(
      sanitize({
        metadata,
        updatedAt: new Date().toISOString(),
        updatedBy
      })
    )
    .eq("companyId", companyId)
    .eq("id", integrationId);
}

export async function updateAccountingEnabledSetting(
  client: CarbonClient,
  companyId: string,
  accountingEnabled: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ accountingEnabled }))
    .eq("id", companyId);
}

export async function updateAssetTaxDepreciationSettings(
  client: CarbonClient,
  companyId: string,
  settings: {
    assetTaxDepreciationEnabled: boolean;
    assetTaxRate: number | null;
  }
) {
  return client
    .from("companySettings")
    .update(sanitize(settings))
    .eq("id", companyId);
}

export async function updateTimeCardSetting(
  client: CarbonClient,
  companyId: string,
  timeCardEnabled: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ timeCardEnabled }))
    .eq("id", companyId);
}

export async function updateKanbanOutputSetting(
  client: CarbonClient,
  companyId: string,
  kanbanOutput: (typeof kanbanOutputTypes)[number]
) {
  return client
    .from("companySettings")
    .update(sanitize({ kanbanOutput }))
    .eq("id", companyId);
}

export async function updateLogoDark(
  client: CarbonClient,
  companyId: string,
  logoDark: string | null
) {
  return client
    .from("company")
    .update(
      sanitize({
        logoDark
      })
    )
    .eq("id", companyId);
}

export async function updateLogoDarkIcon(
  client: CarbonClient,
  companyId: string,
  logoDarkIcon: string | null
) {
  return client
    .from("company")
    .update(sanitize({ logoDarkIcon }))
    .eq("id", companyId);
}

export async function updateLogoLight(
  client: CarbonClient,
  companyId: string,
  logoLight: string | null
) {
  return client
    .from("company")
    .update(sanitize({ logoLight }))
    .eq("id", companyId);
}

export async function updateLogoLightIcon(
  client: CarbonClient,
  companyId: string,
  logoLightIcon: string | null
) {
  return client
    .from("company")
    .update(sanitize({ logoLightIcon }))
    .eq("id", companyId);
}

export async function updateLogoWatermark(
  client: CarbonClient,
  companyId: string,
  logoWatermark: string | null
) {
  return client
    .from("company")
    .update(sanitize({ logoWatermark }))
    .eq("id", companyId);
}

export async function updateMaintenanceDispatchNotificationSettings(
  client: CarbonClient,
  companyId: string,
  settings: {
    maintenanceDispatchNotificationGroup?: string[];
    qualityDispatchNotificationGroup?: string[];
    operationsDispatchNotificationGroup?: string[];
    otherDispatchNotificationGroup?: string[];
  }
) {
  return client
    .from("companySettings")
    .update(sanitize(settings))
    .eq("id", companyId);
}

export async function updateMaterialGeneratedIdsSetting(
  client: CarbonClient,
  companyId: string,
  materialGeneratedIds: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ materialGeneratedIds }))
    .eq("id", companyId);
}

export async function updateMetricSettings(
  client: CarbonClient,
  companyId: string,
  useMetric: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ useMetric }))
    .eq("id", companyId);
}

export async function updateProductLabelSize(
  client: CarbonClient,
  companyId: string,
  productLabelSize: string
) {
  return client
    .from("companySettings")
    .update(sanitize({ productLabelSize }))
    .eq("id", companyId);
}

export async function updatePurchasePriceUpdateTimingSetting(
  client: CarbonClient,
  companyId: string,
  purchasePriceUpdateTiming: (typeof purchasePriceUpdateTimingTypes)[number]
) {
  return client
    .from("companySettings")
    .update(sanitize({ purchasePriceUpdateTiming }))
    .eq("id", companyId);
}

export async function updateLeadTimesOnReceiptSetting(
  client: CarbonClient,
  companyId: string,
  updateLeadTimesOnReceipt: boolean
) {
  return (client.from("companySettings") as any)
    .update(sanitize({ updateLeadTimesOnReceipt }))
    .eq("id", companyId);
}

export async function updateAccountsPayableAddressSetting(
  client: CarbonClient,
  companyId: string,
  accountsPayableAddress: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ accountsPayableAddress }))
    .eq("id", companyId);
}

export async function updateAccountsReceivableAddressSetting(
  client: CarbonClient,
  companyId: string,
  accountsReceivableAddress: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ accountsReceivableAddress }))
    .eq("id", companyId);
}

export async function updateAccountsPayableEmail(
  client: CarbonClient,
  companyId: string,
  accountsPayableEmail: string | undefined
) {
  return client
    .from("companySettings")
    .update(sanitize({ accountsPayableEmail: accountsPayableEmail ?? null }))
    .eq("id", companyId);
}

export async function updateAccountsReceivableEmail(
  client: CarbonClient,
  companyId: string,
  accountsReceivableEmail: string | undefined
) {
  return client
    .from("companySettings")
    .update(
      sanitize({ accountsReceivableEmail: accountsReceivableEmail ?? null })
    )
    .eq("id", companyId);
}

export async function updateQuoteLineCategoryMarkups(
  client: CarbonClient,
  companyId: string,
  quoteLineCategoryMarkups: Record<string, number>
) {
  return client
    .from("companySettings")
    .update(sanitize({ quoteLineCategoryMarkups }))
    .eq("id", companyId);
}

export async function updateRfqReadySetting(
  client: CarbonClient,
  companyId: string,
  rfqReadyNotificationGroup: string[]
) {
  return client
    .from("companySettings")
    .update(sanitize({ rfqReadyNotificationGroup }))
    .eq("id", companyId);
}

export async function updateSequence(
  client: CarbonClient,
  table: string,
  companyId: string,
  sequence: Partial<z.infer<typeof sequenceValidator>> & {
    updatedBy: string;
  }
) {
  return client
    .from("sequence")
    .update(sanitize(sequence))
    .eq("companyId", companyId)
    .eq("table", table);
}

export async function updateSuggestionNotificationSetting(
  client: CarbonClient,
  companyId: string,
  suggestionNotificationGroup: string[]
) {
  return client
    .from("company")
    .update(sanitize({ suggestionNotificationGroup }))
    .eq("id", companyId);
}

export async function updateSupplierQuoteNotificationSetting(
  client: CarbonClient,
  companyId: string,
  supplierQuoteNotificationGroup: string[]
) {
  return client
    .from("companySettings")
    .update(sanitize({ supplierQuoteNotificationGroup }))
    .eq("id", companyId);
}

export async function upsertApiKey(
  client: CarbonClient,
  apiKey:
    | (Omit<z.infer<typeof apiKeyValidator>, "id" | "scopes" | "expiresAt"> & {
        createdBy: string;
        companyId: string;
        scopes: Record<string, string[]>;
        expiresAt?: string;
        rawKey: string;
        keyHash: string;
        keyPreview: string;
      })
    | (Omit<z.infer<typeof apiKeyValidator>, "id" | "scopes" | "expiresAt"> & {
        id: string;
        scopes: Record<string, string[]>;
        expiresAt?: string;
      })
) {
  if ("createdBy" in apiKey) {
    // Create: store the hash, return the raw key (caller generates both)
    // Strip rateLimit/rateLimitWindow — these are platform-controlled, not user-configurable
    const {
      scopes,
      expiresAt,
      rawKey,
      keyHash,
      rateLimit: _rl,
      rateLimitWindow: _rlw,
      ...rest
    } = apiKey as any;

    const result = await client
      .from("apiKey")
      .insert(
        sanitize({
          ...rest,
          keyHash,
          scopes: scopes as any,
          expiresAt: expiresAt || null
        }) as any
      )
      .select("id")
      .single();

    if (result.error) {
      return { data: null, error: result.error };
    }

    // Return the raw key (shown to user once, never stored)
    return { data: { key: rawKey, id: result.data.id }, error: null };
  }

  // Update: update name, scopes, expiration (never the key itself)
  // Strip rateLimit/rateLimitWindow — these are platform-controlled, not user-configurable
  const {
    scopes,
    expiresAt,
    rateLimit: _rl,
    rateLimitWindow: _rlw,
    ...rest
  } = apiKey as any;
  return client
    .from("apiKey")
    .update(
      sanitize({
        ...rest,
        scopes: scopes as any,
        expiresAt: expiresAt || null
      }) as any
    )
    .eq("id", apiKey.id);
}

export async function updateConsoleSetting(
  client: CarbonClient,
  companyId: string,
  consoleEnabled: boolean,
  userId?: string
) {
  const update = await client
    .from("companySettings")
    .update(sanitize({ consoleEnabled }) as any)
    .eq("id", companyId);

  // When enabling, create "Console Operator" employee type if it doesn't exist
  if (consoleEnabled) {
    const existing = await client
      .from("employeeType")
      .select("id")
      .eq("companyId", companyId)
      .eq("systemType", "Console Operator")
      .maybeSingle();

    if (!existing.data) {
      const newType = await client
        .from("employeeType")
        .insert({
          name: "Console Operator",
          companyId,
          protected: true,
          systemType: "Console Operator"
        })
        .select("id")
        .single();

      // Create default permissions for the Console Operator type.
      // Only grant what's needed for MES operations — not ERP modules.
      if (newType.data) {
        const mesModules = [
          {
            module: "Production",
            create: true,
            update: true,
            delete: false,
            view: true
          },
          {
            module: "Inventory",
            create: true,
            update: true,
            delete: false,
            view: true
          },
          {
            module: "Resources",
            create: false,
            update: false,
            delete: false,
            view: true
          },
          {
            module: "Items",
            create: false,
            update: false,
            delete: false,
            view: true
          },
          {
            module: "Quality",
            create: true,
            update: true,
            delete: false,
            view: true
          },
          {
            module: "People",
            create: false,
            update: false,
            delete: false,
            view: true
          }
        ];

        const permissions = mesModules.map((m) => ({
          employeeTypeId: newType.data.id,
          module: m.module as "Accounting",
          create: m.create ? [companyId] : [],
          update: m.update ? [companyId] : [],
          delete: m.delete ? [companyId] : [],
          view: m.view ? [companyId] : []
        }));

        await client.from("employeeTypePermission").insert(permissions);
      }
    }

    // Auto-generate a PIN for the enabling user if they don't have one
    let generatedPin: string | null = null;
    if (userId) {
      const userEmployee = await client
        .from("employee")
        .select("id, pin" as any)
        .eq("id", userId)
        .eq("companyId", companyId)
        .maybeSingle();

      if (userEmployee.data && !(userEmployee.data as any).pin) {
        generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
        await client
          .from("employee")
          .update({ pin: generatedPin } as any)
          .eq("id", userId)
          .eq("companyId", companyId);
      }
    }
  }

  return update;
}

export async function updateDefaultSupplierCc(
  client: CarbonClient,
  companyId: string,
  defaultSupplierCc: string[]
) {
  return client
    .from("companySettings")
    .update(sanitize({ defaultSupplierCc }))
    .eq("id", companyId);
}

export async function updateShowSupplierReadableIdSetting(
  client: CarbonClient,
  companyId: string,
  showSupplierReadableId: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ showSupplierReadableId }))
    .eq("id", companyId);
}

export async function updateShowCustomerReadableIdSetting(
  client: CarbonClient,
  companyId: string,
  showCustomerReadableId: boolean
) {
  return client
    .from("companySettings")
    .update(sanitize({ showCustomerReadableId }))
    .eq("id", companyId);
}

export async function upsertWebhook(
  client: CarbonClient,
  webhook:
    | (Omit<z.infer<typeof webhookValidator>, "id"> & {
        createdBy: string;
        companyId: string;
      })
    | (Omit<z.infer<typeof apiKeyValidator>, "id"> & {
        id: string;
      })
) {
  if ("createdBy" in webhook) {
    return client.from("webhook").insert(webhook).select("id").single();
  }
  return client.from("webhook").update(sanitize(webhook)).eq("id", webhook.id);
}
