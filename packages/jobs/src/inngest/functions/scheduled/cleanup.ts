import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { NOVU_API_URL, NOVU_SECRET_KEY } from "@carbon/env";
import type { TriggerPayload } from "@carbon/notifications";
import {
  getSubscriberId,
  NotificationEvent,
  NotificationWorkflow,
  triggerBulk
} from "@carbon/notifications";
import { Novu } from "@novu/node";
import { inngest } from "../../client";
import type { JobQueryClient } from "../../../lib/query-client";

export const cleanupFunction = inngest.createFunction(
  { id: "cleanup", retries: 2 },
  { cron: "0 7,12,17 * * *" },
  async ({ step }) => {
    const serviceClient = getCarbonServiceClient();
    const novu = new Novu(NOVU_SECRET_KEY!, {
      backendUrl: NOVU_API_URL
    });

    await step.run("expire-quotes-and-rfqs", async () => {
      console.log(`Starting cleanup tasks: ${new Date().toISOString()}`);

      // Clean up expired quotes
      console.log("Checking for expired quotes...");
      const [expiredQuotes, expiredSupplierQuotes] = await Promise.all([
        serviceClient
          .from("quote")
          .select("*")
          .eq("status", "Sent")
          .not("expirationDate", "is", null)
          .lt("expirationDate", new Date().toISOString()),
        serviceClient
          .from("supplierQuote")
          .select("*")
          .eq("status", "Active")
          .not("expirationDate", "is", null)
          .lt("expirationDate", new Date().toISOString())
      ]);

      if (expiredQuotes.error) {
        console.error(
          `Error fetching expired quotes: ${JSON.stringify(expiredQuotes.error)}`
        );
        return;
      }

      if (expiredSupplierQuotes.error) {
        console.error(
          `Error fetching expired supplier quotes: ${JSON.stringify(
            expiredSupplierQuotes.error
          )}`
        );
        return;
      }

      const activeExpiredSupplierQuotes = await filterRowsToActiveCompanies(
        serviceClient,
        expiredSupplierQuotes.data
      );

      if (activeExpiredSupplierQuotes.length > 0) {
        console.log(
          `Found ${activeExpiredSupplierQuotes.length} expired supplier quotes`
        );
        const companyIds = [
          ...new Set(activeExpiredSupplierQuotes.map((quote) => quote.companyId))
        ];
        const expireSupplierQuotes = await serviceClient
          .from("supplierQuote")
          .update({ status: "Expired" })
          .in(
            "id",
            activeExpiredSupplierQuotes.map((quote) => quote.id)
          )
          .in("companyId", companyIds);

        if (expireSupplierQuotes.error) {
          console.error(
            `Error updating expired supplier quotes: ${JSON.stringify(
              expireSupplierQuotes.error
            )}`
          );
          return;
        }
      } else {
        console.log("No expired supplier quotes found");
      }

      // Auto-expire purchasing RFQs past due date
      console.log("Checking for expired purchasing RFQs...");
      const expiredRfqs = await serviceClient
        .from("purchasingRfq")
        .select("*")
        .in("status", ["Draft", "Requested"])
        .not("expirationDate", "is", null)
        .lt("expirationDate", new Date().toISOString());

      if (expiredRfqs.error) {
        console.error(
          `Error fetching expired RFQs: ${JSON.stringify(expiredRfqs.error)}`
        );
      } else {
        const activeExpiredRfqs = await filterRowsToActiveCompanies(
          serviceClient,
          expiredRfqs.data
        );

        if (activeExpiredRfqs.length > 0) {
          console.log(`Found ${activeExpiredRfqs.length} expired RFQs`);
          const companyIds = [
            ...new Set(activeExpiredRfqs.map((rfq) => rfq.companyId))
          ];
          const closeRfqs = await serviceClient
            .from("purchasingRfq")
            .update({ status: "Closed" })
            .in(
              "id",
              activeExpiredRfqs.map((rfq) => rfq.id)
            )
            .in("companyId", companyIds);

          if (closeRfqs.error) {
            console.error(
              `Error closing expired RFQs: ${JSON.stringify(closeRfqs.error)}`
            );
          }
        } else {
          console.log("No expired RFQs found");
        }
      }

      const activeExpiredQuotes = await filterRowsToActiveCompanies(
        serviceClient,
        expiredQuotes.data
      );

      if (!activeExpiredQuotes.length) {
        console.log("No expired quotes found requiring notification");
      } else {
        console.log(`Found ${activeExpiredQuotes.length} expired quotes`);
        const companyIds = [
          ...new Set(activeExpiredQuotes.map((quote) => quote.companyId))
        ];
        const expireQuotes = await serviceClient
          .from("quote")
          .update({ status: "Expired" })
          .in(
            "id",
            activeExpiredQuotes.map((quote) => quote.id)
          )
          .in("companyId", companyIds);

        if (expireQuotes.error) {
          console.error(
            `Error updating expired quotes: ${JSON.stringify(
              expireQuotes.error
            )}`
          );
          return;
        }

        const notificationPayloads: TriggerPayload[] = activeExpiredQuotes
          .filter((quote) => Boolean(quote.salesPersonId))
          .map((quote) => {
            return {
              workflow: NotificationWorkflow.Expiration,
              payload: {
                documentId: quote.id,
                event: NotificationEvent.QuoteExpired,
                recordId: quote.id,
                description: `Quote ${quote.quoteId} has expired`
              },
              user: {
                subscriberId: getSubscriberId({
                  companyId: quote.companyId,
                  userId: quote.salesPersonId!
                })
              }
            };
          });

        if (notificationPayloads.length > 0) {
          console.log(
            `Triggering ${notificationPayloads.length} notifications`
          );
          try {
            await triggerBulk(novu, notificationPayloads.flat());
          } catch (error) {
            console.error("Error triggering notifications");
            console.error(error);
          }
        } else {
          console.log("No notifications to trigger");
        }
      }
    });

    await step.run("check-gauge-calibration", async () => {
      // Check for gauges going out of calibration
      console.log("Checking for gauges going out of calibration...");
      const outOfCalibrationGauges = await serviceClient
        .from("gauges")
        .select("*")
        .eq("gaugeCalibrationStatusWithDueDate", "Out-of-Calibration")
        .neq("lastCalibrationStatus", "Out-of-Calibration");

      if (outOfCalibrationGauges.error) {
        console.error(
          `Error fetching out of calibration gauges: ${JSON.stringify(
            outOfCalibrationGauges.error
          )}`
        );
      } else if (outOfCalibrationGauges.data.length > 0) {
        const activeOutOfCalibrationGauges = await filterRowsToActiveCompanies(
          serviceClient,
          outOfCalibrationGauges.data
        );

        console.log(
          `Found ${activeOutOfCalibrationGauges.length} gauges going out of calibration`
        );

        // Get unique company IDs
        const companyIds = [
          ...new Set(
            activeOutOfCalibrationGauges
              .map((g) => g.companyId)
              .filter((id): id is string => id !== null)
          )
        ];

        if (companyIds.length === 0) {
          console.log("No active-company gauges going out of calibration found");
          return;
        }

        // Fetch all company settings at once
        const companySettingsResult = await serviceClient
          .from("companySettings")
          .select("id, gaugeCalibrationExpiredNotificationGroup")
          .in("id", companyIds);

        if (companySettingsResult.error) {
          console.error(
            `Error fetching company settings: ${JSON.stringify(
              companySettingsResult.error
            )}`
          );
        } else {
          // Create a map of companyId -> notification group
          const notificationGroupsByCompany = new Map(
            companySettingsResult.data.map((settings) => [
              settings.id,
              settings.gaugeCalibrationExpiredNotificationGroup ?? []
            ])
          );

          const gaugeNotificationPayloads: TriggerPayload[] = [];

          // Create notification payloads for each gauge
          for (const gauge of activeOutOfCalibrationGauges) {
            if (!gauge.companyId || !gauge.id) continue;

            const notificationGroup =
              notificationGroupsByCompany.get(gauge.companyId) ?? [];

            if (notificationGroup.length === 0) {
              console.log(
                `No notification group configured for company ${gauge.companyId}, skipping gauge ${gauge.gaugeId}`
              );
              continue;
            }

            // Create notification payloads for each user in the notification group
            for (const userId of notificationGroup) {
              gaugeNotificationPayloads.push({
                workflow: NotificationWorkflow.GaugeCalibration,
                payload: {
                  event: NotificationEvent.GaugeCalibrationExpired,
                  recordId: gauge.id,
                  description: `Gauge ${gauge.gaugeId} is out of calibration`
                },
                user: {
                  subscriberId: getSubscriberId({
                    companyId: gauge.companyId,
                    userId
                  })
                }
              });
            }
          }

          if (gaugeNotificationPayloads.length > 0) {
            console.log(
              `Triggering ${gaugeNotificationPayloads.length} gauge calibration notifications`
            );
            try {
              await triggerBulk(novu, gaugeNotificationPayloads);

              // Update lastCalibrationStatus for gauges that had notifications sent
              // Extract unique gauge IDs from the notification payloads
              const gaugeIdsToUpdate = [
                ...new Set(
                  gaugeNotificationPayloads.map(
                    (payload) => payload.payload.recordId
                  )
                )
              ];
              const gaugeCompanyIdsToUpdate = [
                ...new Set(
                  activeOutOfCalibrationGauges
                    .filter((gauge) => gaugeIdsToUpdate.includes(gauge.id))
                    .map((gauge) => gauge.companyId)
                    .filter((id): id is string => Boolean(id))
                )
              ];

              const updateGauges = await serviceClient
                .from("gauge")
                .update({ lastCalibrationStatus: "Out-of-Calibration" })
                .in("id", gaugeIdsToUpdate)
                .in("companyId", gaugeCompanyIdsToUpdate);

              if (updateGauges.error) {
                console.error(
                  `Error updating gauge lastCalibrationStatus: ${JSON.stringify(
                    updateGauges.error
                  )}`
                );
              } else {
                console.log(
                  `Updated lastCalibrationStatus for ${gaugeIdsToUpdate.length} gauges`
                );
              }
            } catch (error) {
              console.error("Error triggering gauge calibration notifications");
              console.error(error);
            }
          } else {
            console.log("No gauge calibration notifications to trigger");
          }
        }
      } else {
        console.log("No gauges going out of calibration found");
      }

      console.log(`Cleanup tasks completed: ${new Date().toISOString()}`);
    });
  }
);

async function filterRowsToActiveCompanies<
  T extends { companyId?: string | null }
>(client: JobQueryClient, rows: T[]) {
  const companyIds = [
    ...new Set(
      rows.map((row) => row.companyId).filter((id): id is string => Boolean(id))
    )
  ];

  if (companyIds.length === 0) {
    return [];
  }

  const activeCompanies = await client
    .from("company")
    .select("id")
    .eq("active", true)
    .in("id", companyIds);

  if (activeCompanies.error) {
    throw new Error(
      `Failed to filter cleanup rows by active companies: ${JSON.stringify(
        activeCompanies.error
      )}`
    );
  }

  const activeCompanyIds = new Set(
    (activeCompanies.data ?? []).map((company: { id: string }) => company.id)
  );

  return rows.filter(
    (row) =>
      typeof row.companyId === "string" && activeCompanyIds.has(row.companyId)
  );
}
