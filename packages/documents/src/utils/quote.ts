import type { TableRow } from "@carbon/database/schema";

export function getLineDescription(
  line: TableRow<"quoteLines">
) {
  const customerPartNumber = line.customerPartId
    ? ` (${line.customerPartId} ${
        line.customerPartRevision ? `Rev ${line.customerPartRevision}` : ""
      })`
    : "";
  return line?.itemReadableId + customerPartNumber;
}

export function getLineDescriptionDetails(
  line: TableRow<"quoteLines">
) {
  return line?.description ? `${line.description}` : "";
}
