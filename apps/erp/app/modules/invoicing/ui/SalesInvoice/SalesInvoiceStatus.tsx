import type {
  EnumValue,
  salesInvoiceStatusEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";

type SalesInvoicingStatusProps = {
  status?: EnumValue<typeof salesInvoiceStatusEnum> | null;
};

const SalesInvoicingStatus = ({ status }: SalesInvoicingStatusProps) => {
  switch (status) {
    case "Draft":
    case "Return":
      return <Status color="gray">{status}</Status>;
    case "Submitted":
      return <Status color="blue">{status}</Status>;
    case "Pending":
    case "Partially Paid":
      return <Status color="yellow">{status}</Status>;
    case "Voided":
      return <Status color="red">{status}</Status>;
    case "Overdue":
      return <Status color="orange">{status}</Status>;
    case "Credit Note Issued":
    case "Paid":
      return <Status color="green">{status}</Status>;
    default:
      return null;
  }
};

export default SalesInvoicingStatus;
