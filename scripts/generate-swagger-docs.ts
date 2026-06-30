import { writeFileSync } from "node:fs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const apiUrl =
  process.env.CARBON_API_URL ??
  (process.env.PORT_API ? `http://localhost:${process.env.PORT_API}` : null);

if (!apiUrl) {
  console.error(
    "CARBON_API_URL or PORT_API not set (expected in .env.local). Run `pnpm dev` first."
  );
  process.exit(1);
}

const publicKey = process.env.CARBON_PUBLIC_KEY;
const url = `${apiUrl.replace(/\/$/, "")}/rest/v1/`;

(async () => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/openapi+json",
      ...(publicKey
        ? { apikey: publicKey, Authorization: `Bearer ${publicKey}` }
        : {})
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  writeFileSync(
    "packages/database/src/swagger-docs-schema.ts",
    `export default ${JSON.stringify(data, null, 2)}`
  );
})();
