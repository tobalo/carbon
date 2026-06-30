ALTER TABLE "quote" ADD COLUMN "externalId" JSONB;
CREATE INDEX idx_quote_external_id ON "quote" USING GIN ("externalId");