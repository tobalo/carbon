import {
  and,
  eq,
  inArray,
  isNotNull,
  withAuth
} from "@carbon/database/drizzle";
import {
  activeMakeMethodsView,
  itemShelfLifeTable,
  itemTable,
  jobMakeMethodTable,
  jobMaterialTable,
  jobTable,
  methodOperationTable,
  pickMethodTable,
  receiptLineTable,
  receiptTable,
  shipmentLineTable,
  shipmentTable,
  stockTransferLineTable,
  stockTransferTable,
  supplierPartPriceTable,
  type Json
} from "@carbon/database/schema";
import { getLocalTimeZone, now } from "@internationalized/date";
import {
  ItemTrackingType,
  type shelfLifeModes,
  type shelfLifeTriggerTimings
} from "./items.models";
import type { InventoryItemType } from "./types";

export async function upsertPickMethodWithShelfLife(args: {
  itemId: string;
  locationId: string;
  defaultStorageUnitId?: string | null;
  customFields?: Json;
  userId: string;
  shelfLife: {
    mode?: (typeof shelfLifeModes)[number];
    days?: number;
    triggerProcessId?: string;
    triggerTiming?: (typeof shelfLifeTriggerTimings)[number];
    calculateFromBom?: boolean;
  };
}) {
  const updatedAt = now(getLocalTimeZone()).toAbsoluteString();

  return withAuth({ kind: "user", userId: args.userId }, async (db) => {
    await db
      .update(pickMethodTable)
      .set({
        defaultStorageUnitId: args.defaultStorageUnitId ?? null,
        customFields: args.customFields ?? null,
        updatedBy: args.userId,
        updatedAt
      })
      .where(
        and(
          eq(pickMethodTable.itemId, args.itemId),
          eq(pickMethodTable.locationId, args.locationId)
        )
      );

    const { mode, days, triggerProcessId, triggerTiming, calculateFromBom } =
      args.shelfLife;

    if (mode === undefined) return;

    if (mode === "NotManaged") {
      await db
        .delete(itemShelfLifeTable)
        .where(eq(itemShelfLifeTable.itemId, args.itemId));
      return;
    }

    const normalizedDays = mode === "Fixed Duration" ? (days ?? null) : null;
    const normalizedTriggerProcess =
      mode === "Fixed Duration" ? (triggerProcessId ?? null) : null;
    const normalizedTriggerTiming = normalizedTriggerProcess
      ? (triggerTiming ?? "After")
      : "After";
    const normalizedCalcFromBom =
      mode === "Fixed Duration" ? (calculateFromBom ?? false) : false;

    if (normalizedTriggerProcess) {
      const recipeProcessIds = await db
        .select({ processId: methodOperationTable.processId })
        .from(methodOperationTable)
        .innerJoin(
          activeMakeMethodsView,
          eq(activeMakeMethodsView.id, methodOperationTable.makeMethodId)
        )
        .where(
          and(
            eq(activeMakeMethodsView.itemId, args.itemId),
            isNotNull(methodOperationTable.processId)
          )
        );
      const allowed = new Set(
        recipeProcessIds
          .map((row) => row.processId)
          .filter((id): id is string => !!id)
      );
      if (!allowed.has(normalizedTriggerProcess)) {
        throw new Error(
          "Shelf-life trigger process must be one of the operations on this item's recipe"
        );
      }
    }

    const [existing] = await db
      .select({ itemId: itemShelfLifeTable.itemId })
      .from(itemShelfLifeTable)
      .where(eq(itemShelfLifeTable.itemId, args.itemId))
      .limit(1);

    if (existing) {
      await db
        .update(itemShelfLifeTable)
        .set({
          mode,
          days: normalizedDays,
          triggerProcessId: normalizedTriggerProcess,
          triggerTiming: normalizedTriggerTiming,
          calculateFromBom: normalizedCalcFromBom,
          updatedBy: args.userId,
          updatedAt
        })
        .where(eq(itemShelfLifeTable.itemId, args.itemId));
      return;
    }

    const [itemRow] = await db
      .select({ companyId: itemTable.companyId })
      .from(itemTable)
      .where(eq(itemTable.id, args.itemId))
      .limit(1);

    if (!itemRow?.companyId) {
      throw new Error(`Item ${args.itemId} has no companyId`);
    }

    await db.insert(itemShelfLifeTable).values({
      itemId: args.itemId,
      mode,
      days: normalizedDays,
      triggerProcessId: normalizedTriggerProcess,
      triggerTiming: normalizedTriggerTiming,
      calculateFromBom: normalizedCalcFromBom,
      companyId: itemRow.companyId,
      createdBy: args.userId,
      createdAt: updatedAt
    });
  });
}

export async function cascadeItemTrackingType(args: {
  itemIds: string[];
  companyId: string;
  newType: InventoryItemType;
  userId: string;
}) {
  if (args.itemIds.length === 0) return;

  const requiresSerialTracking = args.newType === ItemTrackingType.Serial;
  const requiresBatchTracking = args.newType === ItemTrackingType.Batch;
  const updatedAt = now(getLocalTimeZone()).toAbsoluteString();
  const update = {
    requiresSerialTracking,
    requiresBatchTracking,
    updatedBy: args.userId,
    updatedAt
  };

  return withAuth({ kind: "user", userId: args.userId }, async (db) => {
    const openJobIds = db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(
        and(
          eq(jobTable.companyId, args.companyId),
          inArray(jobTable.status, ["Draft", "Planned"])
        )
      );
    const draftReceiptIds = db
      .select({ id: receiptTable.id })
      .from(receiptTable)
      .where(
        and(
          eq(receiptTable.companyId, args.companyId),
          eq(receiptTable.status, "Draft")
        )
      );
    const draftShipmentIds = db
      .select({ id: shipmentTable.id })
      .from(shipmentTable)
      .where(
        and(
          eq(shipmentTable.companyId, args.companyId),
          eq(shipmentTable.status, "Draft")
        )
      );
    const draftStockTransferIds = db
      .select({ id: stockTransferTable.id })
      .from(stockTransferTable)
      .where(
        and(
          eq(stockTransferTable.companyId, args.companyId),
          eq(stockTransferTable.status, "Draft")
        )
      );

    await db
      .update(jobMakeMethodTable)
      .set(update)
      .where(
        and(
          inArray(jobMakeMethodTable.itemId, args.itemIds),
          eq(jobMakeMethodTable.companyId, args.companyId),
          inArray(jobMakeMethodTable.jobId, openJobIds)
        )
      );

    await db
      .update(jobMaterialTable)
      .set(update)
      .where(
        and(
          inArray(jobMaterialTable.itemId, args.itemIds),
          eq(jobMaterialTable.companyId, args.companyId),
          inArray(jobMaterialTable.jobId, openJobIds)
        )
      );

    await db
      .update(receiptLineTable)
      .set(update)
      .where(
        and(
          inArray(receiptLineTable.itemId, args.itemIds),
          eq(receiptLineTable.companyId, args.companyId),
          inArray(receiptLineTable.receiptId, draftReceiptIds)
        )
      );

    await db
      .update(shipmentLineTable)
      .set(update)
      .where(
        and(
          inArray(shipmentLineTable.itemId, args.itemIds),
          eq(shipmentLineTable.companyId, args.companyId),
          inArray(shipmentLineTable.shipmentId, draftShipmentIds)
        )
      );

    await db
      .update(stockTransferLineTable)
      .set(update)
      .where(
        and(
          inArray(stockTransferLineTable.itemId, args.itemIds),
          eq(stockTransferLineTable.companyId, args.companyId),
          inArray(stockTransferLineTable.stockTransferId, draftStockTransferIds)
        )
      );
  });
}

export async function replaceSupplierPartPrices(args: {
  supplierPartId: string;
  priceBreaks: {
    quantity: number;
    unitPrice: number;
    leadTime: number;
  }[];
  companyId: string;
  userId: string;
}) {
  const timestamp = now(getLocalTimeZone()).toAbsoluteString();

  return withAuth({ kind: "user", userId: args.userId }, async (db) => {
    await db
      .delete(supplierPartPriceTable)
      .where(eq(supplierPartPriceTable.supplierPartId, args.supplierPartId));

    if (args.priceBreaks.length === 0) return;

    await db.insert(supplierPartPriceTable).values(
      args.priceBreaks.map((priceBreak) => ({
        supplierPartId: args.supplierPartId,
        quantity: priceBreak.quantity,
        unitPrice: priceBreak.unitPrice,
        leadTime: priceBreak.leadTime ?? 0,
        sourceType: "Manual Entry" as const,
        companyId: args.companyId,
        createdBy: args.userId,
        createdAt: timestamp,
        updatedBy: args.userId,
        updatedAt: timestamp
      }))
    );
  });
}
