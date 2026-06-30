import * as dotenv from "dotenv";

dotenv.config();

(async () => {
  const apiUrl = process.env.GOVCLOUD_CARBON_API_URL;
  const serviceRoleKey = process.env.GOVCLOUD_CARBON_SERVICE_ROLE_KEY;

  if (!apiUrl) {
    throw new Error("GOVCLOUD_CARBON_API_URL must be set");
  }

  if (!serviceRoleKey) {
    throw new Error("GOVCLOUD_CARBON_SERVICE_ROLE_KEY must be set");
  }

  const url = new URL("/functions/v1/seed-company", apiUrl);

  try {
    const response = await fetch(url, {
      body: "{}",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    const error = response.ok ? null : data;

    console.log({ data, error });
  } catch (err) {
    console.error("Error:", err);
  }
})();
