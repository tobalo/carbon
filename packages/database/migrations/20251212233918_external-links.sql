DROP POLICY "Authenticated users can view external links" ON "externalLink";
DROP POLICY "Employees with purchasing_create can insert purchasing-related external links" ON "externalLink";
DROP POLICY "Employees with purchasing_update can update purchasing-related external links" ON "externalLink";
DROP POLICY "Employees with purchasing_delete can delete purchasing-related external links" ON "externalLink";

CREATE POLICY "SELECT" ON "externalLink"
  FOR SELECT
  USING (
    "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_role()
      )::text[]
    )
  );

CREATE POLICY "INSERT" ON "externalLink"
  FOR INSERT
  WITH CHECK (
    "companyId" = ANY (
      SELECT DISTINCT unnest(ARRAY(
        SELECT unnest(get_companies_with_employee_permission('sales_create'))
        UNION
        SELECT unnest(get_companies_with_employee_permission('purchasing_create'))
        UNION
        SELECT unnest(get_companies_with_employee_permission('quality_create'))
      ))
    )
  );

CREATE POLICY "UPDATE" ON "externalLink"
  FOR UPDATE USING (
    "companyId" = ANY (
      (
        SELECT DISTINCT unnest(ARRAY(
          SELECT unnest(get_companies_with_employee_permission('sales_update'))
          UNION
          SELECT unnest(get_companies_with_employee_permission('purchasing_update'))
          UNION
          SELECT unnest(get_companies_with_employee_permission('quality_update'))
        ))
      )
    )
  );

CREATE POLICY "DELETE" ON "externalLink"
  FOR DELETE USING (
    "companyId" = ANY (
      (
        SELECT DISTINCT unnest(ARRAY(
          SELECT unnest(get_companies_with_employee_permission('sales_delete'))
          UNION
          SELECT unnest(get_companies_with_employee_permission('purchasing_delete'))
          UNION
          SELECT unnest(get_companies_with_employee_permission('quality_delete'))
        ))
      )
    )
  );