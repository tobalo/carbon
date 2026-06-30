ALTER POLICY "Users can view other users from their same company" ON "user" USING (
  "id" IN (
    SELECT "userId" 
    FROM "userToCompany" 
    WHERE "companyId" = ANY (
      (
        SELECT get_companies_with_employee_role()
      )::text[]
    )
  )
);

ALTER POLICY "Authenticated users can view userToCompany" ON "userToCompany"
  USING (
    "companyId" = ANY (
      (
        SELECT get_companies_with_employee_role()
      )::text[]
    )
  );