import { inngest } from "../../client";
import { invokeCarbonFunction } from "../invoke-carbon-function";

/**
 * Unified scheduling function that handles both initial scheduling and rescheduling.
 * Uses the new unified scheduling engine endpoint.
 */
export const rescheduleJobFunction = inngest.createFunction(
  {
    id: "schedule-job",
    retries: 3,
    concurrency: {
      limit: 0,
      key: "event.data.companyId"
    }
  },
  { event: "carbon/reschedule-job" },
  async ({ event, step }) => {
    const {
      jobId,
      companyId,
      userId,
      mode = "reschedule",
      direction = "backward"
    } = event.data;

    const result = await step.run("schedule-job", async () => {
      console.info(
        `${mode === "initial" ? "Scheduling" : "Rescheduling"} job ${jobId}`
      );

      try {
        const { data, error } = await invokeCarbonFunction<{
          operationsScheduled: number;
          workCentersAffected: unknown[];
          conflictsDetected: number;
          assemblyDepth: number;
        }>("schedule", {
          body: {
            jobId,
            companyId,
            userId,
            mode,
            direction
          }
        });

        if (error) {
          throw new Error(error.message || `Failed to ${mode} schedule job`);
        }

        console.info(
          `${mode === "initial" ? "Scheduled" : "Rescheduled"}: ` +
            `${data?.operationsScheduled ?? 0} ops, ` +
            `${data?.workCentersAffected.length ?? 0} WCs, ` +
            `${data?.conflictsDetected ?? 0} conflicts`
        );

        return {
          success: true,
          operationsScheduled: data?.operationsScheduled ?? 0,
          conflictsDetected: data?.conflictsDetected ?? 0,
          workCentersAffected: data?.workCentersAffected ?? [],
          assemblyDepth: data?.assemblyDepth ?? 0
        };
      } catch (error) {
        console.error(
          `${mode === "initial" ? "Scheduling" : "Rescheduling"} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw error; // Let Inngest handle retries
      }
    });

    return result;
  }
);
