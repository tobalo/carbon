"use client";

import { useCarbon } from "@carbon/auth";
import { fetchAllFromTable } from "@carbon/database";
import { useInterval } from "@carbon/react";
import idb from "localforage";
import { useEffect } from "react";
import { useUser } from "~/hooks";
import { useItems, usePeople } from "~/stores";
import type { Item } from "~/stores/items";

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

  const [, setItems] = useItems();
  const [, setPeople] = usePeople();

  const hydrate = async () => {
    if (!hydratedFromIdb) {
      hydratedFromIdb = true;

      idb.getItem("items").then((data) => {
        if (data && !hydratedFromServer) setItems(data as Item[], true);
      });
      idb.getItem("people").then((data) => {
        // @ts-ignore
        if (data && !hydratedFromServer) setPeople(data, true);
      });
    }

    if (!carbon || !accessToken || hydratedFromServer) return;

    const [items, people] = await Promise.all([
      fetchAllFromTable(
        carbon,
        "item",
        "id, readableIdWithRevision, name, type, replenishmentSystem, itemTrackingType, active, thumbnailPath, modelUpload:modelUploadId(thumbnailPath)",
        (query) =>
          query
            .eq("companyId", companyId)
            .order("readableId", { ascending: true })
            .order("revision", { ascending: false })
      ),
      fetchAllFromTable(
        carbon,
        "employees",
        "id, name, email, avatarUrl",
        (query) => query.eq("companyId", companyId).order("name")
      )
    ]);

    if (items.error) {
      throw new Error("Failed to fetch items");
    }
    if (people.error) {
      throw new Error("Failed to fetch people");
    }

    hydratedFromServer = true;

    type ItemWithModelUpload = Item & {
      modelUpload?: { thumbnailPath: string | null } | null;
    };
    const itemData = (items.data ?? []) as unknown as ItemWithModelUpload[];
    setItems(
      itemData.map((item) => ({
        id: item.id,
        name: item.name,
        readableIdWithRevision: item.readableIdWithRevision,
        type: item.type,
        replenishmentSystem: item.replenishmentSystem,
        itemTrackingType: item.itemTrackingType,
        active: item.active,
        thumbnailPath:
          item.thumbnailPath ?? item.modelUpload?.thumbnailPath ?? null
      }))
    );
    setPeople(
      // @ts-ignore
      people.data ?? []
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    if (!companyId) return;
    hydrate();
  }, [companyId, accessToken]);

  useInterval(() => {
    if (!companyId || !accessToken) return;
    hydratedFromServer = false;
    hydrate().catch((err) => console.error("reference data refresh failed:", err));
  }, companyId && accessToken ? 5 * 60 * 1000 : null);

  return <>{children}</>;
};

export default PollingDataProvider;
