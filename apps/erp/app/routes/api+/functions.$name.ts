import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { openai } from "@ai-sdk/openai";
import { convert, convertArgsValidator } from "@carbon/database/convert";
import { create } from "@carbon/database/create";
import { getMethod, getMethodArgsValidator } from "@carbon/database/get-method";
import { importCsv, importCsvArgsValidator } from "@carbon/database/import-csv";
import { issue, issueArgsValidator } from "@carbon/database/issue";
import { mrpArgsValidator, runMrp } from "@carbon/database/mrp";
import {
  postPurchaseInvoice,
  postPurchaseInvoiceArgsValidator
} from "@carbon/database/post-purchase-invoice";
import {
  postReceipt,
  postReceiptArgsValidator
} from "@carbon/database/post-receipt";
import {
  postSalesInvoice,
  postSalesInvoiceArgsValidator
} from "@carbon/database/post-sales-invoice";
import {
  postShipment,
  postShipmentArgsValidator
} from "@carbon/database/post-shipment";
import {
  postStockTransfer,
  postStockTransferArgsValidator
} from "@carbon/database/post-stock-transfer";
import { recalculate } from "@carbon/database/recalculate";
import { schedule, scheduleArgsValidator } from "@carbon/database/schedule";
import { seedCompany } from "@carbon/database/seed-company";
import { sync, syncArgsValidator } from "@carbon/database/sync";
import { embed } from "ai";
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";

const embeddingModel = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

const embeddingBodySchema = z.object({
  text: z.string().min(1)
});

const embedJobSchema = z.object({
  jobId: z.number(),
  id: z.string(),
  table: z.enum(["customer", "item", "supplier"]),
  companyId: z.string()
});

const closeJobBodySchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  companyId: z.string()
});

const postProductionEventBodySchema = z.object({
  productionEventId: z.string(),
  userId: z.string(),
  companyId: z.string()
});

const updatePurchasedPricesBodySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("purchaseOrder"),
    purchaseOrderId: z.string(),
    companyId: z.string(),
    updatePrices: z.boolean().optional(),
    updateLeadTimes: z.boolean().optional()
  }),
  z.object({
    source: z.literal("purchaseInvoice"),
    invoiceId: z.string(),
    companyId: z.string(),
    updatePrices: z.boolean().optional(),
    updateLeadTimes: z.boolean().optional()
  })
]);

const seedCompanyBodySchema = z.object({
  companyId: z.string(),
  userId: z.string(),
  parentCompanyId: z.string().optional().nullable()
});

const recalculateBodySchema = z.object({
  type: z.enum(["jobMakeMethodRequirements", "jobRequirements"]),
  id: z.string(),
  companyId: z.string(),
  userId: z.string()
});

const createBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("nonConformanceTasks"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("purchaseOrderFromJob"),
    jobId: z.string(),
    purchaseOrdersBySupplierId: z.record(z.string(), z.string()),
    companyId: z.string(),
    userId: z.string()
  })
]);

type EmbedJob = z.infer<typeof embedJobSchema>;
type FailedEmbedJob = EmbedJob & { error: string };

export async function action({ params, request }: ActionFunctionArgs) {
  const unauthorized = validateFunctionAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  if (request.method !== "POST") {
    return Response.json({ message: "expected POST request" }, { status: 405 });
  }

  const name = params.name;
  const body = await request.json().catch(() => null);

  try {
    switch (name) {
      case "embedding":
        return await handleEmbedding(body);
      case "embed":
        return await handleEmbed(body);
      case "close-job":
        return await handleCloseJob(body);
      case "post-production-event":
        return await handlePostProductionEvent(body);
      case "post-purchase-invoice":
        return await handlePostPurchaseInvoice(body);
      case "post-receipt":
        return await handlePostReceipt(body);
      case "post-sales-invoice":
        return await handlePostSalesInvoice(body);
      case "post-shipment":
        return await handlePostShipment(body);
      case "post-stock-transfer":
        return await handlePostStockTransfer(body);
      case "update-purchased-prices":
        return await handleUpdatePurchasedPrices(body);
      case "seed-company":
        return await handleSeedCompany(body);
      case "recalculate":
        return await handleRecalculate(body);
      case "convert":
        return await handleConvert(body);
      case "create":
        return await handleCreate(body);
      case "import-csv":
        return await handleImportCsv(body);
      case "issue":
        return await handleIssue(body);
      case "get-method":
        return await handleGetMethod(body);
      case "mrp":
        return await handleMrp(body);
      case "schedule":
        return await handleSchedule(body);
      case "sync":
        return await handleSync(body);
      default:
        return Response.json(
          { message: `Function ${name ?? ""} is not ported to Node routes yet` },
          { status: 501 }
        );
    }
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function handleSeedCompany(body: unknown) {
  const payload = seedCompanyBodySchema.parse(body);
  return Response.json(await seedCompany(payload));
}

async function handleRecalculate(body: unknown) {
  const payload = recalculateBodySchema.parse(body);
  return Response.json(await recalculate(payload));
}

async function handleConvert(body: unknown) {
  const payload = convertArgsValidator.parse(body);
  return Response.json(await convert(payload));
}

async function handleCreate(body: unknown) {
  const payload = createBodySchema.parse(body);
  return Response.json(await create(payload));
}

async function handleImportCsv(body: unknown) {
  const payload = importCsvArgsValidator.parse(body);
  return Response.json(await importCsv(payload));
}

async function handleIssue(body: unknown) {
  const payload = issueArgsValidator.parse(body);
  return Response.json(await issue(payload));
}

async function handleGetMethod(body: unknown) {
  const payload = getMethodArgsValidator.parse(body);
  return Response.json(await getMethod(payload));
}

async function handleMrp(body: unknown) {
  const payload = mrpArgsValidator.parse(body);
  return Response.json(await runMrp(payload));
}

async function handleSchedule(body: unknown) {
  const payload = scheduleArgsValidator.parse(body);
  return Response.json(await schedule(payload));
}

async function handleSync(body: unknown) {
  const payload = syncArgsValidator.parse(body);
  return Response.json(await sync(payload));
}

async function handleEmbedding(body: unknown) {
  const { text } = embeddingBodySchema.parse(body);
  const embedding = await generateEmbedding(text);
  return Response.json({ embedding });
}

async function handleEmbed(body: unknown) {
  const jobs = z.array(embedJobSchema).parse(body);
  const completedJobs: EmbedJob[] = [];
  const failedJobs: FailedEmbedJob[] = [];
  const client = getCarbonServiceClient();

  for (const job of jobs) {
    try {
      await processEmbedJob(client, job);
      completedJobs.push(job);
    } catch (error) {
      failedJobs.push({
        ...job,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return Response.json({ completedJobs, failedJobs });
}

async function handleCloseJob(body: unknown) {
  const { jobId, userId, companyId } = closeJobBodySchema.parse(body);
  return Response.json(
    await callServiceRpc("close_job_to_gl", {
      p_job_id: jobId,
      p_user_id: userId,
      p_company_id: companyId
    })
  );
}

async function handlePostProductionEvent(body: unknown) {
  const { productionEventId, userId, companyId } =
    postProductionEventBodySchema.parse(body);
  return Response.json(
    await callServiceRpc("post_production_event_to_gl", {
      p_production_event_id: productionEventId,
      p_user_id: userId,
      p_company_id: companyId
    })
  );
}

async function handlePostPurchaseInvoice(body: unknown) {
  const payload = postPurchaseInvoiceArgsValidator.parse(body);
  return Response.json(await postPurchaseInvoice(payload));
}

async function handlePostReceipt(body: unknown) {
  const payload = postReceiptArgsValidator.parse(body);
  return Response.json(await postReceipt(payload));
}

async function handlePostSalesInvoice(body: unknown) {
  const payload = postSalesInvoiceArgsValidator.parse(body);
  return Response.json(await postSalesInvoice(payload));
}

async function handlePostShipment(body: unknown) {
  const payload = postShipmentArgsValidator.parse(body);
  return Response.json(await postShipment(payload));
}

async function handlePostStockTransfer(body: unknown) {
  const payload = postStockTransferArgsValidator.parse(body);
  return Response.json(await postStockTransfer(payload));
}

async function handleUpdatePurchasedPrices(body: unknown) {
  const payload = updatePurchasedPricesBodySchema.parse(body);
  return Response.json(
    await callServiceRpc("update_purchased_prices", {
      p_source: payload.source,
      p_purchase_order_id:
        payload.source === "purchaseOrder" ? payload.purchaseOrderId : null,
      p_invoice_id: payload.source === "purchaseInvoice" ? payload.invoiceId : null,
      p_company_id: payload.companyId,
      p_update_prices: payload.updatePrices ?? true,
      p_update_lead_times: payload.updateLeadTimes ?? false
    })
  );
}

async function callServiceRpc(name: string, params: Record<string, unknown>) {
  const result = await getCarbonServiceClient().rpc(name, params);
  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? { success: true };
}

async function processEmbedJob(
  client: ReturnType<typeof getCarbonServiceClient>,
  job: EmbedJob
) {
  const row = await client
    .from(job.table)
    .select("id, name, description")
    .eq("id", job.id)
    .eq("companyId", job.companyId)
    .single();

  if (row.error || !row.data) {
    throw new Error(row.error?.message ?? `${job.table} ${job.id} not found`);
  }

  const record = row.data as {
    name?: string | null;
    description?: string | null;
  };
  const text = [record.name, job.table === "item" ? record.description : null]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");

  const embedding = await generateEmbedding(text);
  const update = await client
    .from(job.table)
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", job.id)
    .eq("companyId", job.companyId);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

async function generateEmbedding(text: string) {
  const sanitized = sanitizeText(text);
  if (!sanitized) {
    throw new Error("Cannot generate embedding for empty text");
  }

  const result = await embed({
    model: openai.embedding(embeddingModel),
    value: sanitized
  });

  return result.embedding;
}

function sanitizeText(text: string) {
  return text
    .replace(/\0/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validateFunctionAuth(request: Request) {
  const token = process.env.CARBON_FUNCTIONS_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { message: "CARBON_FUNCTIONS_TOKEN is required in production" },
        { status: 500 }
      );
    }
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${token}`) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  return null;
}
