import { getCarbonServiceClient } from "@carbon/auth/client.server";

export async function loader() {
  try {
    const client = getCarbonServiceClient();
    const test = await client.from("attributeDataType").select("id").limit(1);
    if (test.error !== null) throw test.error;
    return new Response("OK");
  } catch (error: unknown) {
    console.log("health ❌", { error });
    return new Response("ERROR", { status: 500 });
  }
}
