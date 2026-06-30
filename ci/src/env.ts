import * as dotenv from "dotenv";
dotenv.config();

const CONTROL_DATABASE_URL =
  process.env.CARBON_CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;

if (!CONTROL_DATABASE_URL) {
  throw new Error("Missing CARBON_CONTROL_DATABASE_URL or DATABASE_URL");
}

export { CONTROL_DATABASE_URL };
