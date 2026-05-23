import type {
  EnumValue,
  gaugeCalibrationStatusEnum,
  gaugeRoleEnum,
  gaugeStatusEnum
} from "@carbon/database/schema";
import { Status } from "@carbon/react";

type GaugeStatusProps = {
  status?: EnumValue<typeof gaugeStatusEnum> | null;
};

const GaugeStatus = ({ status }: GaugeStatusProps) => {
  switch (status) {
    case "Active":
      return <Status color="gray">{status}</Status>;
    case "Inactive":
      return <Status color="red">{status}</Status>;
    default:
      return null;
  }
};

type GaugeCalibrationStatusProps = {
  status?: EnumValue<typeof gaugeCalibrationStatusEnum> | null;
};

const GaugeCalibrationStatus = ({ status }: GaugeCalibrationStatusProps) => {
  switch (status) {
    case "Pending":
      return <Status color="orange">{status}</Status>;
    case "In-Calibration":
      return <Status color="green">{status}</Status>;
    case "Out-of-Calibration":
      return <Status color="red">{status}</Status>;
    default:
      return null;
  }
};

type GaugeRoleProps = {
  role?: EnumValue<typeof gaugeRoleEnum> | null;
};

const GaugeRole = ({ role }: GaugeRoleProps) => {
  switch (role) {
    case "Master":
      return <Status color="blue">{role}</Status>;
    case "Standard":
      return <Status color="gray">{role}</Status>;
    default:
      return null;
  }
};

export { GaugeCalibrationStatus, GaugeRole, GaugeStatus };
