"use client";

import { useCarbon } from "@carbon/auth";
import { fetchAllFromTable } from "@carbon/database";
import { useInterval } from "@carbon/react";
import { useEffect } from "react";
import { useUser } from "~/hooks";
import { useCustomers, useItems, usePeople, useSuppliers } from "~/stores";
import type { Item } from "~/stores/items";
import type { ListItem } from "~/types";

let hydratedFromIdb = false;
let hydratedFromServer = false;

const PollingDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { carbon, accessToken } = useCarbon();
  const {
    company: { id: companyId }
  } = useUser();

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    hydratedFromServer = false;
  }, [companyId]);

  // Reset on logout so the next login triggers a fresh server hydrate.
  useEffect(() => {
    if (!accessToken) hydratedFromServer = false;
  }, [accessToken]);

  const [, setItems] = useItems();
  const [, setSuppliers] = useSuppliers();
  const [, setCustomers] = useCustomers();
  const [, setPeople] = usePeople();

  const fetchQuantities = async () => {
    if (!carbon || !companyId) return;

    const { data, error } = await fetchAllFromTable<{
      itemId: string;
      locationId: string;
      quantityOnHand: number;
    }>(
      carbon,
      // @ts-ignore -- itemStockQuantities is a materialized view
      "itemStockQuantities",
      "itemId, locationId, quantityOnHand",
      (query) => query.eq("companyId", companyId)
    );

    if (error || !data) return;

    const totalMap = new Map<string, number>();
    const locationMap = new Map<string, Record<string, number>>();

    for (const row of data) {
      if (!row.itemId) continue;
      const qty = Number(row.quantityOnHand) || 0;
      const locId = row.locationId || "";

      totalMap.set(row.itemId, (totalMap.get(row.itemId) ?? 0) + qty);

      if (!locationMap.has(row.itemId)) locationMap.set(row.itemId, {});
      if (locId) locationMap.get(row.itemId)![locId] = qty;
    }

    setItems((currentItems) =>
      currentItems.map((item) => ({
        ...item,
        quantityOnHand: totalMap.get(item.id) ?? 0,
        quantityByLocation: locationMap.get(item.id) ?? {}
      }))
    );
  };

  const hydrate = async () => {
    const idb = (await import("localforage")).default;
    if (!hydratedFromIdb) {
      hydratedFromIdb = true;

      idb.getItem("customers").then((data) => {
        if (data && !hydratedFromServer) setCustomers(data as ListItem[], true);
      });
      idb.getItem("items").then((data) => {
        if (data && !hydratedFromServer) setItems(data as Item[], true);
      });
      idb.getItem("suppliers").then((data) => {
        if (data && !hydratedFromServer) setSuppliers(data as ListItem[], true);
      });
      idb.getItem("people").then((data) => {
        // @ts-ignore
        if (data && !hydratedFromServer) setPeople(data, true);
      });
    }

    if (!carbon || !accessToken || hydratedFromServer) return;

    const [items, suppliers, customers, people] = await Promise.all([
      fetchAllFromTable<{
        id: string;
        readableIdWithRevision: string;
        unitOfMeasureCode: string;
        name: string;
        type: string;
        replenishmentSystem: string;
        active: boolean;
        itemTrackingType: string;
      }>(
        carbon,
        "item",
        "id, readableIdWithRevision, unitOfMeasureCode, name, type, replenishmentSystem, active, itemTrackingType",
        (query) =>
          query
            .eq("companyId", companyId)
            .order("readableId", { ascending: true })
            .order("revision", { ascending: false })
      ),
      fetchAllFromTable<{
        id: string;
        name: string;
        website: string;
        supplierStatus: string;
      }>(carbon, "supplier", "id, name, website, supplierStatus", (query) =>
        query.eq("companyId", companyId).order("name")
      ),
      fetchAllFromTable<{
        id: string;
        name: string;
        website: string;
      }>(carbon, "customer", "id, name, website", (query) =>
        query.eq("companyId", companyId).order("name")
      ),
      fetchAllFromTable<{
        id: string;
        name: string;
        email: string;
        avatarUrl: string;
      }>(carbon, "employees", "id, name, email, avatarUrl", (query) =>
        query.eq("companyId", companyId).order("name")
      )
    ]);

    if (items.error) {
      throw new Error("Failed to fetch items");
    }
    if (suppliers.error) {
      throw new Error("Failed to fetch suppliers");
    }
    if (customers.error) {
      throw new Error("Failed to fetch customers");
    }
    if (people.error) {
      throw new Error("Failed to fetch people");
    }

    hydratedFromServer = true;

    // @ts-ignore
    setItems(items.data ?? []);
    setSuppliers(suppliers.data ?? []);
    setCustomers(customers.data ?? []);
    // @ts-ignore
    setPeople(people.data ?? []);

    await Promise.all([
      idb.setItem("items", items.data),
      idb.setItem("suppliers", suppliers.data),
      idb.setItem("customers", customers.data),
      idb.setItem("people", people.data)
    ]);

    fetchQuantities();
  };

  // Re-run when auth becomes ready: `hydrate()` bails if `carbon` / `accessToken` are missing,
  // and with only `[companyId]` that first run could be the only attempt — leaving `items` empty
  // (e.g. New Job item combobox shows no options).
  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate closes over setters + idb
  useEffect(() => {
    if (!companyId) return;
    hydrate().catch((err) => console.error("hydrate failed:", err));
  }, [companyId, carbon, accessToken]);

  useInterval(fetchQuantities, companyId ? 10 * 60 * 1000 : null);

  useInterval(() => {
    if (!companyId || !accessToken) return;
    hydratedFromServer = false;
    hydrate().catch((err) => console.error("reference data refresh failed:", err));
  }, companyId && accessToken ? 5 * 60 * 1000 : null);

  return <>{children}</>;
};

export default PollingDataProvider;
