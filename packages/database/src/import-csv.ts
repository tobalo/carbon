import { parse } from "csv-parse/sync";
import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

const EXTERNAL_ID_KEY = "csv";
const DEFAULT_FACTOR = "Hours/Piece";

const tableValidator = z.enum([
  "consumable",
  "customer",
  "customerContact",
  "fixture",
  "material",
  "methodMaterial",
  "part",
  "supplier",
  "supplierContact",
  "tool",
  "workCenter",
  "process"
]);

export const importCsvArgsValidator = z.object({
  table: tableValidator,
  filePath: z.string(),
  columnMappings: z.record(z.string()),
  enumMappings: z.record(z.record(z.string())).optional(),
  companyId: z.string(),
  userId: z.string()
});

export const importCsvRowsArgsValidator = importCsvArgsValidator
  .omit({ filePath: true })
  .extend({
    records: z.array(z.record(z.string()))
  });

type ImportCsvArgs = z.infer<typeof importCsvArgsValidator>;
type ImportCsvRowsArgs = z.infer<typeof importCsvRowsArgsValidator>;
type ImportTable = z.infer<typeof tableValidator>;
type Row = Record<string, unknown>;

let importCsvPool: Pool | null = null;

export async function importCsv(args: ImportCsvArgs) {
  const { downloadObject } = await import("@carbon/storage");
  const bytes = await downloadObject({
    companyId: args.companyId,
    key: args.filePath
  });
  if (!bytes) throw new Error("Failed to download file");

  const csvText = new TextDecoder().decode(bytes);
  const records = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true
  }) as Record<string, string>[];

  return importCsvRows({
    table: args.table,
    records,
    columnMappings: args.columnMappings,
    enumMappings: args.enumMappings,
    companyId: args.companyId,
    userId: args.userId
  });
}

export async function importCsvRows(args: ImportCsvRowsArgs) {
  if (args.table === "methodMaterial") {
    throw new Error("Not implemented");
  }

  const pool = getImportCsvPool();
  const client = await pool.connect();
  const mappedRecords = mapCsvRecords(args);

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    switch (args.table) {
      case "customer":
        await importCustomerLike(client, {
          table: "customer",
          taxTable: "customerTax",
          taxForeignKey: "customerId",
          entityType: "customer",
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId
        });
        break;
      case "supplier":
        await importCustomerLike(client, {
          table: "supplier",
          taxTable: "supplierTax",
          taxForeignKey: "supplierId",
          entityType: "supplier",
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId
        });
        break;
      case "material":
      case "consumable":
      case "tool":
      case "fixture":
      case "part":
        await importItemLike(client, {
          table: args.table,
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId
        });
        break;
      case "customerContact":
        await importContactLike(client, {
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId,
          parentEntityType: "customer",
          parentForeignKey: "customerId",
          joinTable: "customerContact",
          isCustomer: true
        });
        break;
      case "supplierContact":
        await importContactLike(client, {
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId,
          parentEntityType: "supplier",
          parentForeignKey: "supplierId",
          joinTable: "supplierContact",
          isCustomer: false
        });
        break;
      case "workCenter":
        await importWorkCenters(client, {
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId
        });
        break;
      case "process":
        await importProcesses(client, {
          records: mappedRecords,
          companyId: args.companyId,
          userId: args.userId
        });
        break;
      default:
        assertNever(args.table);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeImportCsvPool() {
  if (!importCsvPool) return;
  await importCsvPool.end();
  importCsvPool = null;
}

function getImportCsvPool() {
  importCsvPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return importCsvPool;
}

function mapCsvRecords(args: ImportCsvRowsArgs) {
  const enumMappings = args.enumMappings ?? {};

  return args.records.map((row) => {
    const record: Record<string, string> = {};
    for (const [targetColumn, sourceColumn] of Object.entries(
      args.columnMappings
    )) {
      if (targetColumn in enumMappings) {
        const csvValue = row[sourceColumn] ?? "";
        record[targetColumn] =
          enumMappings[targetColumn]?.[csvValue] ??
          enumMappings[targetColumn]?.Default ??
          "";
      } else if (sourceColumn && sourceColumn !== "N/A") {
        record[targetColumn] = row[sourceColumn] ?? "";
      }
    }

    for (const [targetColumn, mapping] of Object.entries(enumMappings)) {
      if (!(targetColumn in record)) {
        record[targetColumn] = mapping.Default ?? "";
      }
    }

    return record;
  });
}

async function importCustomerLike(
  client: PoolClient,
  args: {
    table: "customer" | "supplier";
    taxTable: "customerTax" | "supplierTax";
    taxForeignKey: "customerId" | "supplierId";
    entityType: "customer" | "supplier";
    records: Record<string, string>[];
    companyId: string;
    userId: string;
  }
) {
  const externalIdMap = await getCsvExternalIdMap(
    client,
    args.entityType,
    args.companyId
  );
  const seen = new Set<string>();
  const inserts: Row[] = [];
  const insertExternalIds: string[] = [];
  const updates: { id: string; data: Row }[] = [];
  const taxRecords: { entityId: string; taxId?: string | null }[] = [];

  for (const record of args.records) {
    const { id, taxId, ...rest } = record;
    if (!id || seen.has(id) || !record.name?.trim()) continue;
    seen.add(id);

    const base = cleanRow({
      ...rest,
      taxPercent: toNumber(rest.taxPercent, 0)
    });

    const existingId = externalIdMap.get(id);
    if (existingId) {
      updates.push({
        id: existingId,
        data: {
          ...base,
          updatedAt: new Date(),
          updatedBy: args.userId
        }
      });
      taxRecords.push({ entityId: existingId, taxId });
      continue;
    }

    const entityId = nanoid();
    inserts.push({
      id: entityId,
      ...base,
      embedding: zeroEmbedding(),
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId
    });
    insertExternalIds.push(id);
    taxRecords.push({ entityId, taxId });
  }

  await insertRows(client, args.table, inserts);

  for (const update of updates) {
    await updateById(client, args.table, update.id, update.data);
  }

  await upsertCsvMappings(
    client,
    args.entityType,
    inserts.map((row, index) => ({
      entityId: String(row.id),
      externalId: insertExternalIds[index] ?? ""
    })),
    args.companyId,
    args.userId
  );
  await upsertTaxIdentifiers(client, {
    table: args.taxTable,
    foreignKey: args.taxForeignKey,
    records: taxRecords,
    companyId: args.companyId,
    userId: args.userId
  });
}

async function importItemLike(
  client: PoolClient,
  args: {
    table: "material" | "consumable" | "tool" | "fixture" | "part";
    records: Record<string, string>[];
    companyId: string;
    userId: string;
  }
) {
  const externalIdMap = await getCsvExternalIdMap(client, "item", args.companyId);
  const seen = new Set<string>();
  const itemInserts: Row[] = [];
  const insertExternalIds: string[] = [];
  const itemUpdates: { id: string; data: Row }[] = [];
  const materialDataByReadableId = new Map<string, Record<string, string>>();
  const materialUpdates: { id: string; data: Row }[] = [];

  for (const record of args.records) {
    if (!record.id || !record.readableId || !record.name) continue;
    const revision = record.revision || "0";
    const readableIdWithRevision = getReadableIdWithRevision(
      record.readableId,
      revision
    );
    if (seen.has(readableIdWithRevision)) continue;
    seen.add(readableIdWithRevision);

    const externalId = `${args.table}:${record.id}`;
    const itemData = cleanRow({
      readableId: record.readableId,
      readableIdWithRevision,
      revision,
      name: record.name,
      description: record.description,
      active: parseBoolean(record.active, true),
      unitOfMeasureCode: record.unitOfMeasureCode,
      replenishmentSystem: record.replenishmentSystem || "Buy",
      defaultMethodType: record.defaultMethodType,
      itemTrackingType: record.itemTrackingType || "Inventory"
    });
    const existingId = externalIdMap.get(externalId);

    if (existingId) {
      itemUpdates.push({
        id: existingId,
        data: {
          ...itemData,
          updatedAt: new Date(),
          updatedBy: args.userId
        }
      });

      if (args.table === "material") {
        materialUpdates.push({
          id: record.readableId,
          data: materialData(record, args.companyId, args.userId, true)
        });
      }
      continue;
    }

    itemInserts.push({
      id: nanoid(),
      ...itemData,
      type: capitalize(args.table),
      requiresInspection: false,
      embedding: zeroEmbedding(),
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId
    });
    insertExternalIds.push(externalId);

    if (args.table === "material") {
      materialDataByReadableId.set(record.readableId, record);
    }
  }

  const insertedItems = await insertRows<{ id: string; readableId: string }>(
    client,
    "item",
    itemInserts,
    ["id", "readableId"]
  );

  await upsertCsvMappings(
    client,
    "item",
    insertedItems.map((item, index) => ({
      entityId: item.id,
      externalId: insertExternalIds[index] ?? ""
    })),
    args.companyId,
    args.userId
  );

  if (insertedItems.length > 0) {
    if (args.table === "material") {
      await insertRows(
        client,
        "material",
        insertedItems.map((item) => {
          const record = materialDataByReadableId.get(item.readableId) ?? {};
          return materialData(record, args.companyId, args.userId, false);
        })
      );
    } else {
      await insertRows(
        client,
        args.table,
        insertedItems.map((item) => ({
          id: item.readableId,
          approved: true,
          companyId: args.companyId,
          createdAt: new Date(),
          createdBy: args.userId
        }))
      );
    }
  }

  if (itemUpdates.length > 0) {
    const currentItems = await selectMany<{ id: string; readableId: string }>(
      client,
      `SELECT id, "readableId" FROM "item" WHERE id = ANY($1::text[])`,
      [itemUpdates.map((update) => update.id)]
    );
    const readableIdById = new Map(
      currentItems.map((item) => [item.id, item.readableId])
    );

    for (const update of itemUpdates) {
      await updateById(client, "item", update.id, update.data);
    }

    for (const update of itemUpdates) {
      const oldReadableId = readableIdById.get(update.id);
      const newReadableId = update.data.readableId;
      if (
        typeof oldReadableId === "string" &&
        typeof newReadableId === "string" &&
        oldReadableId !== newReadableId
      ) {
        await updateById(client, args.table, oldReadableId, {
          id: newReadableId,
          updatedAt: new Date(),
          updatedBy: args.userId
        });
      }
    }

    for (const update of materialUpdates) {
      await updateById(client, "material", update.id, update.data);
    }
  }
}

async function importContactLike(
  client: PoolClient,
  args: {
    records: Record<string, string>[];
    companyId: string;
    userId: string;
    parentEntityType: "customer" | "supplier";
    parentForeignKey: "customerId" | "supplierId";
    joinTable: "customerContact" | "supplierContact";
    isCustomer: boolean;
  }
) {
  const contactExternalIdMap = await getCsvExternalIdMap(
    client,
    "contact",
    args.companyId
  );
  const parentExternalIdMap = await getCsvExternalIdMap(
    client,
    args.parentEntityType,
    args.companyId
  );
  const contactInserts: Row[] = [];
  const contactExternalIds: string[] = [];
  const contactUpdates: { id: string; data: Row }[] = [];
  const joinInserts: Row[] = [];

  for (const record of args.records) {
    const { id, companyId: externalCompanyId, ...contactData } = record;
    if (!id || !contactData.email?.trim()) continue;

    const existingContactId = contactExternalIdMap.get(id);
    if (existingContactId) {
      contactUpdates.push({
        id: existingContactId,
        data: cleanRow(contactData)
      });
      continue;
    }

    if (!externalCompanyId) continue;
    const parentId = parentExternalIdMap.get(externalCompanyId);
    if (!parentId) continue;

    const contactId = nanoid();
    contactInserts.push({
      id: contactId,
      ...cleanRow(contactData),
      isCustomer: args.isCustomer,
      companyId: args.companyId
    });
    contactExternalIds.push(id);
    joinInserts.push({
      id: nanoid(),
      contactId,
      [args.parentForeignKey]: parentId,
      customFields: {}
    });
  }

  const inserted = await insertRows<{ id: string }>(client, "contact", contactInserts, [
    "id"
  ]);
  await upsertCsvMappings(
    client,
    "contact",
    inserted.map((row, index) => ({
      entityId: row.id,
      externalId: contactExternalIds[index] ?? ""
    })),
    args.companyId,
    args.userId
  );

  for (const update of contactUpdates) {
    await updateById(client, "contact", update.id, update.data);
  }
  await insertRows(client, args.joinTable, joinInserts);
}

async function importWorkCenters(
  client: PoolClient,
  args: {
    records: Record<string, string>[];
    companyId: string;
    userId: string;
  }
) {
  const externalIdMap = await getCsvExternalIdMap(
    client,
    "workCenter",
    args.companyId
  );
  const seen = new Set<string>();
  const inserts: Row[] = [];
  const insertExternalIds: string[] = [];
  const updates: { id: string; data: Row }[] = [];

  for (const record of args.records) {
    const { id, ...rest } = record;
    if (!id || seen.has(id) || !rest.name?.trim() || !rest.locationId?.trim()) {
      continue;
    }
    seen.add(id);

    const data = cleanRow({
      ...rest,
      active: true,
      defaultStandardFactor: rest.defaultStandardFactor || DEFAULT_FACTOR,
      laborRate: toNumber(rest.laborRate),
      machineRate: toNumber(rest.machineRate),
      overheadRate: toNumber(rest.overheadRate)
    });
    const existingId = externalIdMap.get(id);
    if (existingId) {
      updates.push({
        id: existingId,
        data: { ...data, updatedAt: new Date(), updatedBy: args.userId }
      });
      continue;
    }

    inserts.push({
      id: nanoid(),
      ...data,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId
    });
    insertExternalIds.push(id);
  }

  const inserted = await insertRows<{ id: string }>(client, "workCenter", inserts, [
    "id"
  ]);
  await upsertCsvMappings(
    client,
    "workCenter",
    inserted.map((row, index) => ({
      entityId: row.id,
      externalId: insertExternalIds[index] ?? ""
    })),
    args.companyId,
    args.userId
  );

  for (const update of updates) {
    await updateById(client, "workCenter", update.id, update.data);
  }
}

async function importProcesses(
  client: PoolClient,
  args: {
    records: Record<string, string>[];
    companyId: string;
    userId: string;
  }
) {
  const externalIdMap = await getCsvExternalIdMap(
    client,
    "process",
    args.companyId
  );
  const seen = new Set<string>();
  const inserts: Row[] = [];
  const insertExternalIds: string[] = [];
  const updates: { id: string; data: Row }[] = [];

  for (const record of args.records) {
    const { id, ...rest } = record;
    if (!id || seen.has(id) || !rest.name?.trim()) continue;
    seen.add(id);

    const data = cleanRow({
      ...rest,
      active: true,
      completeAllOnScan: parseBoolean(rest.completeAllOnScan, false),
      defaultStandardFactor: rest.defaultStandardFactor || DEFAULT_FACTOR,
      processType: rest.processType || "Inside"
    });
    const existingId = externalIdMap.get(id);
    if (existingId) {
      updates.push({
        id: existingId,
        data: { ...data, updatedAt: new Date(), updatedBy: args.userId }
      });
      continue;
    }

    inserts.push({
      id: nanoid(),
      ...data,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId
    });
    insertExternalIds.push(id);
  }

  const inserted = await insertRows<{ id: string }>(client, "process", inserts, [
    "id"
  ]);
  await upsertCsvMappings(
    client,
    "process",
    inserted.map((row, index) => ({
      entityId: row.id,
      externalId: insertExternalIds[index] ?? ""
    })),
    args.companyId,
    args.userId
  );

  for (const update of updates) {
    await updateById(client, "process", update.id, update.data);
  }
}

async function getCsvExternalIdMap(
  client: PoolClient,
  entityType: string,
  companyId: string
) {
  const rows = await selectMany<{ externalId: string | null; entityId: string }>(
    client,
    `SELECT "externalId", "entityId"
     FROM "externalIntegrationMapping"
     WHERE "entityType" = $1
       AND integration = $2
       AND "companyId" = $3`,
    [entityType, EXTERNAL_ID_KEY, companyId]
  );

  return new Map(
    rows
      .filter((row): row is { externalId: string; entityId: string } =>
        Boolean(row.externalId)
      )
      .map((row) => [row.externalId, row.entityId])
  );
}

async function upsertCsvMappings(
  client: PoolClient,
  entityType: string,
  mappings: { entityId: string; externalId: string }[],
  companyId: string,
  userId: string
) {
  for (const mapping of mappings) {
    if (!mapping.externalId) continue;
    const existing = await selectOne<{ id: string }>(
      client,
      `SELECT id
       FROM "externalIntegrationMapping"
       WHERE "entityType" = $1
         AND "entityId" = $2
         AND integration = $3
         AND "companyId" = $4`,
      [entityType, mapping.entityId, EXTERNAL_ID_KEY, companyId]
    );

    if (existing) {
      await updateById(client, "externalIntegrationMapping", existing.id, {
        externalId: mapping.externalId,
        updatedAt: new Date()
      });
    } else {
      await insertRows(client, "externalIntegrationMapping", [
        {
          id: nanoid(),
          entityType,
          entityId: mapping.entityId,
          integration: EXTERNAL_ID_KEY,
          externalId: mapping.externalId,
          companyId,
          allowDuplicateExternalId: false,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
    }
  }
}

async function upsertTaxIdentifiers(
  client: PoolClient,
  args: {
    table: "customerTax" | "supplierTax";
    foreignKey: "customerId" | "supplierId";
    records: { entityId: string; taxId?: string | null }[];
    companyId: string;
    userId: string;
  }
) {
  for (const record of args.records) {
    const existing = await selectOne<{ entityId: string }>(
      client,
      `SELECT ${quoteIdent(args.foreignKey)} AS "entityId"
       FROM ${quoteIdent(args.table)}
       WHERE ${quoteIdent(args.foreignKey)} = $1
         AND "companyId" = $2`,
      [record.entityId, args.companyId]
    );

    if (existing) {
      await updateWhere(
        client,
        args.table,
        {
          taxId: record.taxId || null,
          updatedAt: new Date(),
          updatedBy: args.userId
        },
        `${quoteIdent(args.foreignKey)} = $1 AND "companyId" = $2`,
        [record.entityId, args.companyId]
      );
    } else {
      await insertRows(client, args.table, [
        {
          [args.foreignKey]: record.entityId,
          taxId: record.taxId || null,
          taxExempt: false,
          companyId: args.companyId,
          updatedAt: new Date(),
          updatedBy: args.userId
        }
      ]);
    }
  }
}

async function insertRows<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  table: string,
  rows: Row[],
  returning: string[] = []
) {
  if (rows.length === 0) return [] as T[];

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const returningSql =
    returning.length > 0
      ? ` RETURNING ${returning.map(quoteIdent).join(", ")}`
      : "";
  const result = await client.query<T>(
    `INSERT INTO ${quoteIdent(table)}
       (${columns.map(quoteIdent).join(", ")})
     VALUES ${tuples.join(", ")}
     ${returningSql}`,
    values
  );
  return result.rows;
}

async function updateById(
  client: PoolClient,
  table: string,
  id: string,
  data: Row
) {
  return updateWhere(client, table, data, `"id" = $1`, [id]);
}

async function updateWhere(
  client: PoolClient,
  table: string,
  data: Row,
  whereSql: string,
  whereValues: unknown[]
) {
  const entries = Object.entries(cleanRow(data));
  if (entries.length === 0) return;

  const values: unknown[] = [];
  const setSql = entries.map(([column, value]) => {
    values.push(value);
    return `${quoteIdent(column)} = $${values.length}`;
  });
  const shiftedWhereSql = whereSql.replace(/\$(\d+)/g, (_, index: string) => {
    return `$${Number(index) + values.length}`;
  });
  await client.query(
    `UPDATE ${quoteIdent(table)}
     SET ${setSql.join(", ")}
     WHERE ${shiftedWhereSql}`,
    [...values, ...whereValues]
  );
}

async function selectMany<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(text, values);
  return result.rows;
}

async function selectOne<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(text, values);
  return result.rows[0] ?? null;
}

function materialData(
  record: Record<string, string>,
  companyId: string,
  userId: string,
  update: boolean
) {
  return cleanRow({
    id: update ? undefined : record.readableId,
    approved: update ? undefined : true,
    materialSubstanceId: record.materialSubstanceId,
    materialFormId: record.materialFormId,
    dimensionId: record.dimensionId,
    gradeId: record.gradeId,
    finishId: record.finishId,
    companyId,
    createdAt: update ? undefined : new Date(),
    createdBy: update ? undefined : userId,
    updatedAt: update ? new Date() : undefined,
    updatedBy: update ? userId : undefined
  });
}

function cleanRow(row: Row) {
  const clean: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === "") continue;
    clean[key] = value;
  }
  return clean;
}

function quoteIdent(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function getReadableIdWithRevision(
  readableId: string,
  revision?: string | null
) {
  if (revision && revision !== "0") return `${readableId}.${revision}`;
  return readableId;
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function assertNever(value: never): never {
  throw new Error(`Invalid table: ${value}`);
}

let cachedZeroEmbedding: string | null = null;

function zeroEmbedding() {
  cachedZeroEmbedding ??= `[${Array.from({ length: 1536 }, () => "0").join(",")}]`;
  return cachedZeroEmbedding;
}
