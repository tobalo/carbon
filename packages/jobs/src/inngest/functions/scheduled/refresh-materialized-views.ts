import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { inngest } from "../../client";

export const refreshMaterializedViewsFunction = inngest.createFunction(
  { id: "refresh-materialized-views", retries: 2 },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const serviceClient = getCarbonServiceClient();

    await step.run("refresh-item-stock-quantities", async () => {
      console.log(
        `Refreshing item stock quantities: ${new Date().toISOString()}`
      );

      const result = await serviceClient.rpc("refresh_item_stock_quantities");

      if (result.error) {
        throw new Error(
          `Failed to refresh item stock quantities: ${
            result.error instanceof Error
              ? result.error.message
              : JSON.stringify(result.error)
          }`
        );
      }
    });
  }
);
