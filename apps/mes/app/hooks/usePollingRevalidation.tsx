import { useInterval } from "@carbon/react";
import { useRevalidator } from "react-router";
import { useUser } from "./useUser";

export function usePollingRevalidation(table: string, filter?: string) {
  const { company } = useUser();
  const revalidator = useRevalidator();
  const pollScope = `${company.id}:${table}:${filter ?? ""}`;

  useInterval(() => {
    if (!pollScope) return;
    revalidator.revalidate();
  }, company.id ? 30_000 : null);
}
