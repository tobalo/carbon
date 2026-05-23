import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPostgresConnectionPool } from "./postgres.ts";
import {
  accountDefaults,
  accounts,
  currencies,
  customerStatuses,
  dimensions,
  failureModes,
  fiscalYearSettings,
  gaugeTypes,
  getGroupId,
  groups,
  nonConformanceRequiredActions,
  nonConformanceTypes,
  paymentTerms,
  scrapReasons,
  sequences,
  unitOfMeasures
} from "./seed.data.ts";

type SeedCompanyArgs = {
  companyId: string;
  userId: string;
  parentCompanyId?: string | null;
};

type CompanyRow = {
  id: string;
  name: string;
  companyGroupId: string | null;
  baseCurrencyCode: string;
  countryCode: string | null;
};

type ModuleRow = {
  name: string;
};

let seedCompanyPool: Pool | null = null;

export async function seedCompany(args: SeedCompanyArgs) {
  const { companyId, userId, parentCompanyId = null } = args;

  if (!companyId) throw new Error("Payload is missing companyId");
  if (!userId) throw new Error("Payload is missing userId");

  const pool = getSeedCompanyPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await seedCompanyInTransaction(client, {
      companyId,
      userId,
      parentCompanyId
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeSeedCompanyPool() {
  if (!seedCompanyPool) return;
  await seedCompanyPool.end();
  seedCompanyPool = null;
}

function getSeedCompanyPool() {
  seedCompanyPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return seedCompanyPool;
}

async function seedCompanyInTransaction(
  client: PoolClient,
  args: Required<SeedCompanyArgs>
) {
  const company = await queryOne<CompanyRow>(
    client,
    `SELECT id, name, "companyGroupId", "baseCurrencyCode", "countryCode"
     FROM "company"
     WHERE id = $1`,
    [args.companyId]
  );

  if (!company) throw new Error("Company not found");

  await ensureSystemUser(client);
  await ensureCurrencyCodes(client);

  let companyGroupId = company.companyGroupId;
  const isNewGroup = !companyGroupId && !args.parentCompanyId;

  if (args.parentCompanyId && !companyGroupId) {
    const parent = await queryOne<{ companyGroupId: string | null }>(
      client,
      `SELECT "companyGroupId" FROM "company" WHERE id = $1`,
      [args.parentCompanyId]
    );

    if (!parent?.companyGroupId) {
      throw new Error("Parent company has no group");
    }

    companyGroupId = parent.companyGroupId;
  }

  if (isNewGroup) {
    companyGroupId = nanoid();
    await client.query(
      `INSERT INTO "companyGroup" (id, name, "createdAt", "createdBy", "ownerId")
       VALUES ($1, $2, NOW(), $3, $3)`,
      [companyGroupId, company.name, args.userId]
    );

    await client.query(
      `UPDATE "company" SET "companyGroupId" = $1 WHERE id = $2`,
      [companyGroupId, args.companyId]
    );
  }

  if (!companyGroupId) {
    throw new Error("Company group could not be resolved");
  }

  if (args.parentCompanyId) {
    await client.query(
      `UPDATE "company"
       SET "companyGroupId" = $1, "parentCompanyId" = $2
       WHERE id = $3`,
      [companyGroupId, args.parentCompanyId, args.companyId]
    );
  }

  await seedCompanyMembership(client, args.companyId, args.userId);
  await seedCompanyGroups(client, args.companyId);

  const employeeTypeId = await seedAdminEmployeeType(client, args.companyId);
  const modules = await seedAdminPermissions(client, employeeTypeId, args.companyId);

  await seedEmployee(client, args.companyId, args.userId, employeeTypeId);
  await seedCompanyLookups(client, args.companyId);

  const accountIdByNumber = isNewGroup
    ? await seedSharedAccountingData(client, companyGroupId, args.userId)
    : await getExistingAccountIds(client, companyGroupId);

  await seedAccountDefaults(client, args.companyId, accountIdByNumber);
  await seedFiscalYearSettings(client, args.companyId);
  await updateUserPermissions(client, args.userId, args.companyId, modules);

  if (args.parentCompanyId) {
    await ensureEliminationEntity(client, {
      parentCompanyId: args.parentCompanyId,
      companyGroupId,
      fallbackCompany: company
    });
  }

  return { success: true };
}

async function ensureSystemUser(client: PoolClient) {
  await client.query(
    `INSERT INTO "user" (
       id, email, "firstName", "lastName", "fullName", about,
       "acknowledgedITAR", "isConsoleOperator", flags, "createdAt", active
     )
     VALUES (
       'system', 'system@carbon.local', 'System', '', 'System', '',
       true, false, '{}'::jsonb, NOW(), false
     )
     ON CONFLICT (id) DO NOTHING`
  );
}

export async function ensureCurrencyCodes(client: PoolClient) {
  for (const currency of currencies) {
    await client.query(
      `INSERT INTO "currencyCode" (code, name)
       VALUES ($1, $1)
       ON CONFLICT (code) DO NOTHING`,
      [currency.code]
    );
  }
}

async function seedCompanyMembership(
  client: PoolClient,
  companyId: string,
  userId: string
) {
  const existing = await queryOne<{ exists: boolean }>(
    client,
    `SELECT true AS exists
     FROM "userToCompany"
     WHERE "userId" = $1 AND "companyId" = $2
     LIMIT 1`,
    [userId, companyId]
  );

  if (existing) return;

  await client.query(
    `INSERT INTO "userToCompany" ("userId", "companyId", role)
     VALUES ($1, $2, $3::role)`,
    [userId, companyId, "employee"]
  );
}

async function seedCompanyGroups(client: PoolClient, companyId: string) {
  for (const group of groups) {
    await client.query(
      `INSERT INTO "group" (
         id, name, "companyId", "createdAt",
         "isCustomerTypeGroup", "isEmployeeTypeGroup", "isSupplierTypeGroup",
         "isCustomerOrgGroup", "isSupplierOrgGroup", "isIdentityGroup"
       )
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, false, false, false)
       ON CONFLICT (id) DO NOTHING`,
      [
        getGroupId(group.idPrefix, companyId),
        group.name,
        companyId,
        group.isCustomerTypeGroup,
        group.isEmployeeTypeGroup,
        group.isSupplierTypeGroup
      ]
    );
  }
}

async function seedAdminEmployeeType(client: PoolClient, companyId: string) {
  const existing = await queryOne<{ id: string }>(
    client,
    `SELECT id
     FROM "employeeType"
     WHERE "companyId" = $1 AND "systemType" = to_jsonb('Admin'::text)
     LIMIT 1`,
    [companyId]
  );

  if (existing?.id) return existing.id;

  const id = nanoid();
  await client.query(
    `INSERT INTO "employeeType" (
       id, name, "companyId", "createdAt", "updatedAt", protected, "systemType"
     )
     VALUES ($1, 'Admin', $2, NOW(), NOW(), true, to_jsonb('Admin'::text))`,
    [id, companyId]
  );

  return id;
}

async function seedAdminPermissions(
  client: PoolClient,
  employeeTypeId: string,
  companyId: string
) {
  const modules = await queryMany<ModuleRow>(
    client,
    `SELECT name::text AS name FROM "modules" ORDER BY name`
  );

  for (const module of modules) {
    await client.query(
      `INSERT INTO "employeeTypePermission" (
         "employeeTypeId", module, "create", "update", "delete", view,
         "createdAt", "updatedAt"
       )
       VALUES ($1, $2::module, $3, $3, $3, $3, NOW(), NOW())`,
      [employeeTypeId, module.name, [companyId]]
    );
  }

  return modules;
}

async function seedEmployee(
  client: PoolClient,
  companyId: string,
  userId: string,
  employeeTypeId: string
) {
  await client.query(
    `INSERT INTO "employee" (id, "employeeTypeId", "companyId", active)
     VALUES ($1, $2, $3, true)`,
    [userId, employeeTypeId, companyId]
  );
}

async function seedCompanyLookups(client: PoolClient, companyId: string) {
  for (const name of customerStatuses) {
    await client.query(
      `INSERT INTO "customerStatus" (
         id, name, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3, NOW(), 'system')`,
      [nanoid(), name, companyId]
    );
  }

  for (const name of scrapReasons) {
    await client.query(
      `INSERT INTO "scrapReason" (id, name, "companyId", "createdAt", "createdBy")
       VALUES ($1, $2, $3, NOW(), 'system')`,
      [nanoid(), name, companyId]
    );
  }

  for (const term of paymentTerms) {
    await client.query(
      `INSERT INTO "paymentTerm" (
         id, name, "daysDue", "calculationMethod", "daysDiscount",
         "discountPercentage", active, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3, $4::"paymentTermCalculationMethod", $5, $6, true, $7, NOW(), 'system')`,
      [
        nanoid(),
        term.name,
        term.daysDue,
        term.calculationMethod,
        term.daysDiscount,
        term.discountPercentage,
        companyId
      ]
    );
  }

  for (const unit of unitOfMeasures) {
    await client.query(
      `INSERT INTO "unitOfMeasure" (
         id, name, code, active, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3, true, $4, NOW(), 'system')`,
      [nanoid(), unit.name, unit.code, companyId]
    );
  }

  for (const name of gaugeTypes) {
    await client.query(
      `INSERT INTO "gaugeType" (
         id, name, "companyId", "createdAt", "createdBy", "customFields"
       )
       VALUES ($1, $2, $3, NOW(), 'system', '{}'::jsonb)`,
      [nanoid(), name, companyId]
    );
  }

  for (const name of failureModes) {
    await client.query(
      `INSERT INTO "maintenanceFailureMode" (
         id, name, type, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, 'Maintenance'::"maintenanceFailureModeType", $3, NOW(), 'system')`,
      [nanoid(), name, companyId]
    );
  }

  for (const type of nonConformanceTypes) {
    await client.query(
      `INSERT INTO "nonConformanceType" (
         id, name, "companyId", "createdAt", "createdBy", "customFields"
       )
       VALUES ($1, $2, $3, NOW(), 'system', '{}'::jsonb)`,
      [nanoid(), type.name, companyId]
    );
  }

  for (const action of nonConformanceRequiredActions) {
    const systemType = "systemType" in action ? action.systemType : null;
    await client.query(
      `INSERT INTO "nonConformanceRequiredAction" (
         id, name, active, "systemType", "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, true, $3::jsonb, $4, NOW(), 'system')`,
      [
        nanoid(),
        action.name,
        systemType === null ? null : JSON.stringify(systemType),
        companyId
      ]
    );
  }

  for (const sequence of sequences) {
    await client.query(
      `INSERT INTO "sequence" (
         id, "table", name, prefix, suffix, next, size, step, "companyId"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        nanoid(),
        sequence.table,
        sequence.name,
        sequence.prefix,
        sequence.suffix,
        sequence.next,
        sequence.size,
        sequence.step,
        companyId
      ]
    );
  }
}

async function seedSharedAccountingData(
  client: PoolClient,
  companyGroupId: string,
  userId: string
) {
  for (const currency of currencies) {
    await client.query(
      `INSERT INTO "currency" (
         id, code, "exchangeRate", "decimalPlaces", active,
         "companyGroupId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3, $4, true, $5, NOW(), 'system')`,
      [
        nanoid(),
        currency.code,
        currency.exchangeRate,
        currency.decimalPlaces,
        companyGroupId
      ]
    );
  }

  const accountIdByKey: Record<string, string> = {};
  const accountIdByNumber: Record<string, string> = {};

  for (const account of accounts as readonly Record<string, unknown>[]) {
    const key = stringOrNull(account.key) ?? stringOrNull(account.number);
    const parentKey = stringOrNull(account.parentKey);
    const id = nanoid();
    const number = stringOrNull(account.number);
    const incomeBalance = requiredString(account.incomeBalance, "incomeBalance");
    const accountClass = stringOrNull(account.class);

    await client.query(
      `INSERT INTO "account" (
         id, number, name, active, "isGroup", "accountType", class,
         "consolidatedRate", "incomeBalance", "parentId", "isSystem",
         "companyGroupId", "createdAt", "createdBy"
       )
       VALUES (
         $1, $2, $3, true, $4, $5::"accountType", $6::"glAccountClass",
         $7::"glConsolidatedRate", $8::"glIncomeBalance", $9, $10,
         $11, NOW(), $12
       )`,
      [
        id,
        number,
        requiredString(account.name, "name"),
        isGroupAccount(account),
        stringOrNull(account.accountType) ?? stringOrNull(account.accountCategory),
        accountClass,
        stringOrNull(account.consolidatedRate) ??
          inferConsolidatedRate(incomeBalance, accountClass),
        incomeBalance,
        parentKey ? (accountIdByKey[parentKey] ?? null) : null,
        booleanOrDefault(account.isSystem, false),
        companyGroupId,
        userId
      ]
    );

    if (key) accountIdByKey[key] = id;
    if (number) accountIdByNumber[number] = id;
  }

  for (const dimension of dimensions) {
    await client.query(
      `INSERT INTO "dimension" (
         id, name, "entityType", active, required,
         "companyGroupId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3::"dimensionEntityType", true, false, $4, NOW(), $5)`,
      [nanoid(), dimension.name, dimension.entityType, companyGroupId, userId]
    );
  }

  return accountIdByNumber;
}

async function getExistingAccountIds(client: PoolClient, companyGroupId: string) {
  const rows = await queryMany<{ id: string; number: string | null }>(
    client,
    `SELECT id, number FROM "account" WHERE "companyGroupId" = $1`,
    [companyGroupId]
  );

  return rows.reduce<Record<string, string>>((acc, row) => {
    if (row.number) acc[row.number] = row.id;
    return acc;
  }, {});
}

async function seedAccountDefaults(
  client: PoolClient,
  companyId: string,
  accountIdByNumber: Record<string, string>
) {
  const defaults = accountDefaults as Record<string, string | undefined>;
  const resolve = (column: string, number?: string) => {
    if (!number) throw new Error(`Missing account default mapping for ${column}`);
    const accountId = accountIdByNumber[number];
    if (!accountId) {
      throw new Error(`Missing seeded account ${number} for ${column}`);
    }
    return accountId;
  };

  const values = [
    resolve("accumulatedDepreciationAccount", defaults.accumulatedDepreciationAccount),
    resolve(
      "accumulatedDepreciationOnDisposalAccount",
      defaults.accumulatedDepreciationOnDisposalAccount
    ),
    resolve("assetAquisitionCostAccount", defaults.assetAquisitionCostAccount),
    resolve(
      "assetAquisitionCostOnDisposalAccount",
      defaults.assetAquisitionCostOnDisposalAccount
    ),
    resolve(
      "assetDepreciationExpenseAccount",
      defaults.assetDepreciationExpenseAccount
    ),
    resolve("assetGainsAndLossesAccount", defaults.assetGainsAndLossesAccount),
    resolve("bankCashAccount", defaults.bankCashAccount),
    resolve("bankForeignCurrencyAccount", defaults.bankForeignCurrencyAccount),
    resolve("bankLocalCurrencyAccount", defaults.bankLocalCurrencyAccount),
    companyId,
    resolve("costOfGoodsSoldAccount", defaults.costOfGoodsSoldAccount),
    resolve(
      "currencyTranslationAccount",
      defaults.currencyTranslationAccount ?? defaults.retainedEarningsAccount
    ),
    resolve(
      "customerPaymentDiscountAccount",
      defaults.customerPaymentDiscountAccount
    ),
    resolve(
      "goodsReceivedNotInvoicedAccount",
      defaults.goodsReceivedNotInvoicedAccount ??
        defaults.inventoryReceivedNotInvoicedAccount
    ),
    resolve(
      "indirectCostAccount",
      defaults.indirectCostAccount ??
        defaults.overheadCostAppliedAccount ??
        defaults.directCostAppliedAccount
    ),
    resolve("interestAccount", defaults.interestAccount),
    resolve("inventoryAccount", defaults.inventoryAccount),
    resolve(
      "inventoryAdjustmentVarianceAccount",
      defaults.inventoryAdjustmentVarianceAccount
    ),
    resolve(
      "inventoryShippedNotInvoicedAccount",
      defaults.inventoryShippedNotInvoicedAccount
    ),
    defaults.laborAbsorptionAccount
      ? resolve("laborAbsorptionAccount", defaults.laborAbsorptionAccount)
      : resolve("laborAbsorptionAccount", defaults.directCostAppliedAccount),
    resolve(
      "laborAndMachineVarianceAccount",
      defaults.laborAndMachineVarianceAccount ?? defaults.capacityVarianceAccount
    ),
    resolve(
      "lotSizeVarianceAccount",
      defaults.lotSizeVarianceAccount ?? defaults.capacityVarianceAccount
    ),
    resolve("maintenanceAccount", defaults.maintenanceAccount),
    resolve("materialVarianceAccount", defaults.materialVarianceAccount),
    resolve(
      "overheadVarianceAccount",
      defaults.overheadVarianceAccount ?? defaults.overheadAccount
    ),
    resolve("payablesAccount", defaults.payablesAccount),
    resolve("prepaymentAccount", defaults.prepaymentAccount),
    resolve("purchaseTaxPayableAccount", defaults.purchaseTaxPayableAccount),
    resolve("purchaseVarianceAccount", defaults.purchaseVarianceAccount),
    resolve("receivablesAccount", defaults.receivablesAccount),
    resolve("retainedEarningsAccount", defaults.retainedEarningsAccount),
    resolve(
      "reverseChargeSalesTaxPayableAccount",
      defaults.reverseChargeSalesTaxPayableAccount
    ),
    resolve("roundingAccount", defaults.roundingAccount),
    resolve("salesAccount", defaults.salesAccount),
    resolve("salesDiscountAccount", defaults.salesDiscountAccount),
    resolve("salesTaxPayableAccount", defaults.salesTaxPayableAccount),
    resolve("serviceChargeAccount", defaults.serviceChargeAccount),
    resolve(
      "subcontractingVarianceAccount",
      defaults.subcontractingVarianceAccount ?? defaults.purchaseVarianceAccount
    ),
    resolve(
      "supplierPaymentDiscountAccount",
      defaults.supplierPaymentDiscountAccount
    ),
    resolve("workInProgressAccount", defaults.workInProgressAccount)
  ];

  await client.query(
    `INSERT INTO "accountDefault" (
       "accumulatedDepreciationAccount",
       "accumulatedDepreciationOnDisposalAccount",
       "assetAquisitionCostAccount",
       "assetAquisitionCostOnDisposalAccount",
       "assetDepreciationExpenseAccount",
       "assetGainsAndLossesAccount",
       "bankCashAccount",
       "bankForeignCurrencyAccount",
       "bankLocalCurrencyAccount",
       "companyId",
       "costOfGoodsSoldAccount",
       "currencyTranslationAccount",
       "customerPaymentDiscountAccount",
       "goodsReceivedNotInvoicedAccount",
       "indirectCostAccount",
       "interestAccount",
       "inventoryAccount",
       "inventoryAdjustmentVarianceAccount",
       "inventoryShippedNotInvoicedAccount",
       "laborAbsorptionAccount",
       "laborAndMachineVarianceAccount",
       "lotSizeVarianceAccount",
       "maintenanceAccount",
       "materialVarianceAccount",
       "overheadVarianceAccount",
       "payablesAccount",
       "prepaymentAccount",
       "purchaseTaxPayableAccount",
       "purchaseVarianceAccount",
       "receivablesAccount",
       "retainedEarningsAccount",
       "reverseChargeSalesTaxPayableAccount",
       "roundingAccount",
       "salesAccount",
       "salesDiscountAccount",
       "salesTaxPayableAccount",
       "serviceChargeAccount",
       "subcontractingVarianceAccount",
       "supplierPaymentDiscountAccount",
       "workInProgressAccount"
     )
     VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})`,
    values
  );
}

async function seedFiscalYearSettings(client: PoolClient, companyId: string) {
  await client.query(
    `INSERT INTO "fiscalYearSettings" (
       "startMonth", "taxStartMonth", "companyId", "updatedBy"
     )
     VALUES ($1::month, $2::month, $3, 'system')`,
    [
      fiscalYearSettings.startMonth,
      fiscalYearSettings.taxStartMonth,
      companyId
    ]
  );
}

async function updateUserPermissions(
  client: PoolClient,
  userId: string,
  companyId: string,
  modules: ModuleRow[]
) {
  const current = await queryOne<{ permissions: Record<string, string[]> | null }>(
    client,
    `SELECT permissions FROM "userPermission" WHERE id = $1`,
    [userId]
  );
  const permissions = { ...(current?.permissions ?? {}) };

  for (const { name } of modules) {
    const moduleName = name.toLowerCase();
    for (const action of ["view", "create", "update", "delete"]) {
      const key = `${moduleName}_${action}`;
      const values = permissions[key] ?? [];
      permissions[key] = values.includes(companyId)
        ? values
        : [...values, companyId];
    }
  }

  await client.query(
    `INSERT INTO "userPermission" (id, permissions)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions`,
    [userId, JSON.stringify(permissions)]
  );
}

async function ensureEliminationEntity(
  client: PoolClient,
  args: {
    parentCompanyId: string;
    companyGroupId: string;
    fallbackCompany: CompanyRow;
  }
) {
  const existing = await queryOne<{ exists: boolean }>(
    client,
    `SELECT true AS exists
     FROM "company"
     WHERE "companyGroupId" = $1
       AND "parentCompanyId" = $2
       AND "isEliminationEntity" = true
     LIMIT 1`,
    [args.companyGroupId, args.parentCompanyId]
  );

  if (existing) return;

  const parent = await queryOne<{
    name: string;
    baseCurrencyCode: string;
    countryCode: string | null;
  }>(
    client,
    `SELECT name, "baseCurrencyCode", "countryCode"
     FROM "company"
     WHERE id = $1`,
    [args.parentCompanyId]
  );

  await client.query(
    `INSERT INTO "company" (
       id, name, active, "auditLogEnabled", "baseCurrencyCode",
       "countryCode", "createdAt", "isEliminationEntity",
       "parentCompanyId", "companyGroupId", "suggestionNotificationGroup"
     )
     VALUES ($1, $2, true, false, $3, $4, NOW(), true, $5, $6, ARRAY[]::text[])`,
    [
      nanoid(),
      `Elimination - ${parent?.name ?? "Unknown"}`,
      parent?.baseCurrencyCode ?? args.fallbackCompany.baseCurrencyCode,
      parent?.countryCode ?? args.fallbackCompany.countryCode,
      args.parentCompanyId,
      args.companyGroupId
    ]
  );
}

async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  params: unknown[] = []
) {
  const result = await client.query<T>(text, params);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  params: unknown[] = []
) {
  const result = await client.query<T>(text, params);
  return result.rows;
}

function isGroupAccount(account: Record<string, unknown>) {
  const directPosting = account.directPosting;
  if (typeof account.isGroup === "boolean") return account.isGroup;
  return typeof directPosting === "boolean" ? !directPosting : false;
}

function inferConsolidatedRate(incomeBalance: string, accountClass: string | null) {
  if (incomeBalance === "Income Statement") return "Average";
  if (accountClass === "Equity") return "Historical";
  return "Current";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredString(value: unknown, label: string) {
  const result = stringOrNull(value);
  if (!result) throw new Error(`Seed account is missing ${label}`);
  return result;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
