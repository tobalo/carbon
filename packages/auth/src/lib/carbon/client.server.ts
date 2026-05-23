import {
  getServiceDatabaseQueryClient,
  type DatabaseQueryClient
} from "@carbon/database/query-client";

export const getCarbonServiceClient = (): DatabaseQueryClient => {
  return getServiceDatabaseQueryClient();
};
