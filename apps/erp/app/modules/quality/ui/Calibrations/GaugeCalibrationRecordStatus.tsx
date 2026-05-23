import type {
  EnumValue,
  inspectionStatusEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";

type GaugeCalibrationRecordStatusProps = {
  status?: EnumValue<typeof inspectionStatusEnum> | null;
};

const GaugeCalibrationRecordStatus = ({
  status
}: GaugeCalibrationRecordStatusProps) => {
  switch (status) {
    case "Pass":
      return <Status color="green">{status}</Status>;
    case "Fail":
      return <Status color="red">{status}</Status>;
    default:
      return null;
  }
};

export { GaugeCalibrationRecordStatus };
