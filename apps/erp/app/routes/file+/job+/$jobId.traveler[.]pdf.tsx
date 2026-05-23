import { requirePermissions } from "@carbon/auth/auth.server";
import { Footer, JobTravelerPageContent } from "@carbon/documents/pdf";
import type { JSONContent } from "@carbon/react";
import { getPreferenceHeaders } from "@carbon/react";
import { flattenTree, generateBomIds } from "@carbon/utils";
import {
  Document,
  Font,
  Page,
  renderToStream,
  StyleSheet
} from "@react-pdf/renderer";
import type { LoaderFunctionArgs } from "react-router";
import {
  getJob,
  getJobMethodTree,
  getJobOperationsByMethodId,
  getTrackedEntityByJobId
} from "~/modules/production/production.service";
import { getCompany, getCompanySettings } from "~/modules/settings";
import { getBase64ImageFromStorage } from "~/modules/shared";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {});
  const { locale } = getPreferenceHeaders(request);

  const { jobId } = params;
  if (!jobId) throw new Error("Could not find job id");

  // Get the job first
  const job = await getJob(client, jobId, companyId);
  if (job.error || !job.data) {
    console.error(job.error);
    throw new Error("Failed to load job");
  }

  // Verify job belongs to this company
  if (job.data.companyId !== companyId) {
    throw new Error("Job does not belong to this company");
  }

  // Get all make methods for this job
  const jobMakeMethods = await client
    .from("jobMakeMethod")
    .select("*")
    .eq("jobId", jobId)
    .eq("companyId", companyId)
    .order("createdAt", { ascending: true });

  if (jobMakeMethods.error || !jobMakeMethods.data) {
    console.error(jobMakeMethods.error);
    throw new Error("Failed to load job make methods");
  }

  const [company, companySettings] = await Promise.all([
    getCompany(client, job.data.companyId ?? ""),
    getCompanySettings(client, job.data.companyId ?? "")
  ]);
  if (company.error) {
    console.error(company.error);
    throw new Error("Failed to load company");
  }
  if (companySettings.error) {
    console.error(companySettings.error);
    throw new Error("Failed to load company settings");
  }

  const customer = await client
    .from("customer")
    .select("*")
    .eq("id", job.data.customerId ?? "")
    .eq("companyId", companyId)
    .maybeSingle();

  // Get job notes if they exist
  const jobNotes = job.data.notes as JSONContent | undefined;

  // Compute BOM IDs for all make methods
  const bomIdMap = new Map<string, string>();
  const methodTree = await getJobMethodTree(client, jobId, companyId);
  if (!methodTree.error && methodTree.data?.length > 0) {
    const flatMethods = flattenTree(methodTree.data[0]);
    const bomIds = generateBomIds(flatMethods);
    flatMethods.forEach((node, index) => {
      bomIdMap.set(node.data.jobMaterialMakeMethodId, bomIds[index]);
    });
  }

  // For each make method, get operations and item data
  const makeMethodsWithData = await Promise.all(
    jobMakeMethods.data.map(async (makeMethod) => {
      const [operations, item] = await Promise.all([
        getJobOperationsByMethodId(client, makeMethod.id, companyId),
        client
          .from("item")
          .select("*")
          .eq("id", makeMethod.itemId ?? "")
          .eq("companyId", companyId)
          .single()
      ]);

      if (operations.error || !operations.data) {
        console.error(operations.error);
        throw new Error(
          `Failed to load operations for make method ${makeMethod.id}`
        );
      }

      if (item.error || !item.data) {
        console.error(item.error);
        throw new Error(`Failed to load item for make method ${makeMethod.id}`);
      }

      const modelUpload = item.data.modelUploadId
        ? await client
            .from("modelUpload")
            .select("thumbnailPath")
            .eq("id", item.data.modelUploadId)
            .eq("companyId", companyId)
            .single()
        : { data: null };
      const itemWithModelUpload = {
        ...item.data,
        modelUpload: modelUpload.data
      };

      // Get thumbnail if it exists
      let thumbnail: string | null = null;
      if (
        itemWithModelUpload.thumbnailPath ||
        itemWithModelUpload.modelUpload?.thumbnailPath
      ) {
        thumbnail = await getBase64ImageFromStorage(
          client,
          itemWithModelUpload.thumbnailPath ??
            itemWithModelUpload.modelUpload?.thumbnailPath ??
            ""
        );
      }

      // Get batch number if item is tracked
      let batchNumber: string | undefined;
      if (
        ["Batch", "Serial"].includes(item.data.itemTrackingType) &&
        makeMethod.parentMaterialId === null
      ) {
        const trackedEntity = await getTrackedEntityByJobId(
          client,
          job.data!.id!,
          companyId
        );
        if (!trackedEntity.error && trackedEntity.data) {
          batchNumber = trackedEntity.data.readableId ?? undefined;
        }
      }

      return {
        makeMethod,
        operations: operations.data,
        item: itemWithModelUpload,
        thumbnail,
        batchNumber,
        bomId: bomIdMap.get(makeMethod.id)
      };
    })
  );

  // Register fonts (same as Template component)
  Font.register({
    family: "Inter",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuOKfMZhrib2Bg-4.ttf",
        fontWeight: 300
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fMZhrib2Bg-4.ttf",
        fontWeight: 500
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf",
        fontWeight: 700
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuBWYMZhrib2Bg-4.ttf",
        fontWeight: 900
      }
    ]
  });

  const styles = StyleSheet.create({
    body: {
      fontFamily: "Inter",
      padding: "20px 40px 50px 40px",
      color: "#000000",
      backgroundColor: "#FFFFFF"
    }
  });

  // Render multiple pages - one per make method
  const stream = await renderToStream(
    <Document
      title="Job Traveler"
      author="Carbon"
      subject="Job Traveler"
      keywords="job traveler, manufacturing"
    >
      {makeMethodsWithData.map((data, index) => (
        <Page key={data.makeMethod.id} size="A4" style={styles.body}>
          <JobTravelerPageContent
            company={company.data as any}
            job={job.data}
            jobOperations={data.operations}
            customer={customer.data}
            item={data.item}
            batchNumber={data.batchNumber}
            bomId={data.bomId}
            locale={locale}
            notes={index === 0 ? jobNotes : undefined}
            thumbnail={data.thumbnail}
            methodRevision={data.makeMethod.version?.toString()}
            includeWorkInstructions={
              companySettings.data?.jobTravelerIncludeWorkInstructions ?? false
            }
          />
          <Footer />
        </Page>
      ))}
    </Document>
  );

  const body: Buffer = await new Promise((resolve, reject) => {
    const buffers: Uint8Array[] = [];
    stream.on("data", (data) => {
      buffers.push(data);
    });
    stream.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
    stream.on("error", reject);
  });

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${company.data.name} - ${job.data.jobId}.pdf"`
  });
  return new Response(new Uint8Array(body), { status: 200, headers });
}
