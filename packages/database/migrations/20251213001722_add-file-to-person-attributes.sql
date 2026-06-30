-- Add isFile column to attributeDataType
ALTER TABLE "attributeDataType" ADD COLUMN "isFile" boolean NOT NULL DEFAULT false;

-- Add valueFile column to userAttributeValue
ALTER TABLE "userAttributeValue" ADD COLUMN "valueFile" text;

-- Drop and recreate the constraint on attributeDataType to include isFile
ALTER TABLE "attributeDataType" DROP CONSTRAINT "userAttributeDataType_singleDataType";

ALTER TABLE "attributeDataType" ADD CONSTRAINT "userAttributeDataType_singleDataType"
  CHECK (
    (
      "isBoolean" = true AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = true AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = true AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = true AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = true AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = true AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = true AND
      "isSupplier" = false AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = true AND
      "isFile" = false
    )
    OR (
      "isBoolean" = false AND
      "isDate" = false AND
      "isList" = false AND
      "isNumeric" = false AND
      "isText" = false AND
      "isUser" = false AND
      "isCustomer" = false AND
      "isSupplier" = false AND
      "isFile" = true
    )
  );

-- Insert the File data type record
INSERT INTO "attributeDataType" ("label", "isBoolean", "isDate", "isList", "isNumeric", "isText", "isUser", "isCustomer", "isSupplier", "isFile")
VALUES ('File', false, false, false, false, false, false, false, false, true);

-- Drop and recreate the constraint on userAttributeValue to include valueFile
ALTER TABLE "userAttributeValue" DROP CONSTRAINT "userAttributeValue_singleValue";

ALTER TABLE "userAttributeValue" ADD CONSTRAINT "userAttributeValue_singleValue"
  CHECK (
    (
      "valueBoolean" IS NOT NULL AND
      "valueDate" IS NULL AND
      "valueNumeric" IS NULL AND
      "valueText" IS NULL AND
      "valueUser" IS NULL AND
      "valueFile" IS NULL
    )
    OR (
      "valueBoolean" IS NULL AND
      "valueDate" IS NULL AND
      "valueNumeric" IS NULL AND
      "valueText" IS NOT NULL AND
      "valueUser" IS NULL AND
      "valueFile" IS NULL
    )
    OR (
      "valueBoolean" IS NULL AND
      "valueDate" IS NOT NULL AND
      "valueNumeric" IS NULL AND
      "valueText" IS NULL AND
      "valueUser" IS NULL AND
      "valueFile" IS NULL
    )
    OR (
      "valueBoolean" IS NULL AND
      "valueDate" IS NULL AND
      "valueNumeric" IS NOT NULL AND
      "valueText" IS NULL AND
      "valueUser" IS NULL AND
      "valueFile" IS NULL
    )
    OR (
      "valueBoolean" IS NULL AND
      "valueDate" IS NULL AND
      "valueNumeric" IS NULL AND
      "valueText" IS NULL AND
      "valueUser" IS NOT NULL AND
      "valueFile" IS NULL
    )
    OR (
      "valueBoolean" IS NULL AND
      "valueDate" IS NULL AND
      "valueNumeric" IS NULL AND
      "valueText" IS NULL AND
      "valueUser" IS NULL AND
      "valueFile" IS NOT NULL
    )
  );
