import * as dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const apiUrl =
  process.env.PROD_CARBON_API_URL ?? process.env.CARBON_API_URL;
const serviceRoleKey =
  process.env.PROD_CARBON_SERVICE_ROLE_KEY ??
  process.env.CARBON_SERVICE_ROLE_KEY;

if (!apiUrl) {
  throw new Error("PROD_CARBON_API_URL or CARBON_API_URL must be set");
}

if (!serviceRoleKey) {
  throw new Error(
    "PROD_CARBON_SERVICE_ROLE_KEY or CARBON_SERVICE_ROLE_KEY must be set"
  );
}

console.log(apiUrl);

const usersUrl = new URL("/rest/v1/user", apiUrl);
usersUrl.searchParams.set("select", "id,email");
usersUrl.searchParams.set("email", "ilike.*@carbon.ms");

(async () => {
  const response = await fetch(usersUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${await response.text()}`
    );
  }

  const users = (await response.json()) as Array<{ id: string; email: string }>;

  if (users.length === 0) throw new Error("No users found");

  const userIds = users.map((user) => user.id);
  const commaSeparatedIds = userIds.join(", ");

  console.log("User IDs:", commaSeparatedIds);

  fs.writeFileSync("user-ids.txt", commaSeparatedIds);
  console.log("User IDs saved to user-ids.txt");
})();
