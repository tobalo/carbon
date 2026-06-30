ALTER TYPE "documentSourceType" ADD VALUE 'Issue';
ALTER TYPE "documentSourceType" ADD VALUE 'Gauge Calibration Record';

ALTER TABLE "gaugeCalibrationRecord" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP VIEW IF EXISTS "gaugeCalibrationRecords";
CREATE OR REPLACE VIEW "gaugeCalibrationRecords" WITH(SECURITY_INVOKER=true) AS
SELECT
  gcr.*,
  g."gaugeId" as "gaugeReadableId",
  g."gaugeTypeId",
  g."description"
FROM "gaugeCalibrationRecord" gcr
JOIN "gauge" g ON gcr."gaugeId" = g."id";

