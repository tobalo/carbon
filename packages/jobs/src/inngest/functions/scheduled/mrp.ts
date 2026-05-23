import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { inngest } from "../../client";
import { invokeFunction } from "../../../lib/functions";

export const mrpFunction = inngest.createFunction(
  { id: "mrp", retries: 2 },
  { cron: "0 */3 * * *" },
  async ({ step }) => {
    const serviceClient = getCarbonServiceClient();
    await step.run("run-mrp-for-all-companies", async () => {
      console.log(
        `Scheduled MRP Calculation Started: ${new Date().toISOString()}`
      );

      const companyPlans = await serviceClient.from("companyPlan").select("id");

      if (companyPlans.error) {
        console.error(
          `Failed to get companies: ${
            companyPlans.error instanceof Error
              ? companyPlans.error.message
              : String(companyPlans.error)
          }`
        );
        return;
      }

      const companyIds = companyPlans.data.map((plan) => plan.id);
      if (companyIds.length === 0) {
        console.log("No company plans found");
        return;
      }

      const companies = await serviceClient
        .from("company")
        .select("id, name, active")
        .in("id", companyIds);

      if (companies.error) {
        console.error(
          `Failed to load companies for MRP: ${
            companies.error instanceof Error
              ? companies.error.message
              : String(companies.error)
          }`
        );
        return;
      }

      const companiesById = new Map(
        companies.data.map((company) => [company.id, company])
      );

      for (const plan of companyPlans.data) {
        const company = companiesById.get(plan.id);
        if (company?.active !== true) {
          console.log(`Skipping inactive company ${company?.name ?? plan.id}`);
          continue;
        }

        try {
          const result = await invokeFunction("mrp", {
            body: {
              type: "company",
              id: plan.id,
              companyId: plan.id,
              userId: "system"
            }
          });

          if (result.error) {
            console.error(
              `Failed to run MRP for company ${company.name}: ${
                result.error instanceof Error
                  ? result.error.message
                  : String(result.error)
              }`
            );
          } else {
            console.log(`Successfully ran MRP for company ${company.name}`);
          }
        } catch (error) {
          console.error(
            `Unexpected error in MRP run task: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    });
  }
);
