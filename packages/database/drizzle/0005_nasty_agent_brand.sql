ALTER TABLE "attributeDataType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "challengeAttempt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "country" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "currencyCode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customFieldTable" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lessonCompletion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "period" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "searchIndex_CYj9v111oXXm6PX9ZD6Yn2" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "userPermission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhookTable" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attributeDataType_public_select" ON "attributeDataType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "challengeAttempt_tenant_select" ON "challengeAttempt" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "challengeAttempt"."userId"));--> statement-breakpoint
CREATE POLICY "challengeAttempt_tenant_insert" ON "challengeAttempt" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "challengeAttempt"."userId"));--> statement-breakpoint
CREATE POLICY "challengeAttempt_tenant_update" ON "challengeAttempt" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "challengeAttempt"."userId")) WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "challengeAttempt"."userId"));--> statement-breakpoint
CREATE POLICY "challengeAttempt_tenant_delete" ON "challengeAttempt" AS PERMISSIVE FOR DELETE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "challengeAttempt"."userId"));--> statement-breakpoint
CREATE POLICY "config_public_select" ON "config" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "country_public_select" ON "country" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "currencyCode_public_select" ON "currencyCode" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "customFieldTable_public_select" ON "customFieldTable" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "feedback_tenant_select" ON "feedback" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "feedback"."userId"));--> statement-breakpoint
CREATE POLICY "feedback_tenant_insert" ON "feedback" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "feedback"."userId"));--> statement-breakpoint
CREATE POLICY "feedback_tenant_update" ON "feedback" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "feedback"."userId")) WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "feedback"."userId"));--> statement-breakpoint
CREATE POLICY "feedback_tenant_delete" ON "feedback" AS PERMISSIVE FOR DELETE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "feedback"."userId"));--> statement-breakpoint
CREATE POLICY "integration_public_select" ON "integration" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "lessonCompletion_tenant_select" ON "lessonCompletion" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "lessonCompletion"."userId"));--> statement-breakpoint
CREATE POLICY "lessonCompletion_tenant_insert" ON "lessonCompletion" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "lessonCompletion"."userId"));--> statement-breakpoint
CREATE POLICY "lessonCompletion_tenant_update" ON "lessonCompletion" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "lessonCompletion"."userId")) WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "lessonCompletion"."userId"));--> statement-breakpoint
CREATE POLICY "lessonCompletion_tenant_delete" ON "lessonCompletion" AS PERMISSIVE FOR DELETE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "lessonCompletion"."userId"));--> statement-breakpoint
CREATE POLICY "period_public_select" ON "period" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "plan_public_select" ON "plan" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);--> statement-breakpoint
CREATE POLICY "userPermission_tenant_select" ON "userPermission" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "userPermission"."id"));--> statement-breakpoint
CREATE POLICY "userPermission_tenant_insert" ON "userPermission" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "userPermission"."id"));--> statement-breakpoint
CREATE POLICY "userPermission_tenant_update" ON "userPermission" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "userPermission"."id")) WITH CHECK (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "userPermission"."id"));--> statement-breakpoint
CREATE POLICY "userPermission_tenant_delete" ON "userPermission" AS PERMISSIVE FOR DELETE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "userPermission"."id"));--> statement-breakpoint
CREATE POLICY "user_tenant_select" ON "user" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (EXISTS (SELECT 1 FROM "userToCompany" WHERE "userToCompany"."userId" = "user"."id" AND "userToCompany"."companyId" = ANY(app_companies_for_context())));--> statement-breakpoint
CREATE POLICY "user_tenant_insert" ON "user" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK (EXISTS (SELECT 1 FROM "userToCompany" WHERE "userToCompany"."userId" = "user"."id" AND "userToCompany"."companyId" = ANY(app_companies_for_context())));--> statement-breakpoint
CREATE POLICY "user_tenant_update" ON "user" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "userToCompany" WHERE "userToCompany"."userId" = "user"."id" AND "userToCompany"."companyId" = ANY(app_companies_for_context()))) WITH CHECK (EXISTS (SELECT 1 FROM "userToCompany" WHERE "userToCompany"."userId" = "user"."id" AND "userToCompany"."companyId" = ANY(app_companies_for_context())));--> statement-breakpoint
CREATE POLICY "user_tenant_delete" ON "user" AS PERMISSIVE FOR DELETE TO "carbon_app" USING (EXISTS (SELECT 1 FROM "userToCompany" WHERE "userToCompany"."userId" = "user"."id" AND "userToCompany"."companyId" = ANY(app_companies_for_context())));--> statement-breakpoint
CREATE POLICY "webhookTable_public_select" ON "webhookTable" AS PERMISSIVE FOR SELECT TO "carbon_app" USING (true);