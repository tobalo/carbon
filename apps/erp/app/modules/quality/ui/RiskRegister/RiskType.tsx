import type {
  EnumValue,
  riskRegisterTypeEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";

type RiskTypeProps = {
  type?: EnumValue<typeof riskRegisterTypeEnum> | null;
};

const RiskType = ({ type }: RiskTypeProps) => {
  switch (type) {
    case "Risk":
      return <Status color="red">{type}</Status>;
    case "Opportunity":
      return <Status color="green">{type}</Status>;

    default:
      return null;
  }
};

export default RiskType;
