import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { inngest } from "../../client";

export const timeCardAutoCloseFunction = inngest.createFunction(
  { id: "timecard-auto-close", retries: 2 },
  // Run every Sunday at 11pm UTC (after weekly task at 9pm)
  { cron: "0 23 * * 0" },
  async ({ step }) => {
    const serviceClient = getCarbonServiceClient();

    await step.run("auto-close-timecards", async () => {
      console.log(`Starting timecard auto-close: ${new Date().toISOString()}`);

      try {
        // 1. Get all companies with time clock enabled
        const { data: companySettings, error: companiesError } =
          await serviceClient
            .from("companySettings")
            .select("id")
            .eq("timeCardEnabled", true);

        if (companiesError) {
          console.error(`Failed to fetch companies: ${companiesError.message}`);
          return;
        }

        console.log(
          `Found ${companySettings?.length || 0} companies with time clock enabled`
        );

        const companyIds =
          companySettings?.map((settings) => settings.id) ?? [];
        if (companyIds.length === 0) return;

        const { data: companies, error: activeCompaniesError } =
          await serviceClient
            .from("company")
            .select("id, name, active")
            .in("id", companyIds);

        if (activeCompaniesError) {
          console.error(
            `Failed to load timecard companies: ${activeCompaniesError.message}`
          );
          return;
        }

        const companiesById = new Map(
          (companies ?? []).map((company) => [company.id, company])
        );

        let totalClosed = 0;

        for (const settings of companySettings ?? []) {
          const company = companiesById.get(settings.id);
          if (company?.active !== true) {
            console.log(
              `Skipping inactive company ${company?.name ?? settings.id}`
            );
            continue;
          }

          // 2. Get all open time clock entries for this company
          const { data: openEntries, error: entriesError } = await serviceClient
            .from("timeCardEntry")
            .select("id, employeeId, clockIn")
            .eq("companyId", company.id)
            .is("clockOut", null);

          if (entriesError) {
            console.error(
              `Failed to fetch open entries for company ${company.id}: ${entriesError.message}`
            );
            continue;
          }

          if (!openEntries || openEntries.length === 0) continue;

          console.log(
            `Company ${company.id}: ${openEntries.length} open entries`
          );

          for (const entry of openEntries) {
            // 3. Get the employee's assigned shift
            const { data: employeeJob } = await serviceClient
              .from("employeeJob")
              .select("shiftId")
              .eq("id", entry.employeeId)
              .eq("companyId", company.id)
              .single();

            let clockOut: Date;
            let shiftId: string | null = null;

            if (employeeJob?.shiftId) {
              const { data: shift } = await serviceClient
                .from("shift")
                .select("startTime, endTime")
                .eq("id", employeeJob.shiftId)
                .eq("companyId", company.id)
                .single();

              if (shift) {
                // Calculate shift duration
                const startParts = shift.startTime.split(":").map(Number);
                const endParts = shift.endTime.split(":").map(Number);
                let durationMinutes =
                  endParts[0]! * 60 +
                  endParts[1]! -
                  (startParts[0]! * 60 + startParts[1]!);
                // Handle overnight shifts
                if (durationMinutes <= 0) durationMinutes += 24 * 60;

                clockOut = new Date(
                  new Date(entry.clockIn).getTime() + durationMinutes * 60000
                );
                shiftId = employeeJob.shiftId;
              } else {
                // Shift not found, fall back to 8 hours
                clockOut = new Date(
                  new Date(entry.clockIn).getTime() + 8 * 3600000
                );
              }
            } else {
              // No shift assigned, fall back to 8 hours
              clockOut = new Date(
                new Date(entry.clockIn).getTime() + 8 * 3600000
              );
            }

            // 4. Update the entry
            const { error: updateError } = await serviceClient
              .from("timeCardEntry")
              .update({
                clockOut: clockOut.toISOString(),
                autoCloseShiftId: shiftId,
                updatedAt: new Date().toISOString(),
                note: "Auto-closed by system (Sunday weekly close)"
              })
              .eq("id", entry.id)
              .eq("companyId", company.id);

            if (updateError) {
              console.error(
                `Failed to auto-close entry ${entry.id}: ${updateError.message}`
              );
            } else {
              totalClosed++;
              console.log(
                `Auto-closed entry ${entry.id} for employee ${entry.employeeId}`
              );
            }
          }
        }

        console.log(
          `Timecard auto-close completed: ${totalClosed} entries closed`
        );
      } catch (err) {
        console.error(
          `Unexpected error in timecard auto-close: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    });
  }
);
