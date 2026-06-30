-- Fix shipment RLS policies to use inventory permissions instead of sales permissions
DROP POLICY "UPDATE" ON "shipment";
DROP POLICY "DELETE" ON "shipment";

CREATE POLICY "UPDATE" ON "shipment"
FOR UPDATE USING (
 "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_permission ('inventory_update')
      )::text[]
    )
);

CREATE POLICY "DELETE" ON "shipment"
FOR DELETE USING (
  "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_permission ('inventory_delete')
      )::text[]
    )
);
