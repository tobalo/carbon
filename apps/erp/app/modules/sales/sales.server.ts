import { eq, withAuth } from "@carbon/database/drizzle";
import {
  customerItemPriceOverrideBreakTable,
  customerItemPriceOverrideTable,
  type QueryDatabase
} from "@carbon/database/schema";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import { nanoid } from "nanoid";

type BreakRow = { quantity: number; overridePrice: number; active: boolean };
type SourceOverrideRow = {
  id: string;
  itemId: string;
  notes: string | null;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  applyRulesOnTop: boolean | null;
};

export async function duplicatePriceOverrides(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  userId: string,
  source: { customerId?: string; customerTypeId?: string },
  target: { customerId?: string; customerTypeId?: string },
  options?: {
    overrideIds?: string[];
    conflictStrategy?: "skip" | "overwrite";
  }
): Promise<{
  duplicated: number;
  skipped: number;
  overwritten: number;
  error: unknown;
}> {
  let query = client
    .from("customerItemPriceOverride")
    .select(
      "id, itemId, notes, validFrom, validTo, active, applyRulesOnTop"
    )
    .eq("companyId", companyId);

  if (source.customerId) {
    query = query.eq("customerId", source.customerId);
  } else if (source.customerTypeId) {
    query = query.eq("customerTypeId", source.customerTypeId);
  } else {
    query = query.is("customerId", null).is("customerTypeId", null);
  }

  if (options?.overrideIds?.length) {
    query = query.in("id", options.overrideIds);
  }

  const { data: sourceOverrides, error: fetchError } = await query;
  if (fetchError || !sourceOverrides) {
    return { duplicated: 0, skipped: 0, overwritten: 0, error: fetchError };
  }

  if (sourceOverrides.length === 0) {
    return { duplicated: 0, skipped: 0, overwritten: 0, error: null };
  }

  const sourceIds = sourceOverrides.map((source) => source.id);
  const { data: sourceBreakRows, error: breaksError } = await client
    .from("customerItemPriceOverrideBreak")
    .select("customerItemPriceOverrideId, quantity, overridePrice, active")
    .in("customerItemPriceOverrideId", sourceIds);

  if (breaksError) {
    return { duplicated: 0, skipped: 0, overwritten: 0, error: breaksError };
  }

  const breaksByOverrideId = new Map<string, BreakRow[]>();
  for (const row of sourceBreakRows ?? []) {
    const key = row.customerItemPriceOverrideId;
    const next = breaksByOverrideId.get(key) ?? [];
    next.push({
      quantity: row.quantity,
      overridePrice: row.overridePrice,
      active: row.active
    });
    breaksByOverrideId.set(key, next);
  }

  const strategy = options?.conflictStrategy ?? "skip";

  let existingLookup = client
    .from("customerItemPriceOverride")
    .select("id, itemId")
    .eq("companyId", companyId)
    .in(
      "itemId",
      sourceOverrides.map((s) => s.itemId)
    );

  existingLookup = target.customerId
    ? existingLookup.eq("customerId", target.customerId)
    : target.customerTypeId
      ? existingLookup.eq("customerTypeId", target.customerTypeId)
      : existingLookup.is("customerId", null).is("customerTypeId", null);

  const { data: existingOverrides } = await existingLookup;
  const existingByItemId = new Map(
    (existingOverrides ?? []).map((e) => [e.itemId, e.id])
  );

  try {
    const result = await withAuth({ kind: "user", userId }, async (db) => {
      let duplicated = 0;
      let skipped = 0;
      let overwritten = 0;
      const timestamp = new Date().toISOString();

      for (const src of sourceOverrides as SourceOverrideRow[]) {
        const breaks = breaksByOverrideId.get(src.id) ?? [];

        if (breaks.length === 0) {
          skipped++;
          continue;
        }

        const existingId = existingByItemId.get(src.itemId);

        if (existingId && strategy === "skip") {
          skipped++;
          continue;
        }

        let parentId: string;

        if (existingId) {
          await db
            .update(customerItemPriceOverrideTable)
            .set({
              active: src.active,
              applyRulesOnTop: src.applyRulesOnTop ?? true,
              notes: src.notes ?? null,
              validFrom: src.validFrom ?? null,
              validTo: src.validTo ?? null,
              customerId: target.customerId ?? null,
              customerTypeId: target.customerTypeId ?? null,
              itemId: src.itemId,
              updatedBy: userId,
              updatedAt: timestamp
            })
            .where(eq(customerItemPriceOverrideTable.id, existingId));

          await db
            .delete(customerItemPriceOverrideBreakTable)
            .where(
              eq(
                customerItemPriceOverrideBreakTable.customerItemPriceOverrideId,
                existingId
              )
            );

          parentId = existingId;
          overwritten++;
        } else {
          parentId = nanoid();
          await db.insert(customerItemPriceOverrideTable).values({
            id: parentId,
            companyId,
            createdBy: userId,
            createdAt: timestamp,
            itemId: src.itemId,
            customerId: target.customerId ?? null,
            customerTypeId: target.customerTypeId ?? null,
            active: src.active,
            applyRulesOnTop: src.applyRulesOnTop ?? true,
            notes: src.notes ?? null,
            validFrom: src.validFrom ?? null,
            validTo: src.validTo ?? null
          });
          duplicated++;
        }

        await db.insert(customerItemPriceOverrideBreakTable).values(
          breaks.map((b) => ({
            id: nanoid(),
            customerItemPriceOverrideId: parentId,
            companyId,
            createdBy: userId,
            createdAt: timestamp,
            quantity: b.quantity,
            overridePrice: b.overridePrice,
            active: b.active
          }))
        );
      }

      return { duplicated, skipped, overwritten };
    });

    return { ...result, error: null };
  } catch (e) {
    return { duplicated: 0, skipped: 0, overwritten: 0, error: e };
  }
}
