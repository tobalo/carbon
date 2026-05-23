import type { DatabaseQueryClient } from "@carbon/database/query-client";
import { createContext, useContext } from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";

export type CarbonClientLike = DatabaseQueryClient;

export interface ICarbonStore {
  carbon: CarbonClientLike;
  accessToken: string;
  setAuthToken: (accessToken: string) => Promise<void>;
}

export const CarbonContext = createContext<StoreApi<ICarbonStore> | null>(null);

let __hmrStore: StoreApi<ICarbonStore> | null = null;

export const setCarbonHmrStore = (store: StoreApi<ICarbonStore>) => {
  __hmrStore = store;
};

export const useCarbon = () => {
  let store = useContext(CarbonContext);

  if (!store && __hmrStore) {
    store = __hmrStore;
  }

  if (!store) {
    throw new Error("useCarbon must be used within a CarbonProvider");
  }

  return useStore(store);
};
