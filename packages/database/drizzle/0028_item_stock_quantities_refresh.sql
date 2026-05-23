-- Replace the legacy pg_cron materialized-view refresh with a portable service-callable function.
-- The scheduled job calls this through the service query client, so deployments only need
-- plain Postgres plus the existing Inngest worker.

CREATE OR REPLACE FUNCTION refresh_item_stock_quantities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW "itemStockQuantities";
END;
$$;

REVOKE ALL ON FUNCTION refresh_item_stock_quantities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_item_stock_quantities() TO carbon_service;
