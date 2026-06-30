import { generateEmbedding } from "../lib/ai/embedding.ts";

Deno.serve(async (req) => {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Text parameter is required and must be a string" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const embedding = await generateEmbedding(text);

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating embedding:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate embedding"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
})

/* To invoke locally:

  1. Start the local functions API.
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/embedding' \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{"text":"Your text here"}'

*/
