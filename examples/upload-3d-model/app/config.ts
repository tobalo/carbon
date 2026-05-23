const CARBON_APP_URL = process.env.CARBON_APP_URL!;
const CARBON_COMPANY_ID = process.env.CARBON_COMPANY_ID!;

if (!CARBON_APP_URL) {
  throw new Error("CARBON_APP_URL must be set");
}

if (!CARBON_COMPANY_ID) {
  throw new Error("CARBON_COMPANY_ID must be set");
}

export {
  CARBON_APP_URL,
  CARBON_COMPANY_ID
};
