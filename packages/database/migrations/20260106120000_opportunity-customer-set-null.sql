-- Make the customerId column nullable
ALTER TABLE "opportunity" ALTER COLUMN "customerId" DROP NOT NULL;

-- Drop the existing foreign key constraint (currently ON DELETE CASCADE)
ALTER TABLE "opportunity" DROP CONSTRAINT IF EXISTS "opportunity_customerId_fkey";

-- Add the foreign key constraint with ON DELETE SET NULL
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
