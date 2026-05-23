import type { TableRow } from "@carbon/database/schema";

export function getLineDescription(
  line: TableRow<"salesInvoiceLines">
) {
  switch (line?.invoiceLineType) {
    case "Fixed Asset":
      return line?.assetId;
    case "Comment":
      return line?.description;
    default:
      return line?.itemReadableId;
  }
}

export function getLineDescriptionDetails(
  line: TableRow<"salesInvoiceLines">
) {
  switch (line?.invoiceLineType) {
    case "Fixed Asset":
      return line?.description;
    case "Comment":
    default:
      return line?.description ?? "";
  }
}

export function getLineSubtotal(
  line: TableRow<"salesInvoiceLines">
) {
  if (line?.quantity && line?.convertedUnitPrice) {
    return (
      line.quantity * line.convertedUnitPrice +
      (line.convertedAddOnCost ?? 0) +
      (line.convertedNonTaxableAddOnCost ?? 0) +
      (line.convertedShippingCost ?? 0)
    );
  }
  return 0;
}

export function getLineTaxableSubtotal(
  line: TableRow<"salesInvoiceLines">
) {
  if (line?.quantity && line?.convertedUnitPrice) {
    return (
      line.quantity * line.convertedUnitPrice +
      (line.convertedAddOnCost ?? 0) +
      (line.convertedShippingCost ?? 0)
    );
  }
  return 0;
}

export function getLineTaxesAndFees(
  line: TableRow<"salesInvoiceLines">
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
  line: TableRow<"salesInvoiceLines">
) {
  const taxPercent = line.taxPercent ?? 0;
  const tax = getLineTaxableSubtotal(line) * taxPercent;
  return getLineSubtotal(line) + tax;
}

export function getTotal(
  lines: TableRow<"salesInvoiceLines">[],
  salesInvoice: TableRow<"salesInvoices">,
  salesInvoiceShipment: TableRow<"salesInvoiceShipment">
) {
  let total = 0;

  lines.forEach((line) => {
    total += getLineTotal(line);
  });

  return (
    total +
    (salesInvoiceShipment.shippingCost ?? 0) * (salesInvoice.exchangeRate ?? 1)
  );
}
