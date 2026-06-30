import type { CarbonClient } from "../../types";

type FunctionInvokeOptions = Parameters<CarbonClient["functions"]["invoke"]>[1];
type FunctionInvokeRegion = NonNullable<FunctionInvokeOptions>["region"];

export const CARBON_FUNCTION_REGION_US_EAST_1 =
  "us-east-1" as FunctionInvokeRegion;
