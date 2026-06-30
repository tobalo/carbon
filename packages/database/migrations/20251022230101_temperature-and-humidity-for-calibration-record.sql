ALTER TABLE "gaugeCalibrationRecord" ADD COLUMN "temperature" REAL;
ALTER TABLE "gaugeCalibrationRecord" ADD COLUMN "humidity" REAL;
ALTER TABLE "gaugeCalibrationRecord" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "user"("id") ON UPDATE CASCADE;


DROP VIEW IF EXISTS "gaugeCalibrationRecords";
CREATE OR REPLACE VIEW "gaugeCalibrationRecords" WITH(SECURITY_INVOKER=true) AS
SELECT
  gcr.*,
  g."gaugeId" as "gaugeReadableId",
  g."gaugeTypeId",
  g."description"
FROM "gaugeCalibrationRecord" gcr
JOIN "gauge" g ON gcr."gaugeId" = g."id";