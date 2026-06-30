import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import { sql } from "kysely";
import { z } from "npm:zod@^3.24.1";
import type { DB } from "../lib/database.ts";
import { getConnectionPool, getDatabaseClient } from "../lib/database.ts";
import { corsHeaders } from "../lib/headers.ts";

const pool = getConnectionPool(1);
const db = getDatabaseClient<DB>(pool);

const payloadValidator = z.object({
  webhookId: z.string(),
  type: z.enum(["INSERT", "UPDATE", "DELETE"]),
  record: z.any(),
  old: z.any().optional(),
  url: z.string(),
  companyId: z.string(),
  table: z.string(),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const payload = await req.json();
  const { type, record, old, url, companyId, table, webhookId } =
    payloadValidator.parse(payload);

  try {
    console.log({
      function: "webhook",
      type,
      url,
      companyId,
      table,
    });

    // Send webhook request
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        record,
        ...(old && { old }),
        companyId,
        table,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed with status ${response.status}`);
    }

    await incrementWebhookSuccess(webhookId);

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error(err);
    if (webhookId) {
      await incrementWebhookError(webhookId);
    }
    return new Response(JSON.stringify(err), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function incrementWebhookSuccess(webhookId: string) {
  await db
    .updateTable("webhook")
    .set({
      successCount: sql`"successCount" + 1`,
      lastSuccess: sql`now()`,
    })
    .where("id", "=", webhookId)
    .execute();
}

async function incrementWebhookError(webhookId: string) {
  await db
    .updateTable("webhook")
    .set({
      errorCount: sql`"errorCount" + 1`,
      lastError: sql`now()`,
    })
    .where("id", "=", webhookId)
    .execute();
}
