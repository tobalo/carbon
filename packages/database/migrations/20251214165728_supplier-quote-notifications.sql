ALTER TABLE "companySettings"
  ADD COLUMN IF NOT EXISTS "supplierQuoteNotificationGroup" text[] NOT NULL DEFAULT '{}';

