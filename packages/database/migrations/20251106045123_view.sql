DROP VIEW IF EXISTS "gaugeCalibrationRecords";
CREATE OR REPLACE VIEW "gaugeCalibrationRecords" WITH(SECURITY_INVOKER=true) AS
SELECT
  gcr.*,
  g."gaugeId" as "gaugeReadableId",
  g."gaugeTypeId",
  g."description"
FROM "gaugeCalibrationRecord" gcr
JOIN "gauge" g ON gcr."gaugeId" = g."id";