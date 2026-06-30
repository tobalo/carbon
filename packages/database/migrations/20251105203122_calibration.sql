ALTER TABLE "gaugeCalibrationRecord" ADD COLUMN "measurementStandard" TEXT;
ALTER TABLE "gaugeCalibrationRecord" ADD COLUMN "calibrationAttempts" JSONB;


ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "checkCalibrationAttemptsSchema" CHECK (
  jsonb_matches_schema(
    '{
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "reference": { "type": "number" },
          "actual": { "type": "number" }
        },
        "required": ["reference", "actual"],
        "additionalProperties": false
      }
    }',
    "calibrationAttempts"
  )
);