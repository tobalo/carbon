import type { TableRow } from "@carbon/database/schema";
import { useRouteData } from "@carbon/react";
import { path } from "~/utils/path";

export function useSettings(): TableRow<"companySettings"> {
  const routeData = useRouteData<{
    companySettings: TableRow<"companySettings">;
  }>(path.to.authenticatedRoot);

  if (!routeData?.companySettings) {
    throw new Error("Company settings not found");
  }

  return routeData.companySettings;
}
