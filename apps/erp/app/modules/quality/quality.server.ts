import { and, eq, inArray, sql, withAuth } from "@carbon/database/drizzle";
import {
  inboundInspectionHistoryTable,
  inboundInspectionSampleTable,
  inboundInspectionTable,
  nonConformanceItemTable,
  nonConformanceItemTrackedEntityTable,
  nonConformanceTable,
  trackedActivityInputTable,
  trackedActivityOutputTable,
  trackedActivityTable,
  trackedEntityTable,
  type QueryDatabase
} from "@carbon/database/schema";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import { nanoid } from "nanoid";
import type { z } from "zod";

import type {
  inboundInspectionDispositionValidator,
  inboundInspectionSampleValidator
} from "./quality.models";

type Ok<T> = { data: T; error: null };
type Err = { data: null; error: { message: string; blockers?: unknown } };
type Result<T> = Ok<T> | Err;

function errResult(message: string, blockers?: unknown): Err {
  return { data: null, error: { message, ...(blockers ? { blockers } : {}) } };
}

// Mirrors the old in-service helper. Terminal states (Passed/Failed/Partial)
// are owned by the disposition path, so the per-sample recompute only flips
// between Pending and In Progress.
function computeLotStatus(
  samples: { status: string }[]
): "Pending" | "In Progress" {
  const inspected = samples.filter((s) => s.status !== "Pending").length;
  return inspected > 0 ? "In Progress" : "Pending";
}

// -------------------------------------------------------------
// 1. upsertInboundInspectionSample
// -------------------------------------------------------------
// Writes that must stay consistent:
//   - inboundInspectionSample (insert or update)
//   - trackedEntity.status (flip to Available or Rejected)
//   - trackedActivity + trackedActivityInput + trackedActivityOutput
//   - inboundInspection.status (recompute if non-terminal)

export async function upsertInboundInspectionSample(
  sample: z.infer<typeof inboundInspectionSampleValidator> & {
    companyId: string;
    inspectedBy: string;
  }
): Promise<Result<{ id: string }>> {
  const nowIso = new Date().toISOString();

  try {
    const result = await withAuth(
      { kind: "user", userId: sample.inspectedBy },
      async (db) => {
        const [inspection] = await db
          .select({
            id: inboundInspectionTable.id,
            status: inboundInspectionTable.status,
            receiptId: inboundInspectionTable.receiptId
          })
          .from(inboundInspectionTable)
          .where(
            and(
              eq(inboundInspectionTable.id, sample.inspectionId),
              eq(inboundInspectionTable.companyId, sample.companyId)
            )
          )
          .limit(1);
        if (!inspection) throw new Error("Inspection not found");

        const [existing] = await db
          .select({ id: inboundInspectionSampleTable.id })
          .from(inboundInspectionSampleTable)
          .where(
            and(
              eq(
                inboundInspectionSampleTable.trackedEntityId,
                sample.trackedEntityId
              ),
              eq(inboundInspectionSampleTable.companyId, sample.companyId)
            )
          )
          .limit(1);

        const samplePayload = {
          inboundInspectionId: sample.inspectionId,
          trackedEntityId: sample.trackedEntityId,
          status: sample.status,
          notes: sample.notes ?? null,
          inspectedBy: sample.inspectedBy,
          inspectedAt: nowIso,
          companyId: sample.companyId
        };

        let sampleId: string;
        if (existing) {
          const [updated] = await db
            .update(inboundInspectionSampleTable)
            .set({
              ...samplePayload,
              updatedBy: sample.inspectedBy,
              updatedAt: nowIso
            })
            .where(eq(inboundInspectionSampleTable.id, existing.id))
            .returning({ id: inboundInspectionSampleTable.id });

          if (!updated) throw new Error("Failed to update sample");
          sampleId = updated.id;
        } else {
          sampleId = nanoid();
          await db.insert(inboundInspectionSampleTable).values({
            id: sampleId,
            ...samplePayload,
            createdBy: sample.inspectedBy,
            createdAt: nowIso
          });
        }

        const trackedEntityStatus =
          sample.status === "Passed" ? "Available" : "Rejected";
        await db
          .update(trackedEntityTable)
          .set({ status: trackedEntityStatus })
          .where(
            and(
              eq(trackedEntityTable.id, sample.trackedEntityId),
              eq(trackedEntityTable.companyId, sample.companyId)
            )
          );

        const activityId = nanoid();
        await db.insert(trackedActivityTable).values({
          id: activityId,
          type: "Inspect",
          sourceDocument: "Inbound Inspection",
          sourceDocumentId: sample.inspectionId,
          attributes: {
            Result: sample.status,
            Receipt: inspection.receiptId,
            Inspector: sample.inspectedBy,
            ...(sample.notes ? { Notes: sample.notes } : {})
          },
          companyId: sample.companyId,
          createdBy: sample.inspectedBy,
          createdAt: nowIso
        });

        await db.insert(trackedActivityInputTable).values({
          trackedActivityId: activityId,
          trackedEntityId: sample.trackedEntityId,
          quantity: 0,
          companyId: sample.companyId,
          createdBy: sample.inspectedBy,
          createdAt: nowIso
        });
        await db.insert(trackedActivityOutputTable).values({
          trackedActivityId: activityId,
          trackedEntityId: sample.trackedEntityId,
          quantity: 0,
          companyId: sample.companyId,
          createdBy: sample.inspectedBy,
          createdAt: nowIso
        });

        const isTerminal =
          inspection.status === "Passed" ||
          inspection.status === "Failed" ||
          inspection.status === "Partial";
        if (!isTerminal) {
          const samples = await db
            .select({ status: inboundInspectionSampleTable.status })
            .from(inboundInspectionSampleTable)
            .where(
              eq(
                inboundInspectionSampleTable.inboundInspectionId,
                sample.inspectionId
              )
            );
          const nextStatus = computeLotStatus(samples);
          if (nextStatus !== inspection.status) {
            await db
              .update(inboundInspectionTable)
              .set({
                status: nextStatus,
                updatedBy: sample.inspectedBy,
                updatedAt: nowIso
              })
              .where(eq(inboundInspectionTable.id, sample.inspectionId));
          }
        }

        return { id: sampleId };
      }
    );

    return { data: result, error: null };
  } catch (err) {
    return errResult(
      err instanceof Error ? err.message : "Failed to save sample"
    );
  }
}

// -------------------------------------------------------------
// 2. dispositionInboundInspection
// -------------------------------------------------------------
// Writes:
//   - trackedEntity.status (bulk flip for Accept/Reject; nothing for Partial)
//   - inboundInspection (status, dispositionedBy/At, notes)
//   - inboundInspectionHistory (1 row for future plan auto-switching)

export async function dispositionInboundInspection(
  args: z.infer<typeof inboundInspectionDispositionValidator> & {
    companyId: string;
    dispositionedBy: string;
  }
): Promise<Result<{ id: string; status: string }>> {
  const nowIso = new Date().toISOString();

  try {
    const result = await withAuth(
      { kind: "user", userId: args.dispositionedBy },
      async (db) => {
        const [inspection] = await db
          .select({
            id: inboundInspectionTable.id,
            receiptLineId: inboundInspectionTable.receiptLineId,
            receiptId: inboundInspectionTable.receiptId,
            itemId: inboundInspectionTable.itemId,
            supplierId: inboundInspectionTable.supplierId,
            samplingStandard: inboundInspectionTable.samplingStandard,
            severity: inboundInspectionTable.severity,
            inspectionLevel: inboundInspectionTable.inspectionLevel,
            aql: inboundInspectionTable.aql,
            lotSize: inboundInspectionTable.lotSize,
            sampleSize: inboundInspectionTable.sampleSize
          })
          .from(inboundInspectionTable)
          .where(
            and(
              eq(inboundInspectionTable.id, args.id),
              eq(inboundInspectionTable.companyId, args.companyId)
            )
          )
          .limit(1);
        if (!inspection) throw new Error("Inspection not found");

        const lotEntities = await db
          .select({ id: trackedEntityTable.id })
          .from(trackedEntityTable)
          .where(
            and(
              sql`${trackedEntityTable.attributes}->>'Receipt Line' = ${inspection.receiptLineId}`,
              eq(trackedEntityTable.companyId, args.companyId)
            )
          );

        const existingSamples = await db
          .select({
            trackedEntityId: inboundInspectionSampleTable.trackedEntityId,
            status: inboundInspectionSampleTable.status
          })
          .from(inboundInspectionSampleTable)
          .where(eq(inboundInspectionSampleTable.inboundInspectionId, args.id));

        const sampledIds = new Set(
          existingSamples.map((s) => s.trackedEntityId)
        );
        const allLotIds = lotEntities.map((e) => e.id);
        const unsampledIds = allLotIds.filter((id) => !sampledIds.has(id));
        const failures = existingSamples.filter(
          (s) => s.status === "Failed"
        ).length;

        // Reject = entire lot non-conforming (ISO 9001:2015 §8.7). Accept only
        // releases un-sampled entities (sampled outcomes already flipped
        // per-sample). Partial leaves un-sampled entities On Hold.
        let lotStatus: "Passed" | "Failed" | "Partial";
        let idsToFlip: string[] = [];
        let flipStatus: "Available" | "Rejected" | null = null;
        switch (args.decision) {
          case "Accept":
            lotStatus = "Passed";
            idsToFlip = unsampledIds;
            flipStatus = "Available";
            break;
          case "Reject":
            lotStatus = "Failed";
            idsToFlip = allLotIds;
            flipStatus = "Rejected";
            break;
          case "Partial":
            lotStatus = "Partial";
            idsToFlip = [];
            flipStatus = null;
            break;
        }

        if (flipStatus && idsToFlip.length > 0) {
          await db
            .update(trackedEntityTable)
            .set({ status: flipStatus })
            .where(
              and(
                inArray(trackedEntityTable.id, idsToFlip),
                eq(trackedEntityTable.companyId, args.companyId)
              )
            );
        }

        const [updated] = await db
          .update(inboundInspectionTable)
          .set({
            status: lotStatus,
            notes: args.notes ?? null,
            dispositionedBy: args.dispositionedBy,
            dispositionedAt: nowIso,
            updatedBy: args.dispositionedBy,
            updatedAt: nowIso
          })
          .where(
            and(
              eq(inboundInspectionTable.id, args.id),
              eq(inboundInspectionTable.companyId, args.companyId)
            )
          )
          .returning({
            id: inboundInspectionTable.id,
            status: inboundInspectionTable.status
          });

        if (!updated) throw new Error("Failed to update inspection");

        await db.insert(inboundInspectionHistoryTable).values({
          id: nanoid(),
          inboundInspectionId: args.id,
          itemId: inspection.itemId,
          supplierId: inspection.supplierId ?? null,
          samplingStandard: inspection.samplingStandard,
          severity: inspection.severity ?? "Normal",
          inspectionLevel: inspection.inspectionLevel ?? null,
          aql: inspection.aql ?? null,
          lotSize: inspection.lotSize,
          sampleSize: inspection.sampleSize,
          defectsFound: failures,
          outcome:
            args.decision === "Accept"
              ? "Accepted"
              : args.decision === "Reject"
                ? "Rejected"
                : "Partial",
          companyId: args.companyId,
          createdBy: args.dispositionedBy,
          createdAt: nowIso
        });

        return { id: updated.id, status: updated.status };
      }
    );

    return { data: result, error: null };
  } catch (err) {
    return errResult(
      err instanceof Error ? err.message : "Failed to disposition inspection"
    );
  }
}

// -------------------------------------------------------------
// 3. assignEntitiesToIssueItem
// -------------------------------------------------------------
// Writes:
//   - nonConformanceItemTrackedEntity (delete moved links, re-insert against target)
//   - nonConformanceItem (decrement source qty, increment target qty)

export async function assignEntitiesToIssueItem(args: {
  nonConformanceItemId: string;
  targetItemId: string;
  assignments: { trackedEntityId: string; quantity: number }[];
  companyId: string;
  userId: string;
}): Promise<Result<{ moved: number }>> {
  const { nonConformanceItemId, targetItemId, assignments, companyId, userId } =
    args;

  if (assignments.length === 0) {
    return errResult("No assignments provided");
  }

  const nowIso = new Date().toISOString();
  const entityIds = assignments.map((a) => a.trackedEntityId);

  try {
    const result = await withAuth({ kind: "user", userId }, async (db) => {
      const [source] = await db
        .select({
          id: nonConformanceItemTable.id,
          nonConformanceId: nonConformanceItemTable.nonConformanceId,
          quantity: nonConformanceItemTable.quantity
        })
        .from(nonConformanceItemTable)
        .where(
          and(
            eq(nonConformanceItemTable.id, nonConformanceItemId),
            eq(nonConformanceItemTable.companyId, companyId)
          )
        )
        .limit(1);
      if (!source) throw new Error("Source item association not found");

      const [target] = await db
        .select({
          id: nonConformanceItemTable.id,
          nonConformanceId: nonConformanceItemTable.nonConformanceId,
          quantity: nonConformanceItemTable.quantity
        })
        .from(nonConformanceItemTable)
        .where(
          and(
            eq(nonConformanceItemTable.id, targetItemId),
            eq(nonConformanceItemTable.companyId, companyId)
          )
        )
        .limit(1);
      if (!target) throw new Error("Target item association not found");

      if (source.nonConformanceId !== target.nonConformanceId) {
        throw new Error("Cannot move entities between different NCRs");
      }

      const existingLinks = await db
        .select({ quantity: nonConformanceItemTrackedEntityTable.quantity })
        .from(nonConformanceItemTrackedEntityTable)
        .where(
          and(
            eq(
              nonConformanceItemTrackedEntityTable.nonConformanceItemId,
              nonConformanceItemId
            ),
            inArray(
              nonConformanceItemTrackedEntityTable.trackedEntityId,
              entityIds
            ),
            eq(nonConformanceItemTrackedEntityTable.companyId, companyId)
          )
        );

      const existingQty = existingLinks.reduce(
        (acc, l) => acc + Number(l.quantity ?? 0),
        0
      );
      const movingQty = assignments.reduce(
        (acc, a) => acc + Number(a.quantity),
        0
      );

      await db
        .delete(nonConformanceItemTrackedEntityTable)
        .where(
          and(
            eq(
              nonConformanceItemTrackedEntityTable.nonConformanceItemId,
              nonConformanceItemId
            ),
            inArray(
              nonConformanceItemTrackedEntityTable.trackedEntityId,
              entityIds
            ),
            eq(nonConformanceItemTrackedEntityTable.companyId, companyId)
          )
        );

      await db.insert(nonConformanceItemTrackedEntityTable).values(
        assignments.map((a) => ({
          id: nanoid(),
          nonConformanceItemId: targetItemId,
          nonConformanceId: target.nonConformanceId,
          trackedEntityId: a.trackedEntityId,
          quantity: Number(a.quantity),
          companyId,
          createdBy: userId,
          createdAt: nowIso
        }))
      );

      await db
        .update(nonConformanceItemTable)
        .set({
          quantity: Math.max(0, Number(source.quantity ?? 0) - existingQty),
          updatedBy: userId,
          updatedAt: nowIso
        })
        .where(
          and(
            eq(nonConformanceItemTable.id, nonConformanceItemId),
            eq(nonConformanceItemTable.companyId, companyId)
          )
        );

      await db
        .update(nonConformanceItemTable)
        .set({
          quantity: Number(target.quantity ?? 0) + movingQty,
          updatedBy: userId,
          updatedAt: nowIso
        })
        .where(
          and(
            eq(nonConformanceItemTable.id, targetItemId),
            eq(nonConformanceItemTable.companyId, companyId)
          )
        );

      return { moved: assignments.length };
    });

    return { data: result, error: null };
  } catch (err) {
    return errResult(
      err instanceof Error ? err.message : "Failed to move entities"
    );
  }
}

// -------------------------------------------------------------
// 4. closeIssue
// -------------------------------------------------------------
// Validates disposition plan (qty sums, no Pending rows, no Consumed entities),
// then for each row with linked entities:
//   - insert trackedActivity + trackedActivityInput
//   - flip trackedEntity status (Use As Is / Rework → Available;
//     Scrap / Return to Supplier → Rejected and write a Negative Adjmt. ledger)
// Finally sets nonConformance.status = Closed.

type DispositionLink = {
  id: string;
  trackedEntityId: string;
  quantity: number;
  trackedEntityStatus: string | null;
};

type DispositionRow = {
  id: string;
  itemId: string;
  disposition: string | null;
  quantity: number;
  links: DispositionLink[];
};

type IssueClosureBlocker = { nonConformanceItemId: string; reason: string };

export async function closeIssue(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: { nonConformanceId: string; companyId: string; userId: string }
): Promise<Result<{ id: string }>> {
  const { nonConformanceId, companyId, userId } = args;

  const planResult = await client
    .from("nonConformanceItem")
    .select("id, itemId, disposition, quantity")
    .eq("nonConformanceId", nonConformanceId)
    .eq("companyId", companyId)
    .order("createdAt", { ascending: true });

  if (planResult.error || !planResult.data) {
    return errResult("Failed to load disposition plan");
  }

  const planRows = planResult.data as {
    id: string;
    itemId: string;
    disposition: string | null;
    quantity: number | null;
  }[];
  const planIds = planRows.map((row) => row.id);

  const linksResult =
    planIds.length === 0
      ? { data: [], error: null }
      : await client
          .from("nonConformanceItemTrackedEntity")
          .select("id, nonConformanceItemId, trackedEntityId, quantity")
          .in("nonConformanceItemId", planIds)
          .eq("companyId", companyId);

  if (linksResult.error || !linksResult.data) {
    return errResult("Failed to load disposition links");
  }

  const trackedEntityIds = [
    ...new Set(
      (linksResult.data as { trackedEntityId: string }[]).map(
        (link) => link.trackedEntityId
      )
    )
  ];
  const trackedEntitiesResult =
    trackedEntityIds.length === 0
      ? { data: [], error: null }
      : await client
          .from("trackedEntity")
          .select("id, status")
          .in("id", trackedEntityIds)
          .eq("companyId", companyId);

  if (trackedEntitiesResult.error || !trackedEntitiesResult.data) {
    return errResult("Failed to load tracked entity statuses");
  }

  const statusByTrackedEntityId = new Map(
    (trackedEntitiesResult.data as { id: string; status: string }[]).map(
      (entity) => [entity.id, entity.status]
    )
  );
  const linksByItemId = new Map<string, DispositionLink[]>();
  for (const link of linksResult.data as {
    id: string;
    nonConformanceItemId: string;
    trackedEntityId: string;
    quantity: number | null;
  }[]) {
    const next = linksByItemId.get(link.nonConformanceItemId) ?? [];
    next.push({
      id: link.id,
      trackedEntityId: link.trackedEntityId,
      quantity: Number(link.quantity ?? 0),
      trackedEntityStatus:
        statusByTrackedEntityId.get(link.trackedEntityId) ?? null
    });
    linksByItemId.set(link.nonConformanceItemId, next);
  }

  const plan: DispositionRow[] = planRows.map((row) => ({
    id: row.id,
    itemId: row.itemId,
    disposition: row.disposition,
    quantity: Number(row.quantity ?? 0),
    links: linksByItemId.get(row.id) ?? []
  }));

  const blockers: IssueClosureBlocker[] = [];
  for (const row of plan) {
    if (row.links.length === 0) continue;
    if (!row.disposition || row.disposition === "Pending") {
      blockers.push({
        nonConformanceItemId: row.id,
        reason: "Disposition is still Pending"
      });
      continue;
    }
    const sum = row.links.reduce((acc, l) => acc + l.quantity, 0);
    if (Math.abs(sum - row.quantity) > 1e-6) {
      blockers.push({
        nonConformanceItemId: row.id,
        reason: `Linked entity quantity (${sum}) does not match row quantity (${row.quantity})`
      });
    }
    for (const link of row.links) {
      if (!link.trackedEntityStatus) {
        blockers.push({
          nonConformanceItemId: row.id,
          reason: "Linked tracked entity is missing"
        });
      } else if (link.trackedEntityStatus === "Consumed") {
        blockers.push({
          nonConformanceItemId: row.id,
          reason: `Tracked entity ${link.trackedEntityId} is already Consumed`
        });
      }
    }
  }

  if (blockers.length > 0) {
    return errResult(
      `Cannot close: ${blockers.map((b) => b.reason).join("; ")}`,
      blockers
    );
  }

  try {
    const result = await withAuth({ kind: "user", userId }, async (db) => {
      const [issue] = await db
        .select({
          id: nonConformanceTable.id,
          nonConformanceId: nonConformanceTable.nonConformanceId,
          status: nonConformanceTable.status,
          locationId: nonConformanceTable.locationId
        })
        .from(nonConformanceTable)
        .where(
          and(
            eq(nonConformanceTable.id, nonConformanceId),
            eq(nonConformanceTable.companyId, companyId)
          )
        )
        .limit(1);
      if (!issue) throw new Error("Issue not found");
      if (issue.status === "Closed") return { id: issue.id };

      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const readableNc = issue.nonConformanceId ?? nonConformanceId;
      const locationId = issue.locationId;

      for (const row of plan) {
        if (row.links.length === 0) continue;

        const activityId = nanoid();
        await db.insert(trackedActivityTable).values({
          id: activityId,
          type: "Disposition",
          sourceDocument: "Non-Conformance",
          sourceDocumentId: nonConformanceId,
          sourceDocumentReadableId: readableNc,
          attributes: {
            "Non-Conformance": nonConformanceId,
            Disposition: row.disposition ?? "",
            Employee: userId
          },
          companyId,
          createdBy: userId,
          createdAt: nowIso
        });

        await db.insert(trackedActivityInputTable).values(
          row.links.map((link) => ({
            trackedActivityId: activityId,
            trackedEntityId: link.trackedEntityId,
            quantity: link.quantity,
            companyId,
            createdBy: userId,
            createdAt: nowIso
          }))
        );

        if (row.disposition === "Use As Is" || row.disposition === "Rework") {
          const idsToFlip = row.links
            .filter((l) => l.trackedEntityStatus !== "Available")
            .map((l) => l.trackedEntityId);
          if (idsToFlip.length > 0) {
            await db
              .update(trackedEntityTable)
              .set({ status: "Available" })
              .where(
                and(
                  inArray(trackedEntityTable.id, idsToFlip),
                  eq(trackedEntityTable.companyId, companyId)
                )
              );
          }
          continue;
        }

        if (
          row.disposition === "Scrap" ||
          row.disposition === "Return to Supplier"
        ) {
          const commentSuffix =
            row.disposition === "Scrap" ? "scrap" : "return to supplier";

          for (const link of row.links) {
            const ledgerResult = await db.execute<{ id: string }>(sql`
              select insert_item_ledger_entry(
                ${"Negative Adjmt."}::"itemLedgerType",
                ${"Non-Conformance"},
                ${nonConformanceId},
                ${companyId},
                ${row.itemId},
                ${-link.quantity},
                ${locationId},
                ${null},
                ${link.trackedEntityId},
                ${"Rejected"},
                ${userId}
              ) as id
            `);
            const ledgerId = ledgerResult.rows[0]?.id;
            if (!ledgerId) throw new Error("Failed to create ledger entry");

            await db.execute(sql`
              update "itemLedger"
              set "comment" = ${`NC ${readableNc} ${commentSuffix}`}
              where id = ${ledgerId}
            `);
          }

          const idsToFlip = row.links
            .filter((l) => l.trackedEntityStatus !== "Rejected")
            .map((l) => l.trackedEntityId);
          if (idsToFlip.length > 0) {
            await db
              .update(trackedEntityTable)
              .set({ status: "Rejected" })
              .where(
                and(
                  inArray(trackedEntityTable.id, idsToFlip),
                  eq(trackedEntityTable.companyId, companyId)
                )
              );
          }
        }
      }

      const [updated] = await db
        .update(nonConformanceTable)
        .set({
          status: "Closed",
          closeDate: today,
          updatedBy: userId,
          updatedAt: nowIso
        })
        .where(
          and(
            eq(nonConformanceTable.id, nonConformanceId),
            eq(nonConformanceTable.companyId, companyId)
          )
        )
        .returning({ id: nonConformanceTable.id });

      if (!updated) throw new Error("Failed to close issue");

      return { id: updated.id };
    });

    return { data: result, error: null };
  } catch (err) {
    return errResult(
      err instanceof Error ? err.message : "Failed to close NCR"
    );
  }
}
