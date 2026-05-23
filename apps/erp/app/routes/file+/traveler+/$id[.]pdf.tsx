import { requirePermissions } from "@carbon/auth/auth.server";
import { JobTravelerPDF } from "@carbon/documents/pdf";
import type { JSONContent } from "@carbon/react";
import { getPreferenceHeaders } from "@carbon/react";
import { flattenTree, generateBomIds } from "@carbon/utils";
import { renderToStream } from "@react-pdf/renderer";
import type { LoaderFunctionArgs } from "react-router";
import {
  getJob,
  getJobMakeMethodById,
  getJobMethodTree,
  getJobOperationsByMethodId,
  getTrackedEntityByJobId
} from "~/modules/production/production.service";
import { getCompany, getCompanySettings } from "~/modules/settings";
import { getBase64ImageFromStorage } from "~/modules/shared";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {});

  const { id } = params;
  if (!id) throw new Error("Could not find job make method id");

  // we add the companyId to make sure we belong to the company
  // while allowing guys on the shop floor with no permissions to download the traveler
  const jobMakeMethod = await getJobMakeMethodById(client, id, companyId);
  if (jobMakeMethod.error) {
    console.error(jobMakeMethod.error);
    throw new Error("Failed to load job make method");
  }

  const [company, job, companySettings] = await Promise.all([
    getCompany(client, jobMakeMethod.data?.companyId ?? ""),
    getJob(client, jobMakeMethod.data?.jobId ?? "", companyId),
    getCompanySettings(client, jobMakeMethod.data?.companyId ?? "")
  ]);

  if (company.error) {
    console.error(company.error);
    throw new Error("Failed to load company");
  }

  if (job.error || !job.data) {
    console.error(job.error);
    throw new Error("Failed to load job");
  }
  if (job.data.companyId !== companyId) {
    throw new Error("Job does not belong to this company");
  }

  if (companySettings.error) {
    console.error(companySettings.error);
    throw new Error("Failed to load company settings");
  }

  const [jobOperations, customer, item] = await Promise.all([
    getJobOperationsByMethodId(client, id, companyId),
    client
      .from("customer")
      .select("*")
      .eq("id", job.data.customerId ?? "")
      .eq("companyId", companyId)
      .maybeSingle(),
    client
      .from("item")
      .select("*")
      .eq("id", jobMakeMethod.data.itemId ?? "")
      .eq("companyId", companyId)
      .single()
  ]);

  if (jobOperations.error || !jobOperations.data) {
    console.error(jobOperations.error);
    throw new Error("Failed to load job operations");
  }

  if (item.error || !item.data) {
    console.error(item.error);
    throw new Error("Failed to load item");
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

  let batchNumber: string | undefined;
  if (["Batch", "Serial"].includes(item.data.itemTrackingType)) {
    const trackedEntity = await getTrackedEntityByJobId(
      client,
      job.data.id!,
      companyId
    );
    if (trackedEntity.error) {
      console.error(trackedEntity.error);
      throw new Error("Failed to load tracked entity");
    }
    batchNumber = trackedEntity.data?.readableId ?? undefined;
  }

  // Get job notes if they exist
  const jobNotes = job.data.notes as JSONContent | undefined;

  // Compute BOM ID for this make method
  let bomId: string | undefined;
  const methodTree = await getJobMethodTree(client, job.data.id!, companyId);
  if (!methodTree.error && methodTree.data?.length > 0) {
    const flatMethods = flattenTree(methodTree.data[0]);
    const bomIds = generateBomIds(flatMethods);
    // Find the node matching this make method
    const nodeIndex = flatMethods.findIndex(
      (node) => node.data.jobMaterialMakeMethodId === id
    );
    if (nodeIndex >= 0) {
      bomId = bomIds[nodeIndex];
    }
  }

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

  const { locale } = getPreferenceHeaders(request);

  const stream = await renderToStream(
    <JobTravelerPDF
      company={company.data as any}
      job={job.data}
      jobMakeMethod={jobMakeMethod.data}
      jobOperations={jobOperations.data}
      customer={customer.data}
      item={itemWithModelUpload}
      batchNumber={batchNumber}
      bomId={bomId}
      locale={locale}
      meta={{
        author: "Carbon",
        keywords: "job traveler, manufacturing",
        subject: "Job Traveler"
      }}
      notes={jobNotes}
      thumbnail={thumbnail}
      title="Job Traveler"
      includeWorkInstructions={
        companySettings.data?.jobTravelerIncludeWorkInstructions ?? false
      }
    />
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
