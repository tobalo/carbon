import type {
  Json,
  QueryDatabase,
  EnumValue,
  glAccountClassEnum,
  glIncomeBalanceEnum,
  journalEntrySourceTypeEnum
} from "@carbon/database/schema";
import { getDateNYearsAgo, toStoredAmount } from "@carbon/utils";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { z } from "zod";
import { getNextSequence } from "~/modules/settings";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import type {
  accountValidator,
  costCenterValidator,
  currencyValidator,
  defaultBalanceSheetAccountValidator,
  defaultIncomeAcountValidator,
  dimensionValidator,
  fiscalYearSettingsValidator,
  intercompanyTransactionValidator,
  journalEntryLineValidator,
  journalEntryValidator,
  paymentTermValidator
} from "./accounting.models";
import type { Transaction, TranslatedBalance } from "./types";

/**
 * Sign multiplier for root account aggregation.
 * Asset and Revenue have normal debit balances and add to parent.
 * Liability, Equity, and Expense have normal credit balances and subtract.
 */
function rootSignMultiplier(accountClass: string | null): number {
  switch (accountClass) {
    case "Asset":
    case "Revenue":
      return 1;
    case "Liability":
    case "Equity":
    case "Expense":
      return -1;
    default:
      return 1;
  }
}

/**
 * Recalculates balance/balanceAtDate/netChange for system (root) accounts
 * using sign-aware aggregation based on direct children's account class.
 *
 * Standard accounting:
 *   Balance Sheet  = Assets − Liabilities − Equity   (should ≈ 0)
 *   Income Statement = Revenue − Expenses             (= Net Income)
 */
function applyRootSignCorrection<
  T extends {
    id: string;
    parentId: string | null;
    isSystem?: boolean | null;
    class: string | null;
    balance: number;
    balanceAtDate: number;
    netChange: number;
    translatedBalance?: number;
  }
>(accounts: T[]): T[] {
  const roots = accounts.filter((a) => a.isSystem ?? a.parentId === null);
  if (roots.length === 0) return accounts;

  const rootIds = new Set(roots.map((r) => r.id));
  const childrenByRoot = new Map<string, T[]>();

  for (const account of accounts) {
    if (account.parentId && rootIds.has(account.parentId)) {
      const list = childrenByRoot.get(account.parentId) ?? [];
      list.push(account);
      childrenByRoot.set(account.parentId, list);
    }
  }

  return accounts.map((account) => {
    if (!rootIds.has(account.id)) return account;

    const children = childrenByRoot.get(account.id) ?? [];
    let balance = 0;
    let balanceAtDate = 0;
    let netChange = 0;
    let translatedBalance = 0;

    for (const child of children) {
      const sign = rootSignMultiplier(child.class);
      balance += sign * child.balance;
      balanceAtDate += sign * child.balanceAtDate;
      netChange += sign * child.netChange;
      if (
        "translatedBalance" in child &&
        typeof child.translatedBalance === "number"
      ) {
        translatedBalance += sign * child.translatedBalance;
      }
    }

    const result = { ...account, balance, balanceAtDate, netChange };
    if ("translatedBalance" in account) {
      (result as T & { translatedBalance: number }).translatedBalance =
        translatedBalance;
    }
    return result;
  });
}

export async function getTrialBalance(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  companyId: string | null,
  args: {
    startDate: string | null;
    endDate: string | null;
  }
) {
  return client.rpc("trialBalance", {
    p_company_group_id: companyGroupId,
    p_company_id: companyId ?? undefined,
    from_date:
      args.startDate ?? getDateNYearsAgo(50).toISOString().split("T")[0],
    to_date: args.endDate ?? new Date().toISOString().split("T")[0]
  });
}

export async function getFinancialStatementBalances(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  companyId: string | null,
  args: {
    startDate: string | null;
    endDate: string | null;
  }
) {
  let accountsQuery = client
    .from("accounts")
    .select("*")
    .eq("companyGroupId", companyGroupId)
    .eq("active", true)
    .order("number", { ascending: true });

  const balancesQuery = client.rpc("accountTreeBalancesByCompany", {
    p_company_group_id: companyGroupId,
    p_company_id: companyId ?? undefined,
    from_date:
      args.startDate ?? getDateNYearsAgo(50).toISOString().split("T")[0],
    to_date: args.endDate ?? new Date().toISOString().split("T")[0]
  });

  const [accountsResponse, balancesResponse] = await Promise.all([
    accountsQuery,
    balancesQuery
  ]);

  if (accountsResponse.error) return accountsResponse;
  if (balancesResponse.error) return balancesResponse;

  const balancesByAccountId = (
    balancesResponse.data as unknown as (Transaction & { accountId: string })[]
  ).reduce<Record<string, Transaction>>((acc, row) => {
    acc[row.accountId] = {
      number: row.number,
      netChange: row.netChange,
      balance: row.balance,
      balanceAtDate: row.balanceAtDate
    };
    return acc;
  }, {});

  return {
    data: applyRootSignCorrection(
      (accountsResponse.data ?? [])
        .filter((a): a is typeof a & { id: string } => a.id !== null)
        .map((account) => ({
          ...account,
          netChange: balancesByAccountId[account.id]?.netChange ?? 0,
          balance: balancesByAccountId[account.id]?.balance ?? 0,
          balanceAtDate: balancesByAccountId[account.id]?.balanceAtDate ?? 0
        }))
    ),
    error: null
  };
}

export async function getCompaniesInGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string
) {
  return client
    .from("company")
    .select("id, name, baseCurrencyCode, parentCompanyId, isEliminationEntity")
    .eq("companyGroupId", companyGroupId)
    .eq("active", true)
    .eq("isEliminationEntity", false)
    .order("name", { ascending: true });
}

export async function deleteAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  accountId: string
) {
  return client.from("account").delete().eq("id", accountId);
}

export async function deletePaymentTerm(
  client: CarbonDatabaseClient<QueryDatabase>,
  paymentTermId: string
) {
  return client
    .from("paymentTerm")
    .update({ active: false })
    .eq("id", paymentTermId);
}

export async function getAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  accountId: string
) {
  return client.from("account").select("*").eq("id", accountId).single();
}

export async function getAccounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("account")
    .select("*", {
      count: "exact"
    })
    .eq("companyGroupId", companyGroupId)
    .eq("active", true);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getAccountsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  args?: {
    isGroup?: boolean | null;
    incomeBalance?: EnumValue<typeof glIncomeBalanceEnum> | null;
    classes?: EnumValue<typeof glAccountClassEnum>[];
  }
) {
  let query = client
    .from("account")
    .select("id, number, name, incomeBalance, class")
    .eq("companyGroupId", companyGroupId)
    .eq("active", true);

  if (args?.isGroup !== undefined && args.isGroup !== null) {
    query = query.eq("isGroup", args.isGroup);
  }

  if (args?.incomeBalance) {
    query = query.eq("incomeBalance", args.incomeBalance);
  }

  if (args?.classes && args.classes.length > 0) {
    query = query.in("class", args.classes);
  }

  query = query.order("number", { ascending: true });
  return query;
}

export async function getGroupAccounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string
) {
  return client
    .from("account")
    .select("id, number, name, incomeBalance, class, accountType")
    .eq("companyGroupId", companyGroupId)
    .eq("isGroup", true)
    .eq("active", true)
    .order("name", { ascending: true });
}

export async function getBaseCurrency(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  const { data: company, error } = await client
    .from("company")
    .select("baseCurrencyCode, companyGroupId")
    .eq("id", companyId)
    .single();

  if (error) {
    throw new Error(`Failed to get company: ${error.message}`);
  }

  if (!company || !company.baseCurrencyCode) {
    throw new Error("Company or base currency code not found");
  }

  return client
    .from("currency")
    .select("*")
    .eq("code", company.baseCurrencyCode)
    .eq("companyGroupId", company.companyGroupId!)
    .single();
}

export async function getChartOfAccounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  args: {
    incomeBalance: "Income Statement" | "Balance Sheet" | null;
    startDate: string | null;
    endDate: string | null;
  }
) {
  let accountsQuery = client
    .from("accounts")
    .select("*")
    .eq("companyGroupId", companyGroupId)
    .eq("active", true)
    .order("number", { ascending: true });

  if (args.incomeBalance) {
    accountsQuery = accountsQuery.eq("incomeBalance", args.incomeBalance);
  }

  const balancesQuery = client.rpc("accountTreeBalances", {
    p_company_group_id: companyGroupId,
    from_date:
      args.startDate ?? getDateNYearsAgo(50).toISOString().split("T")[0],
    to_date: args.endDate ?? new Date().toISOString().split("T")[0]
  });

  const [accountsResponse, balancesResponse] = await Promise.all([
    accountsQuery,
    balancesQuery
  ]);

  if (accountsResponse.error) return accountsResponse;
  if (balancesResponse.error) return balancesResponse;

  const balancesByAccountId = (
    balancesResponse.data as unknown as (Transaction & { accountId: string })[]
  ).reduce<Record<string, Transaction>>((acc, row) => {
    acc[row.accountId] = {
      number: row.number,
      netChange: row.netChange,
      balance: row.balance,
      balanceAtDate: row.balanceAtDate
    };
    return acc;
  }, {});

  return {
    data: applyRootSignCorrection(
      (accountsResponse.data ?? [])
        .filter((a): a is typeof a & { id: string } => a.id !== null)
        .map((account) => ({
          ...account,
          netChange: balancesByAccountId[account.id]?.netChange ?? 0,
          balance: balancesByAccountId[account.id]?.balance ?? 0,
          balanceAtDate: balancesByAccountId[account.id]?.balanceAtDate ?? 0
        }))
    ),
    error: null
  };
}

export async function getCurrency(
  client: CarbonDatabaseClient<QueryDatabase>,
  currencyId: string,
  companyGroupId: string
) {
  const currency = await client
    .from("currency")
    .select("*")
    .eq("id", currencyId)
    .eq("companyGroupId", companyGroupId)
    .single();

  if (currency.error || !currency.data) return currency;

  const currencyCode = await client
    .from("currencyCode")
    .select("name")
    .eq("code", currency.data.code)
    .single();

  if (currencyCode.error || !currencyCode.data) {
    return { ...currency, data: null, error: currencyCode.error };
  }

  return {
    ...currency,
    data: {
      ...currency.data,
      currencyCode: currencyCode.data
    }
  };
}

export async function getCurrencyByCode(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  currencyCode: string
) {
  return client
    .from("currencies")
    .select("*")
    .eq("code", currencyCode)
    .eq("companyGroupId", companyGroupId)
    .single();
}

export async function getCurrencies(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("currencies")
    .select("*", {
      count: "exact"
    })
    .eq("companyGroupId", companyGroupId)
    .eq("active", true);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  return query;
}

export async function getCurrenciesList(client: CarbonDatabaseClient<QueryDatabase>) {
  return client
    .from("currencyCode")
    .select("code, name")
    .order("name", { ascending: true });
}

export async function getCurrentAccountingPeriod(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  date: string
) {
  return client
    .from("accountingPeriod")
    .select("*")
    .eq("companyId", companyId)
    .lte("startDate", date)
    .gte("endDate", date)
    .single();
}

export async function getDefaultAccounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("accountDefault")
    .select("*")
    .eq("companyId", companyId)
    .single();
}

export async function getFiscalYearSettings(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("fiscalYearSettings")
    .select("*")
    .eq("companyId", companyId)
    .single();
}

export async function getPaymentTerm(
  client: CarbonDatabaseClient<QueryDatabase>,
  paymentTermId: string,
  companyId?: string
) {
  let query = client
    .from("paymentTerm")
    .select("*")
    .eq("id", paymentTermId);
  if (companyId) query = query.eq("companyId", companyId);
  return query.single();
}

export async function getPaymentTerms(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("paymentTerm")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("active", true);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getPaymentTermsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("paymentTerm")
    .select("id, name")
    .eq("companyId", companyId)
    .eq("active", true)
    .order("name", { ascending: true });
}

export async function updateDefaultBalanceSheetAccounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  defaultAccounts: z.infer<typeof defaultBalanceSheetAccountValidator> & {
    companyId: string;
    updatedBy: string;
  }
) {
  return client
    .from("accountDefault")
    .update(defaultAccounts)
    .eq("companyId", defaultAccounts.companyId);
}

export async function updateDefaultIncomeAccounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  defaultAccounts: z.infer<typeof defaultIncomeAcountValidator> & {
    companyId: string;
    updatedBy: string;
  }
) {
  return client
    .from("accountDefault")
    .update(defaultAccounts)
    .eq("companyId", defaultAccounts.companyId);
}

export async function updateFiscalYearSettings(
  client: CarbonDatabaseClient<QueryDatabase>,
  fiscalYearSettings: z.infer<typeof fiscalYearSettingsValidator> & {
    companyId: string;
    updatedBy: string;
  }
) {
  return client
    .from("fiscalYearSettings")
    .update(sanitize(fiscalYearSettings))
    .eq("companyId", fiscalYearSettings.companyId);
}

export async function upsertAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  account:
    | (Omit<z.infer<typeof accountValidator>, "id"> & {
        companyGroupId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof accountValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in account) {
    return client.from("account").insert([account]).select("*").single();
  }
  return client
    .from("account")
    .update(sanitize(account))
    .eq("id", account.id)
    .select("id")
    .single();
}

export async function upsertCurrency(
  client: CarbonDatabaseClient<QueryDatabase>,
  currency:
    | (Omit<z.infer<typeof currencyValidator>, "id"> & {
        companyGroupId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof currencyValidator>, "id"> & {
        id: string;
        companyGroupId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in currency) {
    return client.from("currency").insert([currency]).select("*").single();
  }
  return client
    .from("currency")
    .update(sanitize(currency))
    .eq("id", currency.id)
    .select("id")
    .single();
}

export async function upsertPaymentTerm(
  client: CarbonDatabaseClient<QueryDatabase>,
  paymentTerm:
    | (Omit<z.infer<typeof paymentTermValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof paymentTermValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in paymentTerm) {
    return client
      .from("paymentTerm")
      .insert([paymentTerm])
      .select("id")
      .single();
  }
  return client
    .from("paymentTerm")
    .update(sanitize(paymentTerm))
    .eq("id", paymentTerm.id)
    .select("id")
    .single();
}

export async function deleteCostCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  costCenterId: string
) {
  return client.from("costCenter").delete().eq("id", costCenterId);
}

export async function getCostCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  costCenterId: string
) {
  return client.from("costCenter").select("*").eq("id", costCenterId).single();
}

export async function getCostCenters(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("costCenter")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getCostCentersList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("costCenter")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export async function getCostCentersTree(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("costCenter")
    .select(
      "id, name, parentCostCenterId, ownerId, owner:user!costCenter_ownerId_fkey(fullName)"
    )
    .eq("companyId", companyId)
    .order("name");
}

export async function upsertCostCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  costCenter:
    | (Omit<z.infer<typeof costCenterValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof costCenterValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in costCenter) {
    return client.from("costCenter").insert([costCenter]).select("id").single();
  }
  return client
    .from("costCenter")
    .update(sanitize(costCenter))
    .eq("id", costCenter.id)
    .select("id")
    .single();
}

export async function getDimensions(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("dimension")
    .select("*", {
      count: "exact"
    })
    .eq("companyGroupId", companyGroupId)
    .eq("active", true);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  const dimensions = await query;
  if (dimensions.error || !dimensions.data) return dimensions;

  const dimensionIds = dimensions.data.map((dimension) => dimension.id);
  const dimensionValues =
    dimensionIds.length > 0
      ? await client
          .from("dimensionValue")
          .select("id, name, dimensionId")
          .in("dimensionId", dimensionIds)
          .eq("companyGroupId", companyGroupId)
      : { data: [], error: null };

  if (dimensionValues.error) {
    return { ...dimensions, data: [], error: dimensionValues.error };
  }

  const valuesByDimensionId = new Map<string, any[]>();
  (dimensionValues.data ?? []).forEach((dimensionValue) => {
    const values = valuesByDimensionId.get(dimensionValue.dimensionId) ?? [];
    values.push(dimensionValue);
    valuesByDimensionId.set(dimensionValue.dimensionId, values);
  });

  return {
    ...dimensions,
    data: dimensions.data.map((dimension) => ({
      ...dimension,
      dimensionValue: valuesByDimensionId.get(dimension.id) ?? []
    }))
  };
}

export async function getDimension(
  client: CarbonDatabaseClient<QueryDatabase>,
  dimensionId: string,
  companyGroupId: string
) {
  const dimension = await client
    .from("dimension")
    .select("*")
    .eq("id", dimensionId)
    .single();

  if (dimension.error || !dimension.data) return dimension;

  if (dimension.data.companyGroupId !== companyGroupId) {
    return {
      ...dimension,
      data: null,
      error: { message: "Dimension not found" }
    };
  }

  const dimensionValues = await client
    .from("dimensionValue")
    .select("id, name")
    .eq("dimensionId", dimensionId)
    .eq("companyGroupId", companyGroupId);

  if (dimensionValues.error) {
    return { ...dimension, data: null, error: dimensionValues.error };
  }

  return {
    ...dimension,
    data: {
      ...dimension.data,
      dimensionValue: dimensionValues.data ?? []
    }
  };
}

export async function upsertDimension(
  client: CarbonDatabaseClient<QueryDatabase>,
  dimension:
    | (Omit<z.infer<typeof dimensionValidator>, "id" | "dimensionValues"> & {
        companyGroupId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof dimensionValidator>, "id" | "dimensionValues"> & {
        id: string;
        updatedBy: string;
      }),
  dimensionValues?: string[]
) {
  let dimensionResult;

  if ("createdBy" in dimension) {
    dimensionResult = await client
      .from("dimension")
      .insert([dimension])
      .select("id, companyGroupId")
      .single();
  } else {
    dimensionResult = await client
      .from("dimension")
      .update(sanitize(dimension))
      .eq("id", dimension.id)
      .select("id, companyGroupId")
      .single();
  }

  if (dimensionResult.error) return dimensionResult;

  if (dimension.entityType === "Custom" && dimensionValues !== undefined) {
    const dimensionId = dimensionResult.data.id;
    const companyGroupId = dimensionResult.data.companyGroupId;

    const existing = await client
      .from("dimensionValue")
      .select("id, name")
      .eq("dimensionId", dimensionId);

    if (existing.error) return existing;

    const existingNames = new Set((existing.data ?? []).map((v) => v.name));
    const desiredNames = new Set(dimensionValues);

    const toDelete = (existing.data ?? [])
      .filter((v) => !desiredNames.has(v.name))
      .map((v) => v.id);

    if (toDelete.length > 0) {
      const deleteResult = await client
        .from("dimensionValue")
        .delete()
        .in("id", toDelete);
      if (deleteResult.error) return deleteResult;
    }

    const toInsert = dimensionValues
      .filter((name) => !existingNames.has(name))
      .map((name) => ({
        dimensionId,
        name,
        companyGroupId,
        createdBy:
          "createdBy" in dimension ? dimension.createdBy : dimension.updatedBy
      }));

    if (toInsert.length > 0) {
      const insertResult = await client.from("dimensionValue").insert(toInsert);
      if (insertResult.error) return insertResult;
    }
  }

  return dimensionResult;
}

export async function deleteDimension(
  client: CarbonDatabaseClient<QueryDatabase>,
  dimensionId: string
) {
  return client
    .from("dimension")
    .update({ active: false })
    .eq("id", dimensionId);
}

export async function getActiveDimensionsWithValues(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  companyId: string
) {
  const dimensionsResult = await client
    .from("dimension")
    .select("id, name, entityType, required")
    .eq("companyGroupId", companyGroupId)
    .eq("active", true)
    .order("name");

  if (dimensionsResult.error) return dimensionsResult;

  const dimensions = dimensionsResult.data ?? [];

  const customDimensionIds = dimensions
    .filter((d) => d.entityType === "Custom")
    .map((d) => d.id);

  const entityTypes = [
    ...new Set(
      dimensions
        .filter((d) => d.entityType !== "Custom")
        .map((d) => d.entityType)
    )
  ];

  const [customValues, ...entityResults] = await Promise.all([
    customDimensionIds.length > 0
      ? client
          .from("dimensionValue")
          .select("id, name, dimensionId")
          .in("dimensionId", customDimensionIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; dimensionId: string }[],
          error: null
        }),
    ...entityTypes.map((et) => getEntityDimensionValues(client, et, companyId))
  ]);

  if (customValues.error) return customValues;

  const entityValuesByType = new Map<string, { id: string; name: string }[]>();
  entityTypes.forEach((et, i) => {
    const result = entityResults[i];
    if (result && !result.error && result.data) {
      entityValuesByType.set(et, result.data as { id: string; name: string }[]);
    }
  });

  const customValuesByDimension = new Map<
    string,
    { id: string; name: string }[]
  >();
  for (const v of customValues.data ?? []) {
    const existing = customValuesByDimension.get(v.dimensionId) ?? [];
    existing.push({ id: v.id, name: v.name });
    customValuesByDimension.set(v.dimensionId, existing);
  }

  return {
    data: dimensions.map((d) => ({
      dimensionId: d.id,
      dimensionName: d.name,
      entityType: d.entityType,
      required: d.required,
      values:
        d.entityType === "Custom"
          ? (customValuesByDimension.get(d.id) ?? [])
          : (entityValuesByType.get(d.entityType) ?? [])
    })),
    error: null
  };
}

function getEntityDimensionValues(
  client: CarbonDatabaseClient<QueryDatabase>,
  entityType: string,
  companyId: string
) {
  switch (entityType) {
    case "Location":
      return client
        .from("location")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    case "Department":
      return client
        .from("department")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    case "Employee":
      return client
        .from("employeeSummary")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    case "CustomerType":
      return client
        .from("customerType")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    case "SupplierType":
      return client
        .from("supplierType")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    case "ItemPostingGroup":
      return client
        .from("itemPostingGroup")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    case "CostCenter":
      return client
        .from("costCenter")
        .select("id, name")
        .eq("companyId", companyId)
        .order("name");
    default:
      return Promise.resolve({
        data: [] as { id: string; name: string }[],
        error: null
      });
  }
}

export async function getJournalLineDimensions(
  client: CarbonDatabaseClient<QueryDatabase>,
  journalLineIds: string[]
) {
  if (journalLineIds.length === 0) {
    return {
      data: {} as Record<
        string,
        {
          dimensionId: string;
          dimensionName: string;
          valueId: string;
          valueName: string;
        }[]
      >,
      error: null
    };
  }

  const result = await client
    .from("journalLineDimension")
    .select(
      "journalLineId, dimensionId, valueId, dimension:dimensionId(name, entityType)"
    )
    .in("journalLineId", journalLineIds);

  if (result.error) return { data: null, error: result.error };

  const rows = result.data as unknown as Array<{
    journalLineId: string;
    dimensionId: string;
    valueId: string;
    dimension: { name: string; entityType: string };
  }>;

  // Collect all valueIds grouped by entityType for batch resolution
  const valueIdsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    const et = row.dimension.entityType;
    if (!valueIdsByType.has(et)) valueIdsByType.set(et, new Set());
    valueIdsByType.get(et)!.add(row.valueId);
  }

  // Resolve value names in parallel
  const valueNameMap = new Map<string, string>();

  const resolutions = await Promise.all(
    Array.from(valueIdsByType.entries()).map(async ([entityType, valueIds]) => {
      const ids = [...valueIds];
      if (entityType === "Custom") {
        const res = await client
          .from("dimensionValue")
          .select("id, name")
          .in("id", ids);
        return res.data ?? [];
      }
      const res = await getEntityValuesByIds(client, entityType, ids);
      return res.data ?? [];
    })
  );

  for (const batch of resolutions) {
    for (const item of batch as { id: string; name: string }[]) {
      valueNameMap.set(item.id, item.name);
    }
  }

  // Group by journalLineId
  const grouped: Record<
    string,
    {
      dimensionId: string;
      dimensionName: string;
      valueId: string;
      valueName: string;
    }[]
  > = {};
  for (const row of rows) {
    if (!grouped[row.journalLineId]) grouped[row.journalLineId] = [];
    grouped[row.journalLineId].push({
      dimensionId: row.dimensionId,
      dimensionName: row.dimension.name,
      valueId: row.valueId,
      valueName: valueNameMap.get(row.valueId) ?? row.valueId
    });
  }

  return { data: grouped, error: null };
}

function getEntityValuesByIds(
  client: CarbonDatabaseClient<QueryDatabase>,
  entityType: string,
  ids: string[]
) {
  switch (entityType) {
    case "Location":
      return client.from("location").select("id, name").in("id", ids);
    case "Department":
      return client.from("department").select("id, name").in("id", ids);
    case "Employee":
      return client.from("employeeSummary").select("id, name").in("id", ids);
    case "CustomerType":
      return client.from("customerType").select("id, name").in("id", ids);
    case "SupplierType":
      return client.from("supplierType").select("id, name").in("id", ids);
    case "ItemPostingGroup":
      return client.from("itemPostingGroup").select("id, name").in("id", ids);
    case "CostCenter":
      return client.from("costCenter").select("id, name").in("id", ids);
    default:
      return Promise.resolve({
        data: [] as { id: string; name: string }[],
        error: null
      });
  }
}

export async function saveJournalLineDimensions(
  client: CarbonDatabaseClient<QueryDatabase>,
  journalLineId: string,
  companyId: string,
  dimensions: Array<{ dimensionId: string; valueId: string }>
) {
  const deleteResult = await client
    .from("journalLineDimension")
    .delete()
    .eq("journalLineId", journalLineId);

  if (deleteResult.error) return deleteResult;

  if (dimensions.length === 0) return { data: null, error: null };

  return client.from("journalLineDimension").insert(
    dimensions.map((d) => ({
      journalLineId,
      dimensionId: d.dimensionId,
      valueId: d.valueId,
      companyId
    }))
  );
}

export async function translateCompanyBalances(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  companyId: string,
  targetCurrency: string,
  periodEnd: string,
  periodStart?: string
): Promise<{
  data: TranslatedBalance[] | null;
  cta: number;
  error: string | null;
}> {
  const { data, error } = await client.rpc("translateTrialBalance", {
    p_company_group_id: companyGroupId,
    p_company_id: companyId ?? undefined,
    p_target_currency: targetCurrency,
    p_period_end: periodEnd,
    p_period_start: periodStart ?? undefined
  });

  if (error) {
    return { data: null, cta: 0, error: error.message };
  }

  const rows = (data ?? []) as unknown as TranslatedBalance[];

  // Look up each account's class to compute CTA
  const accountIds = rows.map((r) => r.accountId);
  const { data: accounts } = await client
    .from("account")
    .select("id, class")
    .in("id", accountIds);

  const classById = new Map((accounts ?? []).map((a) => [a.id, a.class]));

  let totalTranslatedAssets = 0;
  let totalTranslatedLiabilitiesAndEquity = 0;

  for (const row of rows) {
    const cls = classById.get(row.accountId);
    if (cls === "Asset") {
      totalTranslatedAssets += Number(row.translatedBalance);
    } else {
      // Liability, Equity, Revenue, Expense (but income statement
      // accounts net to retained earnings on balance sheet)
      totalTranslatedLiabilitiesAndEquity += Number(row.translatedBalance);
    }
  }

  // CTA = translated assets - translated (liabilities + equity)
  // A balanced sheet means assets = liabilities + equity + CTA
  const cta = totalTranslatedAssets - totalTranslatedLiabilitiesAndEquity;

  return { data: rows, cta, error: null };
}

export async function getConsolidatedBalances(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  companyIds: string[],
  targetCurrency: string,
  periodEnd: string,
  periodStart?: string
) {
  // Find elimination entities that should be included automatically.
  // An elimination entity is included when its parentCompanyId is an ancestor
  // of any selected company (i.e. it sits at or above the selected companies
  // in the hierarchy and captures their intercompany eliminations).
  const { data: allGroupCompanies } = await client
    .from("company")
    .select("id, parentCompanyId, isEliminationEntity")
    .eq("companyGroupId", companyGroupId)
    .eq("active", true);

  const groupCompanies = allGroupCompanies ?? [];
  const companyById = new Map(groupCompanies.map((c) => [c.id, c]));
  const selectedCompanyIds = companyIds.filter((id) => companyById.has(id));
  const selectedSet = new Set(selectedCompanyIds);

  // Collect all ancestors of selected companies
  const ancestors = new Set<string>();
  for (const id of selectedCompanyIds) {
    let current = companyById.get(id);
    while (current?.parentCompanyId) {
      ancestors.add(current.parentCompanyId);
      current = companyById.get(current.parentCompanyId);
    }
  }

  // Include elimination entities whose parent is an ancestor of (or is) a
  // selected company — these hold the reversing entries for IC transactions
  const eliminationIds = groupCompanies
    .filter(
      (c) =>
        c.isEliminationEntity &&
        c.parentCompanyId &&
        (ancestors.has(c.parentCompanyId) || selectedSet.has(c.parentCompanyId))
    )
    .map((c) => c.id);

  // All companies whose balances we need (operating + elimination entities)
  const allIds = [...selectedCompanyIds, ...eliminationIds];

  // Get balances for all companies and translate to target currency
  const [allBalances, translations] = await Promise.all([
    Promise.all(
      allIds.map((id) =>
        getFinancialStatementBalances(client, companyGroupId, id, {
          startDate: periodStart ?? null,
          endDate: periodEnd
        })
      )
    ),
    Promise.all(
      allIds.map((id) =>
        translateCompanyBalances(
          client,
          companyGroupId,
          id,
          targetCurrency,
          periodEnd,
          periodStart
        )
      )
    )
  ]);

  // Build a map of translated balances per account, summed across companies
  const translationByAccount = new Map<
    string,
    { translatedBalance: number; exchangeRate: number }
  >();

  for (const translation of translations) {
    if (!translation.data) continue;
    for (const row of translation.data) {
      const existing = translationByAccount.get(row.accountId);
      if (existing) {
        existing.translatedBalance += Number(row.translatedBalance);
      } else {
        translationByAccount.set(row.accountId, {
          translatedBalance: Number(row.translatedBalance),
          exchangeRate: Number(row.exchangeRate)
        });
      }
    }
  }

  // Sum CTA across all companies
  const totalCta = translations.reduce((sum, t) => sum + t.cta, 0);

  // Merge all company balances into one set of accounts, summing balances
  const accountMap = new Map<
    string,
    {
      balance: number;
      balanceAtDate: number;
      netChange: number;
      translatedBalance: number;
      exchangeRate: number;
    }
  >();

  for (const result of allBalances) {
    if (result.error || !result.data) continue;
    for (const account of result.data) {
      const existing = accountMap.get(account.id);
      if (existing) {
        existing.balance += account.balance ?? 0;
        existing.balanceAtDate += account.balanceAtDate ?? 0;
        existing.netChange += account.netChange ?? 0;
      } else {
        accountMap.set(account.id, {
          balance: account.balance ?? 0,
          balanceAtDate: account.balanceAtDate ?? 0,
          netChange: account.netChange ?? 0,
          translatedBalance: 0,
          exchangeRate: 0
        });
      }
    }
  }

  // Overlay translated values
  for (const [accountId, translation] of translationByAccount) {
    const account = accountMap.get(accountId);
    if (account) {
      account.translatedBalance = translation.translatedBalance;
      account.exchangeRate = translation.exchangeRate;
    }
  }

  // Use the first company's account structure as the base (shared chart of accounts)
  const baseAccounts = allBalances.find((r) => r.data)?.data ?? [];

  const consolidated = baseAccounts.map((account: any) => {
    const summed = accountMap.get(account.id);
    return {
      ...account,
      balance: summed?.balance ?? 0,
      balanceAtDate: summed?.balanceAtDate ?? 0,
      netChange: summed?.netChange ?? 0,
      translatedBalance: summed?.translatedBalance ?? 0,
      exchangeRate: summed?.exchangeRate ?? 0
    };
  });

  return { data: applyRootSignCorrection(consolidated), cta: totalCta };
}

// -- Intercompany --

export async function getIntercompanyTransactions(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  args: GenericQueryFilters & { status: string | null }
) {
  let query = client
    .from("intercompanyTransaction")
    .select(
      "*, sourceCompany:company!intercompanyTransaction_sourceCompanyId_fkey(name), targetCompany:company!intercompanyTransaction_targetCompanyId_fkey(name)",
      { count: "exact" }
    )
    .eq("companyGroupId", companyGroupId);

  if (args.status) {
    query = query.eq("status", args.status);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "createdAt", ascending: false }
  ]);
  return query;
}

export async function createIntercompanyTransaction(
  client: CarbonDatabaseClient<QueryDatabase>,
  input: z.infer<typeof intercompanyTransactionValidator> & {
    companyGroupId: string;
    userId: string;
  }
) {
  const today = new Date().toISOString().split("T")[0];
  const postingDate = input.postingDate || today;
  const now = new Date().toISOString();
  const companyIds = [
    ...new Set([input.sourceCompanyId, input.targetCompanyId])
  ];
  const accountIds = [
    ...new Set([input.debitAccountId, input.creditAccountId])
  ];

  const companies = await client
    .from("company")
    .select("id")
    .in("id", companyIds)
    .eq("companyGroupId", input.companyGroupId);

  if (companies.error) return companies;
  if ((companies.data ?? []).length !== companyIds.length) {
    return {
      data: null,
      error: {
        message: "Intercompany companies must belong to this company group"
      }
    };
  }

  const accounts = await client
    .from("account")
    .select("id")
    .in("id", accountIds)
    .eq("companyGroupId", input.companyGroupId);

  if (accounts.error) return accounts;
  if ((accounts.data ?? []).length !== accountIds.length) {
    return {
      data: null,
      error: {
        message: "Intercompany accounts must belong to this company group"
      }
    };
  }

  const nextSequence = await getNextSequence(
    client,
    "journalEntry",
    input.sourceCompanyId
  );
  if (nextSequence.error) return nextSequence;

  // Create the journal entry on the source company
  const journal = await client
    .from("journal")
    .insert({
      id: crypto.randomUUID(),
      journalEntryId: nextSequence.data,
      description: `IC: ${input.description}`,
      companyId: input.sourceCompanyId,
      postingDate,
      status: "Posted",
      postedAt: now,
      postedBy: input.userId,
      createdAt: now,
      createdBy: input.userId
    })
    .select("id")
    .single();

  if (journal.error) return journal;

  const journalId = journal.data.id;
  const journalLineRef = crypto.randomUUID();

  // Insert debit and credit journal lines
  const journalLines = await client
    .from("journalLine")
    .insert([
      {
        id: crypto.randomUUID(),
        journalId,
        accountId: input.debitAccountId,
        description: input.description,
        amount: input.amount,
        journalLineReference: journalLineRef,
        intercompanyPartnerId: input.targetCompanyId,
        companyId: input.sourceCompanyId,
        createdAt: now,
        accrual: false,
        quantity: 0
      },
      {
        id: crypto.randomUUID(),
        journalId,
        accountId: input.creditAccountId,
        description: input.description,
        amount: -input.amount,
        journalLineReference: journalLineRef,
        intercompanyPartnerId: input.targetCompanyId,
        companyId: input.sourceCompanyId,
        createdAt: now,
        accrual: false,
        quantity: 0
      }
    ])
    .select("id");

  if (journalLines.error) return journalLines;
  if (!journalLines.data?.[0]?.id) {
    return {
      data: null,
      error: { message: "Failed to create intercompany journal lines" }
    };
  }

  // Create intercompany transaction record
  return client
    .from("intercompanyTransaction")
    .insert({
      id: crypto.randomUUID(),
      companyGroupId: input.companyGroupId,
      sourceCompanyId: input.sourceCompanyId,
      targetCompanyId: input.targetCompanyId,
      sourceJournalLineId: journalLines.data[0].id,
      amount: input.amount,
      currencyCode: input.currencyCode,
      description: input.description,
      status: "Unmatched",
      createdAt: now
    })
    .select("id")
    .single();
}

export async function runIntercompanyMatching(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string
) {
  return client.rpc("matchIntercompanyTransactions", {
    p_company_group_id: companyGroupId
  });
}

export async function generateEliminations(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  userId: string
) {
  return client.rpc("generateEliminationEntries", {
    p_company_group_id: companyGroupId,
    p_user_id: userId
  });
}

export async function getIntercompanyBalance(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string
) {
  return client.rpc("getIntercompanyBalance", {
    p_company_group_id: companyGroupId
  });
}

export async function getExchangeRateHistory(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyGroupId: string,
  currencyCode: string
) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return client
    .from("exchangeRateHistory")
    .select("effectiveDate, rate")
    .eq("companyGroupId", companyGroupId)
    .eq("currencyCode", currencyCode)
    .gte("effectiveDate", sixMonthsAgo.toISOString().split("T")[0])
    .order("effectiveDate", { ascending: true });
}

// -- Journal Entries --
// Uses existing journal/journalLine tables with added status/entryType columns.
// Manual JEs start as Draft and are posted by flipping status to Posted.
// amount > 0 = debit, amount < 0 = credit.

export async function getJournalEntries(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null; status: string | null }
) {
  let query = client
    .from("journalEntries")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `journalEntryId.ilike.%${args.search}%,description.ilike.%${args.search}%`
    );
  }

  if (args.status) {
    query = query.eq("status", args.status as "Draft" | "Posted" | "Reversed");
  }

  query = setGenericQueryFilters(query, args, [
    { column: "createdAt", ascending: false }
  ]);

  return query;
}

export async function getJournalEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const journal = await client
    .from("journal")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();

  if (journal.error || !journal.data) return journal;

  const journalLines = await client
    .from("journalLine")
    .select("*")
    .eq("journalId", id)
    .eq("companyId", companyId);

  if (journalLines.error) {
    return { ...journal, data: null, error: journalLines.error };
  }

  const accountIds = Array.from(
    new Set(
      (journalLines.data ?? []).map((line) => line.accountId).filter(Boolean)
    )
  );
  const accounts =
    accountIds.length > 0
      ? await client
          .from("account")
          .select("id, class")
          .in("id", accountIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (accounts.error) {
    return { ...journal, data: null, error: accounts.error };
  }

  const accountsById = new Map(
    (accounts.data ?? []).map((account) => [account.id, account])
  );

  return {
    ...journal,
    data: {
      ...journal.data,
      journalLine: (journalLines.data ?? []).map((line) => ({
        ...line,
        account: accountsById.get(line.accountId) ?? null
      }))
    }
  };
}

export async function createJournalEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: z.infer<typeof journalEntryValidator> & {
    journalEntryId: string;
    sourceType: EnumValue<typeof journalEntrySourceTypeEnum>;
    companyId: string;
    createdBy: string;
  }
) {
  const { id: _id, ...rest } = data;
  return client
    .from("journal")
    .insert({
      ...rest,
      status: "Draft" as const
    })
    .select("id")
    .single();
}

export async function updateJournalEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  data: z.infer<typeof journalEntryValidator> & {
    updatedBy: string;
  }
) {
  const { id: _id, ...rest } = data;
  return client
    .from("journal")
    .update(sanitize(rest))
    .eq("id", id)
    .eq("status", "Draft");
}

export async function deleteJournalEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("journal").delete().eq("id", id).eq("status", "Draft");
}

export async function upsertJournalEntryLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  data:
    | (z.infer<typeof journalEntryLineValidator> & {
        journalId: string;
        companyId: string;
        companyGroupId: string;
      })
    | (z.infer<typeof journalEntryLineValidator> & {
        id: string;
        updatedBy: string;
        companyGroupId: string;
      })
) {
  const account = await client
    .from("account")
    .select("class")
    .eq("id", data.accountId)
    .single();

  if (account.error || !account.data?.class) {
    return { data: null, error: { message: "Account not found" } };
  }

  const amount = toStoredAmount(
    data.debit ?? 0,
    data.credit ?? 0,
    account.data.class
  );

  if ("companyId" in data) {
    return client
      .from("journalLine")
      .insert({
        journalId: data.journalId,
        accountId: data.accountId,
        description: data.description,
        amount,
        journalLineReference: crypto.randomUUID(),
        companyId: data.companyId
      })
      .select("id")
      .single();
  } else {
    return client
      .from("journalLine")
      .update(
        sanitize({
          accountId: data.accountId,
          description: data.description,
          amount,
          updatedBy: data.updatedBy
        })
      )
      .eq("id", data.id)
      .select("id")
      .single();
  }
}

export async function deleteJournalEntryLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("journalLine").delete().eq("id", id);
}

export async function saveJournalEntryWithLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: {
    journalEntryId: string;
    postingDate: string;
    description?: string;
    updatedBy: string;
    lines: Array<{
      accountId: string;
      description?: string;
      debit: number;
      credit: number;
      dimensions?: Array<{ dimensionId: string; valueId: string }>;
    }>;
    companyId: string;
    companyGroupId: string;
  }
) {
  // 1. Update journal header
  const headerUpdate = await client
    .from("journal")
    .update(
      sanitize({
        postingDate: data.postingDate,
        description: data.description,
        updatedBy: data.updatedBy
      })
    )
    .eq("id", data.journalEntryId)
    .eq("status", "Draft");

  if (headerUpdate.error) return headerUpdate;

  // 2. Delete existing lines (cascades journalLineDimension via FK)
  const deleteResult = await client
    .from("journalLine")
    .delete()
    .eq("journalId", data.journalEntryId);

  if (deleteResult.error) return deleteResult;

  if (data.lines.length === 0) return { data: null, error: null };

  // 3. Look up account classes for all distinct account IDs
  const accountIds = [...new Set(data.lines.map((l) => l.accountId))];
  const accounts = await client
    .from("account")
    .select("id, class")
    .in("id", accountIds);

  if (accounts.error) return accounts;

  const accountMap = new Map(accounts.data.map((a) => [a.id, a.class]));

  // 4. Build insert payloads
  const inserts = data.lines.map((line) => {
    const accountClass = accountMap.get(line.accountId);
    if (!accountClass) {
      throw new Error(`Account not found: ${line.accountId}`);
    }
    return {
      journalId: data.journalEntryId,
      accountId: line.accountId,
      description: line.description,
      amount: toStoredAmount(line.debit, line.credit, accountClass),
      journalLineReference: crypto.randomUUID(),
      companyId: data.companyId
    };
  });

  // 5. Insert all lines and get new IDs
  const insertResult = await client
    .from("journalLine")
    .insert(inserts)
    .select("id");

  if (insertResult.error) return insertResult;

  // 6. Insert dimensions from client state
  const newLineIds = (insertResult.data ?? []).map((l) => l.id);
  const dimensionInserts: Array<{
    journalLineId: string;
    dimensionId: string;
    valueId: string;
    companyId: string;
  }> = [];

  for (let i = 0; i < newLineIds.length; i++) {
    const lineDims = data.lines[i]?.dimensions;
    if (lineDims) {
      for (const d of lineDims) {
        dimensionInserts.push({
          journalLineId: newLineIds[i],
          dimensionId: d.dimensionId,
          valueId: d.valueId,
          companyId: data.companyId
        });
      }
    }
  }

  if (dimensionInserts.length > 0) {
    const dimInsertResult = await client
      .from("journalLineDimension")
      .insert(dimensionInserts);
    if (dimInsertResult.error) return dimInsertResult;
  }

  return insertResult;
}

export async function postJournalEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string,
  userId: string
) {
  // 1. Fetch entry + lines
  const entry = await getJournalEntry(client, id, companyId);
  if (entry.error) return entry;
  if (entry.data.status !== "Draft") {
    return {
      data: null,
      error: { message: "Journal entry is not in Draft status" }
    };
  }

  const lines = entry.data.journalLine ?? [];
  if (lines.length === 0) {
    return { data: null, error: { message: "Journal entry has no lines" } };
  }

  // 2. Validate balance (sum of amounts should be 0)
  const total = lines.reduce((sum: any, l: any) => sum + Number(l.amount), 0);

  if (Math.abs(total) > 0.001) {
    return {
      data: null,
      error: { message: "Total debits must equal total credits" }
    };
  }

  // 3. Flip status — lines are already in journalLine, no copying needed
  return client
    .from("journal")
    .update({
      status: "Posted" as const,
      postedAt: new Date().toISOString(),
      postedBy: userId,
      updatedBy: userId
    })
    .eq("id", id)
    .eq("companyId", companyId)
    .select("id")
    .single();
}

export async function reverseJournalEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  data: {
    journalEntryId: string;
    companyId: string;
    userId: string;
  }
) {
  // 1. Fetch original
  const original = await getJournalEntry(client, id, data.companyId);
  if (original.error) return original;
  if (original.data.status !== "Posted") {
    return {
      data: null,
      error: { message: "Can only reverse posted journal entries" }
    };
  }

  // 2. Create reversing entry as Posted
  const reversed = await client
    .from("journal")
    .insert({
      journalEntryId: data.journalEntryId,
      companyId: data.companyId,
      description: `Reversal of ${original.data.journalEntryId}`,
      postingDate: new Date().toISOString().split("T")[0],
      sourceType: "Manual" as const,
      reversalOfId: id,
      status: "Posted" as const,
      postedAt: new Date().toISOString(),
      postedBy: data.userId,
      createdBy: data.userId
    })
    .select("id")
    .single();

  if (reversed.error) return reversed;

  // 3. Copy lines with negated amounts
  const lines = (original.data.journalLine ?? []).map((line: any) => ({
    journalId: reversed.data.id,
    accountId: line.accountId,
    companyId: line.companyId,
    description: line.description,
    amount: -Number(line.amount),
    journalLineReference: crypto.randomUUID()
  }));

  if (lines.length > 0) {
    const linesResult = await client.from("journalLine").insert(lines);
    if (linesResult.error) return linesResult;
  }

  // 4. Mark original as Reversed and store back-reference
  const updateResult = await client
    .from("journal")
    .update({
      status: "Reversed" as const,
      reversedById: reversed.data.id,
      updatedBy: data.userId
    })
    .eq("id", id)
    .eq("companyId", data.companyId);

  if (updateResult.error) return updateResult;

  return reversed;
}
