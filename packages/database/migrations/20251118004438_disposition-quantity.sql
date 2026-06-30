ALTER TABLE "nonConformanceItem" ADD COLUMN "quantity" NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE "nonConformanceItem" DROP CONSTRAINT "nonConformanceItem_unique";