ALTER TABLE "customerLocation" ADD CONSTRAINT "customerLocation_addressId_customerId_name_key" UNIQUE ("addressId", "customerId");

ALTER TABLE "supplierLocation" ADD CONSTRAINT "supplierLocation_addressId_supplierId_name_key" UNIQUE ("addressId", "supplierId");

