CREATE OR REPLACE FUNCTION app_company_groups_for_context() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT c."companyGroupId"), ARRAY[]::text[])
  FROM "company" c
  WHERE c."id" = ANY(app_companies_for_context())
    AND c."companyGroupId" IS NOT NULL
$$;--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companyGroup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "currency" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dimension" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dimensionValue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exchangeRateHistory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "account_tenant_select" ON "account" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("account"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "account_tenant_insert" ON "account" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("account"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "account_tenant_update" ON "account" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("account"."companyGroupId" = ANY(app_company_groups_for_context())) WITH CHECK ("account"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "account_tenant_delete" ON "account" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("account"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "companyGroup_tenant_select" ON "companyGroup" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("companyGroup"."id" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "companyGroup_tenant_insert" ON "companyGroup" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("companyGroup"."id" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "companyGroup_tenant_update" ON "companyGroup" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("companyGroup"."id" = ANY(app_company_groups_for_context())) WITH CHECK ("companyGroup"."id" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "companyGroup_tenant_delete" ON "companyGroup" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("companyGroup"."id" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "currency_tenant_select" ON "currency" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("currency"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "currency_tenant_insert" ON "currency" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("currency"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "currency_tenant_update" ON "currency" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("currency"."companyGroupId" = ANY(app_company_groups_for_context())) WITH CHECK ("currency"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "currency_tenant_delete" ON "currency" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("currency"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimension_tenant_select" ON "dimension" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("dimension"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimension_tenant_insert" ON "dimension" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("dimension"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimension_tenant_update" ON "dimension" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("dimension"."companyGroupId" = ANY(app_company_groups_for_context())) WITH CHECK ("dimension"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimension_tenant_delete" ON "dimension" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("dimension"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimensionValue_tenant_select" ON "dimensionValue" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("dimensionValue"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimensionValue_tenant_insert" ON "dimensionValue" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("dimensionValue"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimensionValue_tenant_update" ON "dimensionValue" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("dimensionValue"."companyGroupId" = ANY(app_company_groups_for_context())) WITH CHECK ("dimensionValue"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "dimensionValue_tenant_delete" ON "dimensionValue" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("dimensionValue"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "exchangeRateHistory_tenant_select" ON "exchangeRateHistory" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("exchangeRateHistory"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "exchangeRateHistory_tenant_insert" ON "exchangeRateHistory" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("exchangeRateHistory"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "exchangeRateHistory_tenant_update" ON "exchangeRateHistory" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("exchangeRateHistory"."companyGroupId" = ANY(app_company_groups_for_context())) WITH CHECK ("exchangeRateHistory"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "exchangeRateHistory_tenant_delete" ON "exchangeRateHistory" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("exchangeRateHistory"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "intercompanyTransaction_tenant_select" ON "intercompanyTransaction" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("intercompanyTransaction"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "intercompanyTransaction_tenant_insert" ON "intercompanyTransaction" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("intercompanyTransaction"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "intercompanyTransaction_tenant_update" ON "intercompanyTransaction" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("intercompanyTransaction"."companyGroupId" = ANY(app_company_groups_for_context())) WITH CHECK ("intercompanyTransaction"."companyGroupId" = ANY(app_company_groups_for_context()));--> statement-breakpoint
CREATE POLICY "intercompanyTransaction_tenant_delete" ON "intercompanyTransaction" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("intercompanyTransaction"."companyGroupId" = ANY(app_company_groups_for_context()));
