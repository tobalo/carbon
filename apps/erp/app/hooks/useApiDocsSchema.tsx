import { useMount } from "@carbon/react";
import { useFetcher } from "react-router";
import { path } from "~/utils/path";

type ApiDocsSchema = {
  paths: Record<string, Record<string, unknown>>;
  definitions: Record<string, unknown>;
};

export const useApiDocsSchema = () => {
  const docsFetcher = useFetcher<ApiDocsSchema>();

  useMount(() => {
    docsFetcher.load(path.to.api.docs);
  });

  return docsFetcher.data;
};
