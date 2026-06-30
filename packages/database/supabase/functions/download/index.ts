import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import { z } from "npm:zod@^3.24.1";

import { corsHeaders } from "../lib/headers.ts";
import { createSignedDownloadUrl } from "../lib/object-storage.ts";
import { requirePermissions } from "../lib/supabase.ts";

const downloadValidator = z.object({
  bucket: z.string(),
  path: z.string(),
  companyId: z.string(),
  userId: z.string(),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const payload = await req.json();

  try {
    const validatedPayload = downloadValidator.parse(payload);
    const { bucket, path, companyId, userId } = validatedPayload;

    console.log({
      function: "download",
      bucket,
      path,
      companyId,
      userId,
    });

    // verify that the request is authorized by an API key or service role
    await requirePermissions(req, companyId, userId, { view: "documents" });

    let signedUrl: string;
    try {
      signedUrl = await createSignedDownloadUrl({ bucket, key: path }, 60);
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "File not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        signedUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify(err), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
