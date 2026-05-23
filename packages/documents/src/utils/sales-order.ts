import type { TableRow } from "@carbon/database/schema";

export function getLineDescription(
  line: TableRow<"salesOrderLines">
) {
  switch (line?.salesOrderLineType) {
    case "Fixed Asset":
      return line?.assetId;
    case "Comment":
      return line?.description;
    default:
      let customerPartNumber = line.customerPartId
        ? ` (${line.customerPartId}${
            line.customerPartRevision ? ` Rev ${line.customerPartRevision}` : ""
          })`
        : "";

      return line?.itemReadableId + customerPartNumber;
  }
}

export function getLineDescriptionDetails(
  line: TableRow<"salesOrderLines">
) {
  switch (line?.salesOrderLineType) {
    case "Fixed Asset":
      return line?.description;
    case "Comment":
    default:
      const itemDescription = line?.customerPartId
        ? `\n${line.customerPartId}${
            line.customerPartRevision ? ` Rev ${line.customerPartRevision}` : ""
          }`
        : "";
      return (line?.description ?? "") + itemDescription;
  }
}

export function getLineSubtotal(
  line: TableRow<"salesOrderLines">
) {
  if (line?.saleQuantity && line?.convertedUnitPrice) {
    return (
      line.saleQuantity * line.convertedUnitPrice +
      (line.convertedAddOnCost ?? 0) +
      (line.convertedNonTaxableAddOnCost ?? 0) +
      (line.convertedShippingCost ?? 0)
    );
  }
  return 0;
}

export function getLineTaxableSubtotal(
  line: TableRow<"salesOrderLines">
) {
  if (line?.saleQuantity && line?.convertedUnitPrice) {
    return (
      line.saleQuantity * line.convertedUnitPrice +
      (line.convertedAddOnCost ?? 0) +
      (line.convertedShippingCost ?? 0)
    );
  }
  return 0;
}

export function getLineTaxesAndFees(
  line: TableRow<"salesOrderLines">
) {
  const taxPercent = line.taxPercent ?? 0;
  const tax = getLineTaxableSubtotal(line) * taxPercent;
  const fees =
    (line.convertedAddOnCost ?? 0) +
    (line.convertedNonTaxableAddOnCost ?? 0) +
    (line.convertedShippingCost ?? 0);
  return tax + fees;
}

export function getLineTotal(
  line: TableRow<"salesOrderLines">
) {
  const taxPercent = line.taxPercent ?? 0;
  const tax = getLineTaxableSubtotal(line) * taxPercent;
  return getLineSubtotal(line) + tax;
}

export function getTotal(
  lines: TableRow<"salesOrderLines">[],
  salesOrder: TableRow<"salesOrders">
) {
  let total = 0;

  lines.forEach((line) => {
    total += getLineTotal(line);
  });

  return (
    total + (salesOrder.shippingCost ?? 0) * (salesOrder.exchangeRate ?? 1)
  );
}
