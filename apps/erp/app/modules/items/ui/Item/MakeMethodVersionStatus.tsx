import type {
  EnumValue,
  makeMethodStatusEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";
import { Trans } from "@lingui/react/macro";

type MakeMethodVersionStatusProps = {
  status?: EnumValue<typeof makeMethodStatusEnum>;
  isActive?: boolean;
};

const MakeMethodVersionStatus = ({
  status,
  isActive
}: MakeMethodVersionStatusProps) => {
  switch (status) {
    case "Draft":
      return (
        <Status color="gray">
          <Trans>Draft</Trans>
        </Status>
      );
    case "Active":
      return (
        <Status color="green">
          <Trans>Active</Trans>
        </Status>
      );
    case "Archived":
      return (
        <Status color="orange">
          <Trans>Archived</Trans>
        </Status>
      );
    default:
      return null;
  }
};

export default MakeMethodVersionStatus;
