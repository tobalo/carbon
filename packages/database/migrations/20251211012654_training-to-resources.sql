ALTER POLICY "INSERT" ON "public"."training" WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_create')
    )::text[]
  )
);

ALTER POLICY "UPDATE" ON "public"."training" USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_update')
    )::text[]
  )
);

ALTER POLICY "DELETE" ON "public"."training" USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_delete')
    )::text[]
  )
);

ALTER POLICY "SELECT" ON "public"."trainingCompletion" USING (
  "companyId" = ANY (
    ( 
      SELECT
        get_companies_with_employee_permission ('resources_view')
    )::text[]
  )
);

ALTER POLICY "INSERT" ON "public"."trainingCompletion" WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_create')
    )::text[]
  ) OR (
    auth.uid()::text = "employeeId"
    AND "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_role ()
      )::text[]
    )
  )
);

ALTER POLICY "UPDATE" ON "public"."trainingCompletion" USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_update')
    )::text[]
  )
);

ALTER POLICY "DELETE" ON "public"."trainingCompletion" USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_delete')
    )::text[]
  )
);

