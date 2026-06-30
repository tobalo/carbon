ALTER TABLE "gauge" ADD COLUMN "lastCalibrationStatus" "gaugeCalibrationStatus" NOT NULL DEFAULT 'Pending';

UPDATE "gauge" SET "lastCalibrationStatus" = "gaugeCalibrationStatus";

ALTER TABLE "companySettings" ADD COLUMN "gaugeCalibrationExpiredNotificationGroup" TEXT[] NOT NULL DEFAULT '{}';

-- Recreate the gauges view to include the new lastCalibrationStatus column
DROP VIEW IF EXISTS "gauges";
CREATE OR REPLACE VIEW "gauges" WITH(SECURITY_INVOKER=true) AS
SELECT
  g.*,
  CASE
    WHEN g."gaugeStatus" = 'Inactive' THEN 'Out-of-Calibration'
    WHEN g."nextCalibrationDate" IS NOT NULL AND g."nextCalibrationDate" < CURRENT_DATE THEN 'Out-of-Calibration'
    ELSE g."gaugeCalibrationStatus"
  END as "gaugeCalibrationStatusWithDueDate"
FROM "gauge" g;