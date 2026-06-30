-- Make shippedQuantity in shipmentLine non-nullable with default 0
UPDATE "shipmentLine" SET "shippedQuantity" = 0 WHERE "shippedQuantity" IS NULL;
ALTER TABLE "shipmentLine" ALTER COLUMN "shippedQuantity" SET DEFAULT 0;
ALTER TABLE "shipmentLine" ALTER COLUMN "shippedQuantity" SET NOT NULL;
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_shippedQuantity_not_nan" CHECK ("shippedQuantity" = "shippedQuantity");

-- Make receivedQuantity in receiptLine non-nullable with default 0
UPDATE "receiptLine" SET "receivedQuantity" = 0 WHERE "receivedQuantity" IS NULL;
ALTER TABLE "receiptLine" ALTER COLUMN "receivedQuantity" SET DEFAULT 0;
ALTER TABLE "receiptLine" ALTER COLUMN "receivedQuantity" SET NOT NULL;
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_receivedQuantity_not_nan" CHECK ("receivedQuantity" = "receivedQuantity");
