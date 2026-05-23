import type {
  EnumValue,
  trackedEntityStatusEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";
import { Trans } from "@lingui/react/macro";

type TrackedEntityStatusProps = {
  status?: EnumValue<typeof trackedEntityStatusEnum> | null;
};

function TrackedEntityStatus({ status }: TrackedEntityStatusProps) {
  switch (status) {
    case "Available":
      return (
        <Status color="green">
          <Trans>Available</Trans>
        </Status>
      );
    case "Reserved":
      return (
        <Status color="gray">
          <Trans>Reserved</Trans>
        </Status>
      );
    case "On Hold":
      return (
        <Status color="orange">
          <Trans>On Hold</Trans>
        </Status>
      );
    case "Rejected":
      return (
        <Status color="red">
          <Trans>Rejected</Trans>
        </Status>
      );
    case "Consumed":
      return (
        <Status color="blue">
          <Trans>Consumed</Trans>
        </Status>
      );
    default:
      return null;
  }
}

export default TrackedEntityStatus;
