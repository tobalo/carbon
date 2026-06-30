import { config } from "dotenv";
import { writeFileSync } from "fs";

config();

const apiUrl = "https://rest.carbon.ms";
const apiKey = "crbn_*****************";

async function carbonFetch(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "carbon-key": apiKey,
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${await response.text()}`
    );
  }

  return response;
}

(async () => {
  const companyResponse = await carbonFetch("/company?select=id&limit=1");
  const companies = (await companyResponse.json()) as Array<{ id: string }>;
  const companyId = companies[0]?.id;
  if (!companyId) {
    console.error("Company not found");
    return;
  }

  const inventoryValue = await carbonFetch(
    "/rpc/get_inventory_value_by_location",
    {
      body: JSON.stringify({ company_id: companyId }),
      headers: {
        Accept: "text/csv",
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );

  const date = new Date().toISOString().split("T")[0];
  const filename = `inventory-value-${date}.csv`;
  writeFileSync(filename, await inventoryValue.text());
  console.log(`Saved to ${filename}`);
})();
