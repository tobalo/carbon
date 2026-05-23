import * as dotenv from "dotenv";

dotenv.config();

const CARBON_CONTROL_DATABASE_URL =
  process.env.CARBON_CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;

if (!CARBON_CONTROL_DATABASE_URL) {
  throw new Error("Missing CARBON_CONTROL_DATABASE_URL");
}

export { CARBON_CONTROL_DATABASE_URL };
