import type {
  EnumValue,
  nonConformanceStatusEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";

type IssueStatusProps = {
  status?: EnumValue<typeof nonConformanceStatusEnum> | null;
};

const IssueStatus = ({ status }: IssueStatusProps) => {
  switch (status) {
    case "Registered":
      return <Status color="gray">{status}</Status>;
    case "In Progress":
      return <Status color="blue">{status}</Status>;
    case "Closed":
      return <Status color="green">{status}</Status>;
    default:
      return null;
  }
};

export default IssueStatus;
