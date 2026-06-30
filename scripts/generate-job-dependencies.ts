import * as dotenv from "dotenv";

dotenv.config();

const COMPANY_ID = "cs868u84gfk07v78v9e0";
const USER_ID = "7b37e09f-79f6-4a7d-b965-d92e676b3e6a";
const OPEN_JOB_STATUSES = ["Ready", "In Progress", "Paused"] as const;

const apiUrl = process.env.CARBON_API_URL;
const serviceRoleKey = process.env.CARBON_SERVICE_ROLE_KEY;

if (!apiUrl) {
  throw new Error("CARBON_API_URL must be set");
}

if (!serviceRoleKey) {
  throw new Error("CARBON_SERVICE_ROLE_KEY must be set");
}

console.log(apiUrl);

const restUrl = new URL("/rest/v1/job", apiUrl);
restUrl.searchParams.set("select", "id,status");
restUrl.searchParams.set("companyId", `eq.${COMPANY_ID}`);
restUrl.searchParams.set(
  "status",
  `in.(${OPEN_JOB_STATUSES.map((status) => `"${status}"`).join(",")})`
);

async function carbonFetch(
  url: URL,
  init: RequestInit & { headers?: Record<string, string> } = {}
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
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
  const jobs = (await (await carbonFetch(restUrl)).json()) as Array<{
    id: string;
    status: (typeof OPEN_JOB_STATUSES)[number];
  }>;

  if (jobs.length === 0) throw new Error("No jobs found");

  for await (const job of jobs) {
    const result = await carbonFetch(
      new URL("/functions/v1/schedule", apiUrl),
      {
        body: JSON.stringify({
          mode: "initial",
          direction: "backward",
          jobId: job.id,
          companyId: COMPANY_ID,
          userId: USER_ID,
        }),
        method: "POST",
      }
    );
    const text = await result.text();
    console.log(text ? JSON.parse(text) : null);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
})();
