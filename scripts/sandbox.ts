import { config } from "dotenv";

config();

const apiUrl = process.env.CARBON_API_URL;
const apiKey = process.env.CARBON_API_KEY ?? "crbn_yPkz1hszqh6mVLDf4jiDv";
const publicKey = process.env.CARBON_PUBLIC_KEY;

if (!apiUrl) {
  throw new Error("CARBON_API_URL must be set");
}

(async () => {
  const url = new URL("/rest/v1/salesOrder", apiUrl);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1000");

  const response = await fetch(url, {
    headers: {
      "carbon-key": apiKey,
      ...(publicKey
        ? {
            apikey: publicKey,
            Authorization: `Bearer ${publicKey}`,
          }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${await response.text()}`
    );
  }

  console.log(await response.json());
})();
