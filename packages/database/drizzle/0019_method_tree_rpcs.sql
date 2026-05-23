-- Source view definitions required by SQL-language RPCs.

-- Generated from the last matching legacy migration definition for each view.

CREATE OR REPLACE VIEW "groupMembers" AS
  SELECT
    gm.id,
    g.name,
    g."companyId",
    g."isIdentityGroup",
    g."isEmployeeTypeGroup",
    g."isCustomerOrgGroup",
    g."isCustomerTypeGroup",
    g."isSupplierOrgGroup",
    g."isSupplierTypeGroup",
    gm."groupId",
    gm."memberGroupId",
    gm."memberUserId",
    to_jsonb(u) as user
  FROM
    "membership" gm
    INNER JOIN "group" g ON g.id = gm."groupId"
    LEFT OUTER JOIN (
      SELECT * FROM "user" WHERE active = TRUE
    ) u ON u.id = gm."memberUserId";
--> statement-breakpoint

CREATE OR REPLACE RECURSIVE VIEW groups_recursive
(
  "groupId",
  "name",
  "companyId",
  "parentId",
  "isIdentityGroup",
  "isEmployeeTypeGroup",
  "isCustomerOrgGroup",
  "isCustomerTypeGroup",
  "isSupplierOrgGroup",
  "isSupplierTypeGroup",
  "user"
) AS
  SELECT
    "groupId",
    "name",
    "companyId",
    NULL AS "parentId",
    "isIdentityGroup",
    "isEmployeeTypeGroup",
    "isCustomerOrgGroup",
    "isCustomerTypeGroup",
    "isSupplierOrgGroup",
    "isSupplierTypeGroup",
    "user"
  FROM "groupMembers"
  UNION ALL
  SELECT
    g2."groupId",
    g2.name,
    g2."companyId",
    g1."groupId" AS "parentId",
    g1."isIdentityGroup",
    g2."isEmployeeTypeGroup",
    g2."isCustomerOrgGroup",
    g2."isCustomerTypeGroup",
    g2."isSupplierOrgGroup",
    g2."isSupplierTypeGroup",
    g2."user"
  FROM "groupMembers" g1
  INNER JOIN "groupMembers" g2 ON g1."memberGroupId" = g2."groupId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "groups" AS
  SELECT
    "groupId" as "id",
    "isEmployeeTypeGroup",
    "isCustomerOrgGroup",
    "isCustomerTypeGroup",
    "isSupplierOrgGroup",
    "isSupplierTypeGroup",
    "name",
    "companyId",
    "parentId",
    coalesce(jsonb_agg("user") filter (where "user" is not null), '[]') as users
  FROM groups_recursive
  WHERE "isIdentityGroup" = false
  GROUP BY
    "groupId",
    "name",
    "companyId",
    "parentId",
    "isEmployeeTypeGroup",
    "isCustomerOrgGroup",
    "isCustomerTypeGroup",
    "isSupplierOrgGroup",
    "isSupplierTypeGroup"
  ORDER BY "isEmployeeTypeGroup" DESC, "isCustomerTypeGroup" DESC, "isSupplierTypeGroup" DESC, "name" ASC;
--> statement-breakpoint

CREATE OR REPLACE VIEW "shifts" WITH(SECURITY_INVOKER=true) AS
    SELECT
      s.*, l."name" as "locationName"
    FROM "shift" s
    LEFT JOIN "location" l ON s."locationId" = l."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "holidayYears" AS SELECT DISTINCT "year", "companyId" FROM "holiday";
--> statement-breakpoint

CREATE OR REPLACE VIEW "partners" AS
  SELECT
    p.*,
    p.id AS "supplierLocationId",
    a2.name AS "abilityName",
    s.id AS "supplierId",
    s.name AS "supplierName",
    a.city,
    a."stateProvince" AS state
  FROM "partner" p
    INNER JOIN "supplierLocation" sl
      ON sl.id = p.id
    INNER JOIN "supplier" s
      ON s.id = sl."supplierId"
    INNER JOIN "address" a
      ON a.id = sl."addressId"
    INNER JOIN "ability" a2
      ON a2.id = p."abilityId"
  WHERE p."active" = true;
--> statement-breakpoint

CREATE OR REPLACE VIEW "documentLabels" AS
  SELECT DISTINCT
    "label",
    "userId"
  FROM "documentLabel";
--> statement-breakpoint

CREATE OR REPLACE VIEW "documentExtensions" WITH(SECURITY_INVOKER=true) AS
  SELECT DISTINCT
    extension
  FROM "document";
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchaseOrderSuppliers" AS
  SELECT DISTINCT
    s."id",
    s."name",
    s."companyId"
  FROM "supplier" s
  INNER JOIN "purchaseOrder" p ON p."supplierId" = s."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "userDefaults" AS
  SELECT
    u.id as "userId",
    l."companyId" as "companyId",
    ej."locationId"
  FROM "user" u
  LEFT JOIN "employeeJob" ej ON ej.id = u.id
  LEFT JOIN "location" l ON l.id = ej."locationId" AND l."companyId" = ej."companyId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "employeeSummary" WITH(SECURITY_INVOKER=true) AS
  SELECT
    u.id,
    u."fullName" AS "name",
    u."avatarUrl",
    e."companyId",
    ej.title,
    ej."startDate",
    d.name AS "departmentName",
    l.name AS "locationName",
    m."fullName" AS "managerName"
  FROM "employee" e
  INNER JOIN "user" u
    ON u.id = e.id
  LEFT JOIN "employeeJob" ej
    ON e.id = ej.id AND e."companyId" = ej."companyId"
  LEFT OUTER JOIN "location" l
    ON l.id = ej."locationId"
  LEFT OUTER JOIN "user" m
    ON m.id = ej."managerId"
  LEFT OUTER JOIN "department" d
    ON d.id = ej."departmentId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "documents" WITH(SECURITY_INVOKER=true) AS
  SELECT
    d.*,
    ARRAY(SELECT dl.label FROM "documentLabel" dl WHERE dl."documentId" = d.id AND dl."userId" = app_uid()) AS labels,
    EXISTS(SELECT 1 FROM "documentFavorite" df WHERE df."documentId" = d.id AND df."userId" = app_uid()) AS favorite,
    (SELECT MAX("createdAt") FROM "documentTransaction" dt WHERE dt."documentId" = d.id) AS "lastActivityAt"
  FROM "document" d
  LEFT JOIN "user" u ON u.id = d."createdBy"
  LEFT JOIN "user" u2 ON u2.id = d."updatedBy";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesOrderCustomers" AS
  SELECT DISTINCT
    c."id",
    c."name",
    c."companyId"
  FROM "customer" c
  INNER JOIN "salesOrder" s ON s."customerId" = c."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "integrations" WITH(SECURITY_INVOKER=true) AS
  SELECT
    i.*,
    c.id AS "companyId",
    coalesce(ci.metadata, '{}') AS "metadata",
    coalesce(ci."active", FALSE) AS "active"
  FROM "integration" i
  CROSS JOIN "company" c
  LEFT JOIN (
    SELECT * FROM "companyIntegration"
  ) ci
    ON i.id = ci.id AND c.id = ci."companyId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "contractors" WITH (security_invoker = on) AS
  SELECT
    p.id AS "supplierContactId",
    p."active",
    p."hoursPerWeek",
    p."companyId",
    p."customFields",
    s.id AS "supplierId",
    s.name AS "supplierName",
    c."fullName",
    c."firstName",
    c."lastName",
    c."email",
    array_agg(pa."abilityId") AS "abilityIds"
  FROM "contractor" p
    INNER JOIN "supplierContact" sc
      ON sc.id = p.id
    INNER JOIN "supplier" s
      ON s.id = sc."supplierId"
    INNER JOIN "contact" c
      ON c.id = sc."contactId"
    LEFT JOIN "contractorAbility" pa
      ON pa."contractorId" = p.id
  WHERE p."active" = true
  GROUP BY p.id, p.active, p."hoursPerWeek", p."customFields", p."companyId", s.id, c.id, s.name, c."firstName", c."lastName", c."email";
--> statement-breakpoint

CREATE OR REPLACE VIEW "supplierProcesses" WITH(SECURITY_INVOKER=true) AS
  SELECT
    sp.*,
    p.name as "processName"
  FROM "supplierProcess" sp
  INNER JOIN "process" p ON sp."processId" = p.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "employees" WITH(SECURITY_INVOKER=true) AS
  SELECT
    u.id,
    u."email",
    u."firstName",
    u."lastName",
    u."fullName" AS "name",
    u."avatarUrl",
    e."employeeTypeId",
    e."companyId",
    e."active"
  FROM "user" u
  INNER JOIN "employee" e
    ON e.id = u.id
  WHERE u.active = TRUE;
--> statement-breakpoint

CREATE OR REPLACE VIEW "employeesAcrossCompanies" WITH(SECURITY_INVOKER=true) AS
  SELECT
    u.id,
    u.email,
    u."firstName",
    u."lastName",
    u."fullName" AS "name",
    u."avatarUrl",
    u.active,
    array_agg(e."companyId") as "companyId"
  FROM "user" u
  INNER JOIN "employee" e
    ON e.id = u.id
  WHERE u.active = TRUE
  GROUP BY u.id, u.email, u."firstName", u."lastName", u."fullName", u."avatarUrl", u.active;
--> statement-breakpoint

CREATE OR REPLACE VIEW "modules" AS
    SELECT unnest(enum_range(NULL::module)) AS name;
--> statement-breakpoint

CREATE OR REPLACE VIEW "jobOperationsWithMakeMethods" WITH(SECURITY_INVOKER=true) AS
  SELECT
    mm.id AS "makeMethodId",
    jo.*
  FROM "jobOperation" jo
  INNER JOIN "jobMakeMethod" jmm
    ON jo."jobMakeMethodId" = jmm.id
  LEFT JOIN "makeMethod" mm
    ON jmm."itemId" = mm."itemId" AND jmm."version" = mm."version";
--> statement-breakpoint

CREATE OR REPLACE VIEW "quoteOperationsWithMakeMethods" WITH(SECURITY_INVOKER=true) AS
  SELECT
    mm.id AS "makeMethodId",
    qo.*
  FROM "quoteOperation" qo
  INNER JOIN "quoteMakeMethod" qmm
    ON qo."quoteMakeMethodId" = qmm.id
  LEFT JOIN "makeMethod" mm
    ON qmm."itemId" = mm."itemId" AND qmm."version" = mm."version";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesRfqs" WITH(SECURITY_INVOKER=true) AS
  SELECT
  rfq.*,
  l."name" AS "locationName"
  FROM "salesRfq" rfq
  LEFT JOIN "location" l
    ON l.id = rfq."locationId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "activeMakeMethods"
WITH (security_invoker = true)
AS
WITH ranked_make_methods AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY "itemId", "companyId" ORDER BY
      CASE
        WHEN "status" = 'Active' THEN 1
        ELSE 2
      END,
      "version" DESC
    ) as rn
  FROM "makeMethod"
  WHERE "status" != 'Archived'
)
SELECT * FROM ranked_make_methods WHERE rn = 1;
--> statement-breakpoint

CREATE OR REPLACE VIEW "jobOperationsWithDependencies"
WITH (security_invoker = true)
AS
SELECT
  jo.*,
  COALESCE(
    (
      SELECT array_agg(jod."dependsOnId")
      FROM "jobOperationDependency" jod
      WHERE jod."operationId" = jo.id
    ),
    '{}'::text[]
  ) AS "dependencies"
FROM "jobOperation" jo;
--> statement-breakpoint

CREATE OR REPLACE VIEW "materialFinishes" WITH(SECURITY_INVOKER=true) AS
  SELECT
    "materialFinish"."id",
    "materialFinish"."name",
    "materialFinish"."materialSubstanceId",
    "materialFinish"."companyId",
    "materialSubstance"."name" AS "substanceName"
  FROM "materialFinish"
  LEFT JOIN "materialSubstance" ON "materialFinish"."materialSubstanceId" = "materialSubstance"."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "materialGrades" WITH(SECURITY_INVOKER=true) AS
  SELECT
    "materialGrade"."id",
    "materialGrade"."materialSubstanceId",
    "materialGrade"."name",
    "materialGrade"."companyId",
    "materialSubstance"."name" AS "substanceName"
  FROM "materialGrade"
  LEFT JOIN "materialSubstance" ON "materialGrade"."materialSubstanceId" = "materialSubstance"."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "materialTypes" WITH(SECURITY_INVOKER=true) AS
  SELECT
    "materialType"."id",
    "materialType"."name",
    "materialType"."materialSubstanceId",
    "materialType"."materialFormId",
    "materialType"."companyId",
    "materialSubstance"."name" AS "substanceName",
    "materialForm"."name" AS "formName"
  FROM "materialType"
  LEFT JOIN "materialSubstance" ON "materialType"."materialSubstanceId" = "materialSubstance"."id"
  LEFT JOIN "materialForm" ON "materialType"."materialFormId" = "materialForm"."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "materialDimensions" WITH(SECURITY_INVOKER=true) AS
  SELECT
    "materialDimension"."id",
    "materialDimension"."materialFormId",
    "materialDimension"."name",
    "materialDimension"."isMetric",
    "materialDimension"."companyId",
    "materialForm"."name" AS "formName"
  FROM "materialDimension"
  LEFT JOIN "materialForm" ON "materialDimension"."materialFormId" = "materialForm"."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "workCenters" WITH(SECURITY_INVOKER=true) AS
  SELECT
     wc.*,
     l.name as "locationName",
     wcp.processes
  FROM "workCenter" wc
  LEFT JOIN location l
  ON wc."locationId" = l.id
  LEFT JOIN (
    SELECT
      "workCenterId",
      array_agg("processId"::text) as processes
    FROM "workCenterProcess" wcp
    INNER JOIN "process" p ON wcp."processId" = p.id
    GROUP BY "workCenterId"
  ) wcp ON wc.id = wcp."workCenterId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "qualityActions" WITH(SECURITY_INVOKER=true) AS
  SELECT
    ncat.*,
    ncra."name" AS "actionType",
    ncr."nonConformanceId" AS "readableNonConformanceId",
    ncr."name" AS "nonConformanceName",
    ncr."status" AS "nonConformanceStatus",
    ncr."openDate" AS "nonConformanceOpenDate",
    ncr."dueDate" AS "nonConformanceDueDate",
    ncr."closeDate" AS "nonConformanceCloseDate",
    nct."name" AS "nonConformanceTypeName",
    nci."items"
  FROM "nonConformanceActionTask" ncat
  INNER JOIN "nonConformance" ncr ON ncat."nonConformanceId" = ncr."id"
  LEFT JOIN "nonConformanceRequiredAction" ncra ON ncra."id" = ncat."actionTypeId"
  LEFT JOIN "nonConformanceType" nct ON ncr."nonConformanceTypeId" = nct."id"
  LEFT JOIN (
    SELECT
      "nonConformanceId",
      array_agg("itemId"::text) as items
    FROM "nonConformanceItem" nci
    GROUP BY "nonConformanceId"
  ) nci ON nci."nonConformanceId" = ncr."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "qualityDocuments" WITH(SECURITY_INVOKER=true) AS
  SELECT
    p1."id",
    p1."name",
    p1."version",
    p1."status",
    p1."assignee",
    p1."companyId",
    jsonb_agg(
      jsonb_build_object(
        'id', p2."id",
        'version', p2."version",
        'status', p2."status"
      )
    ) as "versions",
    p1."tags"
  FROM "qualityDocument" p1
  JOIN "qualityDocument" p2 ON p1."name" = p2."name" AND p1."companyId" = p2."companyId"
  WHERE p1."version" = (
    SELECT MAX("version")
    FROM "qualityDocument" p3
    WHERE p3."name" = p1."name"
    AND p3."companyId" = p1."companyId"
  )
  GROUP BY p1."id", p1."name", p1."version", p1."status", p1."assignee", p1."companyId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "procedures" WITH(SECURITY_INVOKER=true) AS
  SELECT
    p1."id",
    p1."name",
    p1."version",
    p1."status",
    p1."assignee",
    p1."companyId",
    p1."processId",
    p1."tags",
    jsonb_agg(
      jsonb_build_object(
        'id', p2."id",
        'version', p2."version",
        'status', p2."status"
      )
    ) as "versions"
  FROM "procedure" p1
  JOIN "procedure" p2 ON p1."name" = p2."name" AND p1."companyId" = p2."companyId"
  WHERE p1."version" = (
    SELECT MAX("version")
    FROM "procedure" p3
    WHERE p3."name" = p1."name"
    AND p3."companyId" = p1."companyId"
  )
  GROUP BY p1."id", p1."name", p1."version", p1."status", p1."assignee", p1."companyId", p1."processId", p1."tags";
--> statement-breakpoint

CREATE OR REPLACE VIEW "supplierQuotes"
WITH
  (SECURITY_INVOKER = true) AS
SELECT
  q.*,
  ql."thumbnailPath",
  ql."itemType"
FROM
  "supplierQuote" q
  LEFT JOIN (
    SELECT
      "supplierQuoteId",
      MIN(
        CASE
          WHEN i."thumbnailPath" IS NULL
          AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
          ELSE i."thumbnailPath"
        END
      ) AS "thumbnailPath",
      MIN(i."type") AS "itemType"
    FROM
      "supplierQuoteLine"
      INNER JOIN "item" i ON i."id" = "supplierQuoteLine"."itemId"
      LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    GROUP BY
      "supplierQuoteId"
  ) ql ON ql."supplierQuoteId" = q.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "trainings" WITH(SECURITY_INVOKER=true) AS
  SELECT
    t1."id",
    t1."name",
    t1."description",
    t1."version",
    t1."status",
    t1."type",
    t1."frequency",
    t1."assignee",
    t1."estimatedDuration",
    t1."tags",
    t1."companyId",
    jsonb_agg(
      jsonb_build_object(
        'id', t2."id",
        'version', t2."version",
        'status', t2."status"
      )
    ) as "versions"
  FROM "training" t1
  JOIN "training" t2 ON t1."name" = t2."name" AND t1."companyId" = t2."companyId"
  WHERE t1."version" = (
    SELECT MAX("version")
    FROM "training" t3
    WHERE t3."name" = t1."name"
    AND t3."companyId" = t1."companyId"
  )
  GROUP BY t1."id", t1."name", t1."description", t1."version", t1."status", t1."type",
           t1."frequency", t1."assignee", t1."estimatedDuration", t1."tags", t1."companyId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "workCentersWithBlockingStatus" WITH (security_invoker = true) AS
SELECT
  wc.*,
  l.name AS "locationName",
  COALESCE(
    (SELECT COUNT(*) > 0
     FROM "maintenanceDispatch" md
     WHERE md."workCenterId" = wc.id
       AND md.status = 'In Progress'
       AND md."oeeImpact" IN ('Down', 'Planned')
    ), false
  ) AS "isBlocked",
  (
    SELECT md.id
    FROM "maintenanceDispatch" md
    WHERE md."workCenterId" = wc.id
      AND md.status = 'In Progress'
      AND md."oeeImpact" IN ('Down', 'Planned')
    ORDER BY md."createdAt" DESC
    LIMIT 1
  ) AS "blockingDispatchId",
  (
    SELECT md."maintenanceDispatchId"
    FROM "maintenanceDispatch" md
    WHERE md."workCenterId" = wc.id
      AND md.status = 'In Progress'
      AND md."oeeImpact" IN ('Down', 'Planned')
    ORDER BY md."createdAt" DESC
    LIMIT 1
  ) AS "blockingDispatchReadableId"
FROM "workCenter" wc
LEFT JOIN "location" l ON wc."locationId" = l.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "activeMaintenanceDispatchesByLocation" WITH (security_invoker = true) AS
SELECT
  md.id,
  md."maintenanceDispatchId",
  md.content,
  md.status,
  md.priority,
  md.source,
  md.severity,
  md."oeeImpact",
  md."workCenterId",
  md."maintenanceScheduleId",
  md."suspectedFailureModeId",
  md."actualFailureModeId",
  md."plannedStartTime",
  md."plannedEndTime",
  md."actualStartTime",
  md."actualEndTime",
  md.duration,
  md."nonConformanceId",
  md."completedAt",
  md.assignee,
  md."companyId",
  md."createdBy",
  md."createdAt",
  md."updatedBy",
  md."updatedAt",
  wc."locationId",
  wc.name AS "workCenterName",
  l.name AS "locationName",
  assignee."fullName" AS "assigneeName",
  assignee."avatarUrl" AS "assigneeAvatarUrl",
  sfm.name AS "suspectedFailureModeName",
  afm.name AS "actualFailureModeName"
FROM "maintenanceDispatch" md
LEFT JOIN "workCenter" wc ON md."workCenterId" = wc.id
LEFT JOIN "location" l ON wc."locationId" = l.id
LEFT JOIN "user" assignee ON md.assignee = assignee.id
LEFT JOIN "maintenanceFailureMode" sfm ON md."suspectedFailureModeId" = sfm.id
LEFT JOIN "maintenanceFailureMode" afm ON md."actualFailureModeId" = afm.id
WHERE md.status IN ('Open', 'Assigned', 'In Progress');
--> statement-breakpoint

CREATE OR REPLACE VIEW "suggestions"
WITH (security_invoker = true) AS
  SELECT
    s."id",
    s."suggestion",
    s."emoji",
    s."path",
    s."attachmentPath",
    s."tags",
    s."userId",
    s."companyId",
    s."createdAt",
    u."fullName" AS "employeeName",
    u."avatarUrl" AS "employeeAvatarUrl"
  FROM "suggestion" s
  LEFT JOIN "user" u ON s."userId" = u."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "maintenanceSchedules"
WITH (security_invoker = true) AS
SELECT
  ms.id,
  ms.name,
  ms.description,
  ms.frequency,
  ms.priority,
  ms."estimatedDuration",
  ms.active,
  ms.monday,
  ms.tuesday,
  ms.wednesday,
  ms.thursday,
  ms.friday,
  ms.saturday,
  ms.sunday,
  ms."skipHolidays",
  ms."nextDueAt",
  ms."lastGeneratedAt",
  ms."workCenterId",
  COALESCE(ms."locationId", wc."locationId") AS "locationId",
  ms."companyId",
  ms."createdAt",
  ms."createdBy",
  ms."updatedAt",
  ms."updatedBy",
  wc."name" AS "workCenterName",
  l."name" AS "locationName"
FROM "maintenanceSchedule" ms
LEFT JOIN "workCenter" wc ON ms."workCenterId" = wc."id"
LEFT JOIN "location" l ON COALESCE(ms."locationId", wc."locationId") = l."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "riskRegisters"
WITH (security_invoker = on)
AS
SELECT
  r.*,
  wc."name" as "workCenterName",
  wc."id" as "workCenterId"
FROM
  "riskRegister" r
LEFT JOIN "workCenter" wc ON r."sourceId" = wc."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchasingRfqLines" WITH(SECURITY_INVOKER=true) AS
  SELECT
    prl.*,
    i."name" as "itemName",
    i."readableId" AS "itemReadableId",
    i."type" AS "itemType",
    i."thumbnailPath",
    mu."modelPath"
  FROM "purchasingRfqLine" prl
  LEFT JOIN "item" i ON i.id = prl."itemId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchasingRfqs" WITH(SECURITY_INVOKER=true) AS
  SELECT
    rfq.*,
    l."name" AS "locationName",
    (SELECT COUNT(*) FROM "purchasingRfqSupplier" rs WHERE rs."purchasingRfqId" = rfq.id) AS "supplierCount",
    (SELECT COALESCE(array_agg(s."id" ORDER BY s."id"), ARRAY[]::TEXT[]) FROM "purchasingRfqSupplier" rs JOIN "supplier" s ON s.id = rs."supplierId" WHERE rs."purchasingRfqId" = rfq.id) AS "supplierIds",
    EXISTS(SELECT 1 FROM "purchasingRfqFavorite" rf WHERE rf."rfqId" = rfq.id AND rf."userId" = app_uid()) AS favorite
  FROM "purchasingRfq" rfq
  LEFT JOIN "location" l ON l.id = rfq."locationId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "quotes" WITH(SECURITY_INVOKER=true) AS
  SELECT
  q.*,
  ql."thumbnailPath",
  ql."itemType",
  l."name" AS "locationName",
  ql."lines",
  ql."completedLines",
  qs."shippingCost"
  FROM "quote" q
  LEFT JOIN (
    SELECT
      "quoteId",
      COUNT("quoteLine"."id") FILTER (WHERE "quoteLine"."status" != 'No Quote') AS "lines",
      COUNT("quoteLine"."id") FILTER (WHERE "quoteLine"."status" = 'Complete') AS "completedLines",
      MIN(CASE
        WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
        ELSE i."thumbnailPath"
      END) AS "thumbnailPath",
      MIN(i."type") AS "itemType"
    FROM "quoteLine"
    INNER JOIN "item" i
      ON i."id" = "quoteLine"."itemId"
    LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    GROUP BY "quoteId"
  ) ql ON ql."quoteId" = q.id
  LEFT JOIN "quoteShipment" qs ON qs."id" = q."id"
  LEFT JOIN "location" l
    ON l.id = q."locationId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "currencies" WITH(SECURITY_INVOKER=true) AS
  SELECT c.*, cc."name"
  FROM "currency" c
  INNER JOIN "currencyCode" cc
    ON cc."code" = c."code";
--> statement-breakpoint

CREATE OR REPLACE VIEW "dimensionValues" WITH(SECURITY_INVOKER=true) AS
  SELECT
    d."id" AS "dimensionId",
    d."name" AS "dimensionName",
    d."entityType",
    d."companyGroupId",
    dv."id" AS "valueId",
    dv."name" AS "valueName"
  FROM "dimension" d
  LEFT JOIN "dimensionValue" dv ON dv."dimensionId" = d."id"
  WHERE d."entityType" = 'Custom';
--> statement-breakpoint

CREATE OR REPLACE VIEW "approvalRequests" WITH (SECURITY_INVOKER=true) AS
SELECT
  ar."id",
  ar."documentType",
  ar."documentId",
  ar."status",
  ar."requestedBy",
  ar."requestedAt",
  ar."decisionBy",
  ar."decisionAt",
  ar."decisionNotes",
  ar."companyId",
  ar."createdAt",
  CASE
    WHEN ar."documentType" = 'purchaseOrder' THEN po."purchaseOrderId"
    WHEN ar."documentType" = 'qualityDocument' THEN qd."name"
    WHEN ar."documentType" = 'supplier' THEN sup."name"
    ELSE NULL
  END AS "documentReadableId",
  CASE
    WHEN ar."documentType" = 'purchaseOrder' THEN s."name"
    WHEN ar."documentType" = 'qualityDocument' THEN qd."description"
    WHEN ar."documentType" = 'supplier' THEN NULL
    ELSE NULL
  END AS "documentDescription"
FROM "approvalRequest" ar
LEFT JOIN "purchaseOrder" po ON ar."documentType" = 'purchaseOrder' AND ar."documentId" = po."id"
LEFT JOIN "supplier" s ON po."supplierId" = s."id"
LEFT JOIN "qualityDocument" qd ON ar."documentType" = 'qualityDocument' AND ar."documentId" = qd."id"
LEFT JOIN "supplier" sup ON ar."documentType" = 'supplier' AND ar."documentId" = sup."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "issues" WITH(SECURITY_INVOKER=true) AS
  SELECT
    ncr.*,
    nci."items",
    CASE
      WHEN EXISTS (
        SELECT 1 FROM "nonConformanceActionTask" ncat
        JOIN "nonConformanceRequiredAction" ncra ON ncat."actionTypeId" = ncra.id
        WHERE ncat."nonConformanceId" = ncr.id
          AND ncra."systemType" = to_jsonb('Containment'::text)
          AND ncat.status IN ('In Progress', 'Completed')
      ) THEN 'Contained'
      WHEN EXISTS (
        SELECT 1 FROM "nonConformanceActionTask" ncat
        JOIN "nonConformanceRequiredAction" ncra ON ncat."actionTypeId" = ncra.id
        WHERE ncat."nonConformanceId" = ncr.id
          AND ncra."systemType" = to_jsonb('Containment'::text)
      ) THEN 'Uncontained'
      ELSE 'N/A'
    END AS "containmentStatus"
  FROM "nonConformance" ncr
  LEFT JOIN (
    SELECT "nonConformanceId", array_agg("itemId"::text) as items
    FROM "nonConformanceItem"
    GROUP BY "nonConformanceId"
  ) nci ON nci."nonConformanceId" = ncr."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "timeCardEntries" WITH (SECURITY_INVOKER=true) AS
SELECT
  tce."id",
  tce."employeeId",
  tce."companyId",
  tce."clockIn",
  tce."clockOut",
  tce."note",
  tce."autoCloseShiftId",
  tce."createdBy",
  tce."createdAt",
  tce."updatedBy",
  tce."updatedAt",
  u."firstName",
  u."lastName",
  u."avatarUrl",
  ej."title" AS "jobTitle",
  ej."shiftId",
  ej."locationId",
  s."name" AS "shiftName",
  l."name" AS "locationName",
  CASE WHEN tce."clockOut" IS NULL THEN 'Active' ELSE 'Complete' END AS "status"
FROM "timeCardEntry" tce
INNER JOIN "user" u ON tce."employeeId" = u."id"
LEFT JOIN "employeeJob" ej ON ej."id" = tce."employeeId" AND ej."companyId" = tce."companyId"
LEFT JOIN "shift" s ON ej."shiftId" = s."id"
LEFT JOIN "location" l ON ej."locationId" = l."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesRfqLines" WITH(SECURITY_INVOKER=true) AS
  SELECT
    srl.*,
    mu.id as "modelId",
    mu."autodeskUrn",
    mu."modelPath",
    mu."name" as "modelName",
    mu."size" as "modelSize",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    i."name" as "itemName",
    i."defaultMethodType" AS "methodType",
    i."readableId" AS "itemReadableId",
    i."type" AS "itemType"
  FROM "salesRfqLine" srl
  LEFT JOIN "item" i ON i.id = srl."itemId"
  LEFT JOIN "modelUpload" mu ON mu.id = srl."modelUploadId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "quoteLinePrices" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    ql.*,
    i."readableIdWithRevision" as "itemReadableId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    COALESCE(mu.id, imu.id) as "modelId",
    COALESCE(mu."autodeskUrn", imu."autodeskUrn") as "autodeskUrn",
    COALESCE(mu."modelPath", imu."modelPath") as "modelPath",
    COALESCE(mu."name", imu."name") as "modelName",
    COALESCE(mu."size", imu."size") as "modelSize",
    ic."unitCost" as "unitCost",
    qlp."quantity" as "qty",
    qlp."unitPrice",
    CASE
      WHEN q."revisionId" > 0 THEN q."quoteId" || '-' || q."revisionId"::text
      ELSE q."quoteId"
    END as "quoteReadableId",
    q."createdAt" as "quoteCreatedAt",
    q."customerId"
  FROM "quoteLine" ql
  INNER JOIN "quote" q ON q.id = ql."quoteId"
  LEFT JOIN "modelUpload" mu ON ql."modelUploadId" = mu."id"
  INNER JOIN "item" i ON i.id = ql."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
  LEFT JOIN "quoteLinePrice" qlp ON qlp."quoteLineId" = ql.id
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "journalEntries"
WITH (security_invoker = true)
AS
  SELECT
    j.*,
    COALESCE(SUM(
      CASE
        WHEN a."class" IN ('Asset', 'Expense') AND jl."amount" > 0 THEN jl."amount"
        WHEN a."class" IN ('Liability', 'Equity', 'Revenue') AND jl."amount" < 0 THEN ABS(jl."amount")
        ELSE 0
      END
    ), 0) AS "totalDebits",
    COALESCE(SUM(
      CASE
        WHEN a."class" IN ('Asset', 'Expense') AND jl."amount" < 0 THEN ABS(jl."amount")
        WHEN a."class" IN ('Liability', 'Equity', 'Revenue') AND jl."amount" > 0 THEN jl."amount"
        ELSE 0
      END
    ), 0) AS "totalCredits",
    COUNT(jl."id")::integer AS "lineCount"
  FROM "journal" j
  LEFT JOIN "journalLine" jl ON jl."journalId" = j."id"
  LEFT JOIN "account" a ON a."id" = jl."accountId"
  GROUP BY j."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "accounts" WITH(SECURITY_INVOKER=true) AS SELECT "account".* FROM "account";
--> statement-breakpoint

CREATE OR REPLACE VIEW "eventSystemTrigger" AS
SELECT
    t.tgrelid::regclass::text AS "tableName",

    -- Friendly Type Name
    CASE
        WHEN t.tgname LIKE 'trg_event_after_sync_%' THEN 'AFTER SYNC (ROW)'
        WHEN t.tgname LIKE 'trg_event_sync_%' THEN 'BEFORE SYNC (ROW)'
        WHEN t.tgname LIKE 'trg_event_async_%' THEN 'ASYNC (STATEMENT)'
        ELSE 'UNKNOWN'
    END AS "type",

    -- Cleaned Function List
    CASE
        WHEN t.tgname LIKE 'trg_event_after_sync_%' THEN
           REPLACE(
             REPLACE(
               substring(pg_get_triggerdef(t.oid) FROM 'dispatch_event_after_interceptors\((.*)\)'),
               '''', ''
             ),
             ', ', ' -> '
           )
        WHEN t.tgname LIKE 'trg_event_sync_%' THEN
           REPLACE(
             REPLACE(
               substring(pg_get_triggerdef(t.oid) FROM 'dispatch_event_interceptors\((.*)\)'),
               '''', ''
             ),
             ', ', ' -> '
           )
        ELSE 'PGMQ Batch'
    END AS "attachedFunctions",

    -- Status Badge
    CASE
        WHEN t.tgenabled = 'O' THEN 'Active'
        WHEN t.tgenabled = 'D' THEN 'Disabled'
        ELSE 'Replica Only'
    END AS "status",

    t.tgname AS "systemTriggerName"
FROM pg_trigger t
WHERE t.tgname LIKE 'trg_event_%'
ORDER BY "tableName", "type" DESC;
--> statement-breakpoint

CREATE OR REPLACE VIEW "storageUnits_recursive"
WITH (SECURITY_INVOKER = true) AS
WITH RECURSIVE t AS (
  SELECT
    "id",
    "parentId",
    "locationId",
    "warehouseId",
    "name",
    "active",
    "storageTypeIds",
    "companyId",
    1 AS "depth",
    ARRAY["id"] AS "ancestorPath"
  FROM "storageUnit"
  WHERE "parentId" IS NULL

  UNION ALL

  SELECT
    s."id",
    s."parentId",
    s."locationId",
    s."warehouseId",
    s."name",
    s."active",
    s."storageTypeIds",
    s."companyId",
    t."depth" + 1,
    t."ancestorPath" || s."id"
  FROM "storageUnit" s
  JOIN t ON s."parentId" = t."id"
)
SELECT * FROM t;
--> statement-breakpoint

CREATE OR REPLACE VIEW "jobMaterialWithMakeMethodId" WITH(SECURITY_INVOKER=true) AS
  SELECT
    jm.*,
    s."name" AS "storageUnitName",
    jmm."id" AS "jobMaterialMakeMethodId",
    jmm.version AS "version",
    i."readableIdWithRevision" as "itemReadableId",
    i."readableId" as "itemReadableIdWithoutRevision"
  FROM "jobMaterial" jm
  LEFT JOIN "jobMakeMethod" jmm
    ON jmm."parentMaterialId" = jm."id"
  LEFT JOIN "storageUnit" s ON s.id = jm."storageUnitId"
  INNER JOIN "item" i ON i.id = jm."itemId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "quoteMaterialWithMakeMethodId" WITH(SECURITY_INVOKER=true) AS
  SELECT
    qm.*,
    qmm."id" AS "quoteMaterialMakeMethodId",
    qmm.version AS "version"
  FROM "quoteMaterial" qm
  LEFT JOIN "quoteMakeMethod" qmm
    ON qmm."parentMaterialId" = qm."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "jobs" WITH(SECURITY_INVOKER=true) AS
WITH job_model AS (
  SELECT
    j.id AS job_id,
    j."companyId",
    COALESCE(j."modelUploadId", i."modelUploadId") AS model_upload_id
  FROM "job" j
  INNER JOIN "item" i ON j."itemId" = i."id" AND j."companyId" = i."companyId"
)
SELECT
  j.*,
  jmm."id" as "jobMakeMethodId",
  i.name,
  i."readableIdWithRevision" as "itemReadableIdWithRevision",
  i.type as "itemType",
  i.name as "description",
  i."itemTrackingType",
  i.active,
  i."replenishmentSystem",
  mu.id as "modelId",
  mu."autodeskUrn",
  mu."modelPath",
  CASE
    WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
    ELSE i."thumbnailPath"
  END as "thumbnailPath",
  mu."name" as "modelName",
  mu."size" as "modelSize",
  so."salesOrderId" as "salesOrderReadableId",
  qo."quoteId" as "quoteReadableId"
FROM "job" j
LEFT JOIN "jobMakeMethod" jmm ON jmm."jobId" = j.id AND jmm."parentMaterialId" IS NULL
INNER JOIN "item" i ON j."itemId" = i."id" AND j."companyId" = i."companyId"
LEFT JOIN job_model jm ON j.id = jm.job_id AND j."companyId" = jm."companyId"
LEFT JOIN "modelUpload" mu ON mu.id = jm.model_upload_id
LEFT JOIN "salesOrder" so on j."salesOrderId" = so.id AND j."companyId" = so."companyId"
LEFT JOIN "quote" qo ON j."quoteId" = qo.id AND j."companyId" = qo."companyId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "stockTransferLines"
WITH (security_invoker = true) AS
SELECT
  stl.*,
  CASE
    WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
    ELSE i."thumbnailPath"
  END AS "thumbnailPath",
  i."readableIdWithRevision" as "itemReadableId",
  i."name" as "itemDescription",
  uom."name" AS "unitOfMeasure",
  sf."name" AS "fromStorageUnitName",
  st."name" AS "toStorageUnitName"
FROM "stockTransferLine" stl
LEFT JOIN "item" i ON i."id" = stl."itemId"
LEFT JOIN "modelUpload" mu ON mu."id" = i."modelUploadId"
LEFT JOIN "unitOfMeasure" uom ON uom."code" = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
LEFT JOIN "storageUnit" sf ON sf."id" = stl."fromStorageUnitId"
LEFT JOIN "storageUnit" st ON st."id" = stl."toStorageUnitId"
ORDER BY "itemReadableId" ASC, "toStorageUnitName" ASC;
--> statement-breakpoint

CREATE OR REPLACE VIEW "shipmentLines" WITH(SECURITY_INVOKER=true) AS
  SELECT
    sl.*,
    i."readableIdWithRevision" as "itemReadableId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    i."name" as "description"
  FROM "shipmentLine" sl
  INNER JOIN "item" i ON i."id" = sl."itemId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "receipts" WITH(SECURITY_INVOKER=true) AS
  SELECT
    r.*,
    l."name" as "locationName"
  FROM "receipt" r
  LEFT JOIN "location" l
    ON l.id = r."locationId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "receiptLines" WITH(SECURITY_INVOKER=true) AS
  SELECT
    rl.*,
    i."readableIdWithRevision" as "itemReadableId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    i."name" as "description"
  FROM "receiptLine" rl
  INNER JOIN "item" i ON i."id" = rl."itemId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesInvoices" WITH(SECURITY_INVOKER=true) AS
  SELECT
    si.*,
    sil."thumbnailPath",
    sil."itemType",
    sil."invoiceTotal" + COALESCE(ss."shippingCost", 0) AS "invoiceTotal",
    sil."lines"
  FROM "salesInvoice" si
  LEFT JOIN (
    SELECT
      sil."invoiceId",
      MIN(CASE
        WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
        ELSE i."thumbnailPath"
      END) AS "thumbnailPath",
      SUM(
        DISTINCT (1+COALESCE(sil."taxPercent", 0))*(COALESCE(sil."quantity", 0)*(COALESCE(sil."unitPrice", 0)) + COALESCE(sil."shippingCost", 0) + COALESCE(sil."addOnCost", 0)) + COALESCE(sil."nonTaxableAddOnCost", 0)
      ) AS "invoiceTotal",
      SUM(COALESCE(sil."shippingCost", 0)) AS "shippingCost",
      MIN(i."type") AS "itemType",
      ARRAY_AGG(
        json_build_object(
          'id', sil.id,
          'invoiceLineType', sil."invoiceLineType",
          'quantity', sil."quantity",
          'unitPrice', sil."unitPrice",
          'itemId', sil."itemId"
        )
      ) AS "lines"
    FROM "salesInvoiceLine" sil
    LEFT JOIN "item" i
      ON i."id" = sil."itemId"
    LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    GROUP BY sil."invoiceId"
  ) sil ON sil."invoiceId" = si."id"
  JOIN "salesInvoiceShipment" ss ON ss."id" = si."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "openSalesOrderLines" AS (
  SELECT
    sol."id",
    sol."salesOrderId",
    sol."itemId",
    sol."promisedDate",
    sol."methodType",
    sol."unitOfMeasureCode",
    sol."quantityToSend",
    sol."salesOrderLineType",
    sol."companyId",
    COALESCE(sol."locationId", so."locationId") AS "locationId",
    i."replenishmentSystem",
    i."itemTrackingType",
    ir."leadTime" AS "leadTime"
  FROM "salesOrderLine" sol
  INNER JOIN "salesOrder" so ON sol."salesOrderId" = so."id"
  INNER JOIN "item" i ON sol."itemId" = i."id"
  INNER JOIN "itemReplenishment" ir ON i."id" = ir."itemId"
  WHERE
    sol."salesOrderLineType" != 'Service'
    AND sol."methodType" != 'Make to Order'
    AND so."status" IN ('To Ship', 'To Ship and Invoice')
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "openJobMaterialLines" AS (
  SELECT
    jm."id",
    jm."jobId",
    jmm."parentMaterialId",
    jm."jobMakeMethodId",
    j."jobId" as "jobReadableId",
    jm."itemId",
    jm."quantityToIssue",
    jm."unitOfMeasureCode",
    jm."companyId",
    i1."replenishmentSystem",
    i1."itemTrackingType",
    ir."leadTime" AS "leadTime",
    j."locationId",
    j."dueDate"
  FROM "jobMaterial" jm
  INNER JOIN "job" j ON jm."jobId" = j."id"
  INNER JOIN "jobMakeMethod" jmm ON jm."jobMakeMethodId" = jmm."id"
  INNER JOIN "item" i1 ON jm."itemId" = i1."id"
  INNER JOIN "item" i2 ON j."itemId" = i2."id"
  INNER JOIN "itemReplenishment" ir ON i2."id" = ir."itemId"
  WHERE j."status" IN (
      'Planned',
      'Ready',
      'In Progress',
      'Paused'
    )
  AND jm."methodType" != 'Make to Order'
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "openProductionOrders"
WITH (security_invoker = true)
AS (
  SELECT
    j."id",
    j."itemId",
    j."jobId",
    j."productionQuantity" - j."quantityReceivedToInventory" AS "quantityToReceive",
    j."unitOfMeasureCode",
    j."companyId",
    i."replenishmentSystem",
    i."itemTrackingType",
    ir."leadTime" AS "leadTime",
    j."locationId",
    j."dueDate",
    j."deadlineType"
  FROM "job" j
  INNER JOIN "item" i ON j."itemId" = i."id"
  INNER JOIN "itemReplenishment" ir ON i."id" = ir."itemId"
  WHERE j."status" IN (
      'Planned',
      'Ready',
      'In Progress',
      'Paused'
    )
  AND j."salesOrderId" IS NULL
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "openPurchaseOrderLines" WITH (security_invoker=true) AS (
  SELECT
    pol."id",
    pol."purchaseOrderId",
    po."purchaseOrderId" as "purchaseOrderReadableId",
    po."supplierId",
    pol."itemId",
    pol."quantityToReceive" * pol."conversionFactor" AS "quantityToReceive",
    i."unitOfMeasureCode",
    pol."purchaseOrderLineType",
    COALESCE(pod."receiptRequestedDate", pod."receiptPromisedDate", po."orderDate") AS "dueDate",
    pol."companyId",
    pol."locationId",
    po."orderDate",
    po."status",
    COALESCE(pol."promisedDate", pod."receiptPromisedDate") AS "promisedDate",
    i."replenishmentSystem",
    i."itemTrackingType",
    ir."leadTime" AS "leadTime"
  FROM "purchaseOrderLine" pol
  INNER JOIN "purchaseOrder" po ON pol."purchaseOrderId" = po."id"
  INNER JOIN "purchaseOrderDelivery" pod ON pod."id" = po."id"
  INNER JOIN "item" i ON pol."itemId" = i."id"
  INNER JOIN "itemReplenishment" ir ON i."id" = ir."itemId"
  WHERE
    pol."purchaseOrderLineType" != 'Service'
    AND po."status" IN ('To Receive', 'To Receive and Invoice', 'Planned')
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "gauges" WITH(SECURITY_INVOKER=true) AS
SELECT
  g.*,
  CASE
    WHEN g."gaugeStatus" = 'Inactive' THEN 'Out-of-Calibration'
    WHEN g."nextCalibrationDate" IS NOT NULL AND g."nextCalibrationDate" < CURRENT_DATE THEN 'Out-of-Calibration'
    ELSE g."gaugeCalibrationStatus"
  END as "gaugeCalibrationStatusWithDueDate"
FROM "gauge" g;
--> statement-breakpoint

CREATE OR REPLACE VIEW "gaugeCalibrationRecords" WITH(SECURITY_INVOKER=true) AS
SELECT
  gcr.*,
  g."gaugeId" as "gaugeReadableId",
  g."gaugeTypeId",
  g."description"
FROM "gaugeCalibrationRecord" gcr
JOIN "gauge" g ON gcr."gaugeId" = g."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "kanbans" WITH(SECURITY_INVOKER=true) AS
SELECT
  k.*,
  i.name,
  i."readableIdWithRevision",
  j."jobId" as "jobReadableId",
  l.name as "locationName",
  s.name as "storageUnitName",
  su.name as "supplierName",
  CASE
    WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
    ELSE i."thumbnailPath"
  END AS "thumbnailPath"
FROM "kanban" k
JOIN "item" i ON k."itemId" = i."id"
LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
JOIN "location" l ON k."locationId" = l."id"
LEFT JOIN "storageUnit" s ON k."storageUnitId" = s."id"
LEFT JOIN "supplier" su ON k."supplierId" = su."id"
LEFT JOIN "job" j ON k."jobId" = j."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "parts" WITH (SECURITY_INVOKER=true) AS
WITH latest_items AS (
  SELECT DISTINCT ON (i."readableId", i."companyId")
    i.*,
    mu.id as "modelUploadId",

    mu."modelPath",
    mu."thumbnailPath" as "modelThumbnailPath",
    mu."name" as "modelName",
    mu."size" as "modelSize"
  FROM "item" i
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  WHERE i."type" = 'Part'
  ORDER BY i."readableId", i."companyId",
    CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END DESC,
    i."createdAt" DESC NULLS LAST
),
item_revisions AS (
  SELECT
    i."readableId",
    i."companyId",
    json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'name', i."name",
        'description', i."description",
        'active', i."active",
        'createdAt', i."createdAt"
      ) ORDER BY
        CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END,
        i."createdAt"
      ) as "revisions"
  FROM "item" i
  WHERE i."type" = 'Part'
  GROUP BY i."readableId", i."companyId"
)
SELECT
  li."active",
  li."assignee",
  li."defaultMethodType",
  li."description",
  li."itemTrackingType",
  li."name",
  li."replenishmentSystem",
  li."unitOfMeasureCode",
  li."notes",
  li."revision",
  li."readableId",
  li."readableIdWithRevision",
  li."id",
  li."companyId",
  CASE
    WHEN li."thumbnailPath" IS NULL AND li."modelThumbnailPath" IS NOT NULL THEN li."modelThumbnailPath"
    ELSE li."thumbnailPath"
  END as "thumbnailPath",

  li."modelPath",
  li."modelName",
  li."modelSize",
  ps."supplierIds",
  uom.name as "unitOfMeasure",
  ir."revisions",
  p."customFields",
  p."tags",
  ic."itemPostingGroupId",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item' AND eim."entityId" = li.id
  ) AS "externalId",
  li."createdBy",
  li."createdAt",
  li."updatedBy",
  li."updatedAt"
FROM "part" p
INNER JOIN latest_items li ON li."readableId" = p."id" AND li."companyId" = p."companyId"
LEFT JOIN item_revisions ir ON ir."readableId" = p."id" AND ir."companyId" = p."companyId"
LEFT JOIN (
  SELECT
    "itemId",
    "companyId",
    string_agg(ps."supplierPartId", ',') AS "supplierIds"
  FROM "supplierPart" ps
  GROUP BY "itemId", "companyId"
) ps ON ps."itemId" = li."id" AND ps."companyId" = li."companyId"
LEFT JOIN "unitOfMeasure" uom ON uom.code = li."unitOfMeasureCode" AND uom."companyId" = li."companyId"
LEFT JOIN "itemCost" ic ON ic."itemId" = li.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "materials" WITH (SECURITY_INVOKER=true) AS
WITH latest_items AS (
  SELECT DISTINCT ON (i."readableId", i."companyId")
    i.*,

    mu."modelPath",
    mu."thumbnailPath" as "modelThumbnailPath",
    mu."name" as "modelName",
    mu."size" as "modelSize"
  FROM "item" i
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  WHERE i."type" = 'Material'
  ORDER BY i."readableId", i."companyId",
    CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END DESC,
    i."createdAt" DESC NULLS LAST
),
item_revisions AS (
  SELECT
    i."readableId",
    i."companyId",
    json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      ) ORDER BY
        CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END,
        i."createdAt"
      ) as "revisions"
  FROM "item" i
  WHERE i."type" = 'Material'
  GROUP BY i."readableId", i."companyId"
)
SELECT
  i."active",
  i."assignee",
  i."defaultMethodType",
  i."description",
  i."itemTrackingType",
  i."name",
  i."replenishmentSystem",
  i."unitOfMeasureCode",
  i."notes",
  i."revision",
  i."readableId",
  i."readableIdWithRevision",
  i."id",
  i."companyId",
  CASE
    WHEN i."thumbnailPath" IS NULL AND i."modelThumbnailPath" IS NOT NULL THEN i."modelThumbnailPath"
    ELSE i."thumbnailPath"
  END as "thumbnailPath",
  i."modelUploadId",
  i."modelPath",
  i."modelName",
  i."modelSize",
  ps."supplierIds",
  uom.name as "unitOfMeasure",
  ir."revisions",
  mf."name" AS "materialForm",
  ms."name" AS "materialSubstance",
  md."name" AS "dimensions",
  mfin."name" AS "finish",
  mg."name" AS "grade",
  mt."name" AS "materialType",
  m."materialSubstanceId",
  m."materialFormId",
  m."customFields",
  m."tags",
  ic."itemPostingGroupId",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item' AND eim."entityId" = i.id
  ) AS "externalId",
  i."createdBy",
  i."createdAt",
  i."updatedBy",
  i."updatedAt"
FROM "material" m
  INNER JOIN latest_items i ON i."readableId" = m."id" AND i."companyId" = m."companyId"
  LEFT JOIN item_revisions ir ON ir."readableId" = m."id" AND ir."companyId" = i."companyId"
  LEFT JOIN (
    SELECT
      ps."itemId",
      ps."companyId",
      string_agg(ps."supplierPartId", ',') AS "supplierIds"
    FROM "supplierPart" ps
    GROUP BY ps."itemId", ps."companyId"
  ) ps ON ps."itemId" = i."id" AND ps."companyId" = i."companyId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  LEFT JOIN "unitOfMeasure" uom ON uom.code = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
  LEFT JOIN "materialForm" mf ON mf."id" = m."materialFormId"
  LEFT JOIN "materialSubstance" ms ON ms."id" = m."materialSubstanceId"
  LEFT JOIN "materialDimension" md ON m."dimensionId" = md."id"
  LEFT JOIN "materialFinish" mfin ON m."finishId" = mfin."id"
  LEFT JOIN "materialGrade" mg ON m."gradeId" = mg."id"
  LEFT JOIN "materialType" mt ON m."materialTypeId" = mt."id"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "tools" WITH (SECURITY_INVOKER=true) AS
WITH latest_items AS (
  SELECT DISTINCT ON (i."readableId", i."companyId")
    i.*,
    mu.id as "modelUploadId",

    mu."modelPath",
    mu."thumbnailPath" as "modelThumbnailPath",
    mu."name" as "modelName",
    mu."size" as "modelSize"
  FROM "item" i
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  WHERE i."type" = 'Tool'
  ORDER BY i."readableId", i."companyId",
    CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END DESC,
    i."createdAt" DESC NULLS LAST
),
item_revisions AS (
  SELECT
    i."readableId",
    i."companyId",
    json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      ) ORDER BY
        CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END,
        i."createdAt"
      ) as "revisions"
  FROM "item" i
  WHERE i."type" = 'Tool'
  GROUP BY i."readableId", i."companyId"
)
SELECT
  li."active",
  li."assignee",
  li."defaultMethodType",
  li."description",
  li."itemTrackingType",
  li."name",
  li."replenishmentSystem",
  li."unitOfMeasureCode",
  li."notes",
  li."revision",
  li."readableId",
  li."readableIdWithRevision",
  li."id",
  li."companyId",
  CASE
    WHEN li."thumbnailPath" IS NULL AND li."modelThumbnailPath" IS NOT NULL THEN li."modelThumbnailPath"
    ELSE li."thumbnailPath"
  END as "thumbnailPath",

  li."modelPath",
  li."modelName",
  li."modelSize",
  ps."supplierIds",
  uom.name as "unitOfMeasure",
  ir."revisions",
  t."customFields",
  t."tags",
  ic."itemPostingGroupId",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item' AND eim."entityId" = li.id
  ) AS "externalId",
  li."createdBy",
  li."createdAt",
  li."updatedBy",
  li."updatedAt"
FROM "tool" t
  INNER JOIN latest_items li ON li."readableId" = t."id" AND li."companyId" = t."companyId"
LEFT JOIN item_revisions ir ON ir."readableId" = t."id" AND ir."companyId" = li."companyId"
LEFT JOIN (
  SELECT
    "itemId",
    "companyId",
    string_agg(ps."supplierPartId", ',') AS "supplierIds"
  FROM "supplierPart" ps
  GROUP BY "itemId", "companyId"
) ps ON ps."itemId" = li."id" AND ps."companyId" = li."companyId"
LEFT JOIN "unitOfMeasure" uom ON uom.code = li."unitOfMeasureCode" AND uom."companyId" = li."companyId"
LEFT JOIN "itemCost" ic ON ic."itemId" = li.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "consumables" WITH (SECURITY_INVOKER=true) AS
WITH latest_items AS (
  SELECT DISTINCT ON (i."readableId", i."companyId")
    i.*,
    mu."modelPath",
    mu."thumbnailPath" as "modelThumbnailPath",
    mu."name" as "modelName",
    mu."size" as "modelSize"
  FROM "item" i
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  WHERE i."type" = 'Consumable'
  ORDER BY i."readableId", i."companyId",
    CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END DESC,
    i."createdAt" DESC NULLS LAST
),
item_revisions AS (
  SELECT
    i."readableId",
    i."companyId",
    json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      ) ORDER BY
        CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END,
        i."createdAt"
      ) as "revisions"
  FROM "item" i
  WHERE i."type" = 'Consumable'
  GROUP BY i."readableId", i."companyId"
)
SELECT
  li."active",
  li."assignee",
  li."defaultMethodType",
  li."description",
  li."itemTrackingType",
  li."name",
  li."replenishmentSystem",
  li."unitOfMeasureCode",
  li."notes",
  li."revision",
  li."readableId",
  li."readableIdWithRevision",
  li."id",
  li."companyId",
  CASE
    WHEN li."thumbnailPath" IS NULL AND li."modelThumbnailPath" IS NOT NULL THEN li."modelThumbnailPath"
    ELSE li."thumbnailPath"
  END as "thumbnailPath",
  li."modelUploadId",
  li."modelPath",
  li."modelName",
  li."modelSize",
  ps."supplierIds",
  uom.name as "unitOfMeasure",
  ir."revisions",
  c."customFields",
  c."tags",
  ic."itemPostingGroupId",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item' AND eim."entityId" = li.id
  ) AS "externalId",
  li."createdBy",
  li."createdAt",
  li."updatedBy",
  li."updatedAt"
FROM "consumable" c
  INNER JOIN latest_items li ON li."readableId" = c."id" AND li."companyId" = c."companyId"
LEFT JOIN item_revisions ir ON ir."readableId" = c."id" AND ir."companyId" = li."companyId"
LEFT JOIN (
  SELECT
    "itemId",
    "companyId",
    string_agg(ps."supplierPartId", ',') AS "supplierIds"
  FROM "supplierPart" ps
  GROUP BY "itemId", "companyId"
) ps ON ps."itemId" = li."id" AND ps."companyId" = li."companyId"
LEFT JOIN "unitOfMeasure" uom ON uom.code = li."unitOfMeasureCode" AND uom."companyId" = li."companyId"
LEFT JOIN "itemCost" ic ON ic."itemId" = li.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "services" WITH(SECURITY_INVOKER=true) AS
WITH latest_items AS (
  SELECT DISTINCT ON (i."readableId", i."companyId")
    i.*
  FROM "item" i
  WHERE i."type" = 'Service'
  ORDER BY i."readableId", i."companyId",
    CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END DESC,
    i."createdAt" DESC NULLS LAST
),
item_revisions AS (
  SELECT
    i."readableId",
    i."companyId",
    json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      ) ORDER BY
        CASE WHEN i."revision" = '0' OR i."revision" = '' OR i."revision" IS NULL THEN 0 ELSE 1 END,
        i."createdAt"
      ) as "revisions"
  FROM "item" i
  WHERE i."type" = 'Service'
  GROUP BY i."readableId", i."companyId"
)
SELECT
  li."active",
  li."assignee",
  li."defaultMethodType",
  li."description",
  li."itemTrackingType",
  li."name",
  li."replenishmentSystem",
  li."unitOfMeasureCode",
  li."notes",
  li."revision",
  li."readableId",
  li."readableIdWithRevision",
  li."id",
  li."companyId",
  li."thumbnailPath",
  ps."supplierIds",
  uom.name as "unitOfMeasure",
  ir."revisions",
  s."customFields",
  s."tags",
  ic."itemPostingGroupId",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item' AND eim."entityId" = li.id
  ) AS "externalId",
  li."createdBy",
  li."createdAt",
  li."updatedBy",
  li."updatedAt"
FROM "service" s
  INNER JOIN latest_items li ON li."readableId" = s."id" AND li."companyId" = s."companyId"
LEFT JOIN item_revisions ir ON ir."readableId" = s."id" AND ir."companyId" = li."companyId"
LEFT JOIN (
  SELECT
    "itemId",
    "companyId",
    string_agg(ps."supplierPartId", ',') AS "supplierIds"
  FROM "supplierPart" ps
  GROUP BY "itemId", "companyId"
) ps ON ps."itemId" = li."id" AND ps."companyId" = li."companyId"
LEFT JOIN "unitOfMeasure" uom ON uom.code = li."unitOfMeasureCode" AND uom."companyId" = li."companyId"
LEFT JOIN "itemCost" ic ON ic."itemId" = li.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchaseInvoices" WITH(SECURITY_INVOKER=true) AS
  SELECT
    pi."id",
    pi."invoiceId",
    pi."supplierId",
    pi."invoiceSupplierId",
    pi."supplierInteractionId",
    pi."supplierReference",
    pi."invoiceSupplierContactId",
    pi."invoiceSupplierLocationId",
    pi."locationId",
    pi."postingDate",
    pi."dateIssued",
    pi."dateDue",
    pi."datePaid",
    pi."paymentTermId",
    pi."currencyCode",
    pi."exchangeRate",
    pi."exchangeRateUpdatedAt",
    pi."subtotal",
    pi."totalDiscount",
    pi."totalAmount",
    pi."totalTax",
    pi."balance",
    pi."assignee",
    pi."createdBy",
    pi."createdAt",
    pi."updatedBy",
    pi."updatedAt",
    pi."internalNotes",
    pi."customFields",
    pi."companyId",
    pl."thumbnailPath",
    pl."itemType",
    pl."orderTotal" + COALESCE(pid."supplierShippingCost", 0) * CASE WHEN pi."exchangeRate" = 0 THEN 1 ELSE pi."exchangeRate" END AS "orderTotal",
    CASE
      WHEN pi."dateDue" IS NOT NULL AND pi."dateDue" <> '' AND pi."dateDue"::date < CURRENT_DATE AND pi."datePaid" IS NULL THEN 'Overdue'
      ELSE pi."status"
    END AS status,
    pt."name" AS "paymentTermName"
  FROM "purchaseInvoice" pi
  LEFT JOIN (
    SELECT
      pol."invoiceId",
      MIN(CASE
        WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
        ELSE i."thumbnailPath"
      END) AS "thumbnailPath",
      SUM(COALESCE(pol."quantity", 0)*(COALESCE(pol."unitPrice", 0)) + COALESCE(pol."shippingCost", 0) + COALESCE(pol."taxAmount", 0)) AS "orderTotal",
      MIN(i."type") AS "itemType"
    FROM "purchaseInvoiceLine" pol
    LEFT JOIN "item" i
      ON i."id" = pol."itemId"
    LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    GROUP BY pol."invoiceId"
  ) pl ON pl."invoiceId" = pi."id"
  LEFT JOIN "paymentTerm" pt ON pt."id" = pi."paymentTermId"
  LEFT JOIN "purchaseInvoiceDelivery" pid ON pid."id" = pi."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesOrders" WITH(SECURITY_INVOKER=true) AS
  SELECT
    s.*,
    sl."thumbnailPath",
    sl."itemType",
    sl."orderTotal" + COALESCE(ss."shippingCost", 0) AS "orderTotal",
    sl."jobs",
    sl."lines",
    st."name" AS "shippingTermName",
    sp."paymentTermId",
    ss."shippingMethodId",
    ss."receiptRequestedDate",
    ss."receiptPromisedDate",
    ss."dropShipment",
    ss."shippingCost",
    ss."incoterm",
    ss."incotermLocation",
    (
      SELECT COALESCE(
        jsonb_object_agg(
          eim."integration",
          CASE
            WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
            ELSE to_jsonb(eim."externalId")
          END
        ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
        '{}'::jsonb
      )
      FROM "externalIntegrationMapping" eim
      WHERE eim."entityType" = 'salesOrder' AND eim."entityId" = s.id
    ) AS "externalId"
  FROM "salesOrder" s
  LEFT JOIN (
    SELECT
      sol."salesOrderId",
      MIN(CASE
        WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
        ELSE i."thumbnailPath"
      END) AS "thumbnailPath",
      SUM(
        DISTINCT (1+COALESCE(sol."taxPercent", 0))*(COALESCE(sol."saleQuantity", 0)*(COALESCE(sol."unitPrice", 0)) + COALESCE(sol."shippingCost", 0) + COALESCE(sol."addOnCost", 0)) + COALESCE(sol."nonTaxableAddOnCost", 0)
      ) AS "orderTotal",
      MIN(i."type") AS "itemType",
      ARRAY_AGG(
        CASE
          WHEN j.id IS NOT NULL THEN json_build_object(
            'id', j.id,
            'jobId', j."jobId",
            'status', j."status",
            'dueDate', j."dueDate",
            'productionQuantity', j."productionQuantity",
            'quantityComplete', j."quantityComplete",
            'quantityShipped', j."quantityShipped",
            'quantity', j."quantity",
            'scrapQuantity', j."scrapQuantity",
            'salesOrderLineId', sol.id,
            'assignee', j."assignee"
          )
          ELSE NULL
        END
      ) FILTER (WHERE j.id IS NOT NULL) AS "jobs",
      ARRAY_AGG(
        json_build_object(
          'id', sol.id,
          'methodType', sol."methodType",
          'saleQuantity', sol."saleQuantity"
        )
      ) AS "lines"
    FROM "salesOrderLine" sol
    LEFT JOIN "item" i
      ON i."id" = sol."itemId"
    LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    LEFT JOIN "job" j ON j."salesOrderId" = sol."salesOrderId" AND j."salesOrderLineId" = sol."id"
    GROUP BY sol."salesOrderId"
  ) sl ON sl."salesOrderId" = s."id"
  LEFT JOIN "salesOrderShipment" ss ON ss."id" = s."id"
  LEFT JOIN "shippingTerm" st ON st."id" = ss."shippingTermId"
  LEFT JOIN "salesOrderPayment" sp ON sp."id" = s."id";
--> statement-breakpoint

CREATE OR REPLACE VIEW "suppliers" WITH(SECURITY_INVOKER=true) AS
  SELECT
    s.id,
    s.name,
    s."supplierTypeId",
    s."supplierStatus" as "status",
    stx."taxId",
    s."accountManagerId",
    s.logo,
    s.assignee,
    s."companyId",
    s."createdAt",
    s."createdBy",
    s."updatedAt",
    s."updatedBy",
    s."customFields",
    s."currencyCode",
    stx."vatNumber",
    stx."eori",
    s.website,
    (
      SELECT COALESCE(
        jsonb_object_agg(
          eim."integration",
          CASE
            WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
            ELSE to_jsonb(eim."externalId")
          END
        ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
        '{}'::jsonb
      )
      FROM "externalIntegrationMapping" eim
      WHERE eim."entityType" = 'supplier' AND eim."entityId" = s.id
    ) AS "externalId",
    s.tags,
    s."taxPercent",
    s."purchasingContactId",
    s.embedding,
    s."defaultCc",
    st.name AS "type",
    po.count AS "orderCount",
    p.count AS "partCount",
    pc."workPhone" AS "phone",
    pc.fax AS "fax"
  FROM "supplier" s
  LEFT JOIN "supplierTax" stx ON stx."supplierId" = s.id
  LEFT JOIN "supplierType" st ON st.id = s."supplierTypeId"
  LEFT JOIN (
    SELECT
      "supplierId",
      COUNT(*) AS "count"
    FROM "purchaseOrder"
    GROUP BY "supplierId"
  ) po ON po."supplierId" = s.id
  LEFT JOIN (
    SELECT
      "supplierId",
      COUNT(*) AS "count"
    FROM "supplierPart"
    GROUP BY "supplierId"
  ) p ON p."supplierId" = s.id
  LEFT JOIN (
    SELECT DISTINCT ON (sc."supplierId")
      sc."supplierId" AS id,
      co."workPhone",
      co."fax"
    FROM "supplierContact" sc
    JOIN "contact" co
      ON co.id = sc."contactId"
    ORDER BY sc."supplierId", sc.id
  ) pc
    ON pc.id = s.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "customers" WITH(SECURITY_INVOKER=true) AS
  SELECT
    c.id,
    c.name,
    c."customerTypeId",
    c."customerStatusId",
    ctx."taxId",
    c."accountManagerId",
    c.logo,
    c.assignee,
    c."taxPercent",
    c."tags",
    c.website,
    c."companyId",
    c."createdAt",
    c."createdBy",
    c."updatedAt",
    c."updatedBy",
    c."customFields",
    c."currencyCode",
    c."salesContactId",
    c."defaultCc",
    ctx."vatNumber",
    ctx."eori",
    (
      SELECT COALESCE(
        jsonb_object_agg(
          eim."integration",
          CASE
            WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
            ELSE to_jsonb(eim."externalId")
          END
        ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
        '{}'::jsonb
      )
      FROM "externalIntegrationMapping" eim
      WHERE eim."entityType" = 'customer' AND eim."entityId" = c.id
    ) AS "externalId",
    ct.name AS "type",
    cs.name AS "status",
    so.count AS "orderCount",
    pc."workPhone" AS "phone",
    pc."fax" AS "fax"
  FROM "customer" c
  LEFT JOIN "customerTax" ctx ON ctx."customerId" = c.id
  LEFT JOIN "customerType" ct ON ct.id = c."customerTypeId"
  LEFT JOIN "customerStatus" cs ON cs.id = c."customerStatusId"
  LEFT JOIN (
    SELECT
      "customerId",
      COUNT(*) AS "count"
    FROM "salesOrder"
    GROUP BY "customerId"
  ) so ON so."customerId" = c.id
  LEFT JOIN (
    SELECT DISTINCT ON (cc."customerId")
      cc."customerId",
      co."workPhone",
      co."fax"
    FROM "customerContact" cc
    INNER JOIN "contact" co ON co.id = cc."contactId"
    ORDER BY cc."customerId"
  ) pc ON pc."customerId" = c.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchaseOrderLocations" WITH(SECURITY_INVOKER=true) AS
  SELECT
    po.id,
    s.name AS "supplierName",
    sa."addressLine1" AS "supplierAddressLine1",
    sa."addressLine2" AS "supplierAddressLine2",
    sa."city" AS "supplierCity",
    sa."stateProvince" AS "supplierStateProvince",
    sa."postalCode" AS "supplierPostalCode",
    sa."countryCode" AS "supplierCountryCode",
    sc."name" AS "supplierCountryName",
    stx."taxId" AS "supplierTaxId",
    stx."vatNumber" AS "supplierVatNumber",
    stx."eori" AS "supplierEori",
    scon."fullName" AS "supplierContactName",
    scon."email" AS "supplierContactEmail",
    comp."countryCode" AS "companyCountryCode",
    compc."name" AS "companyCountryName",
    dl.name AS "deliveryName",
    dl."addressLine1" AS "deliveryAddressLine1",
    dl."addressLine2" AS "deliveryAddressLine2",
    dl."city" AS "deliveryCity",
    dl."stateProvince" AS "deliveryStateProvince",
    dl."postalCode" AS "deliveryPostalCode",
    dl."countryCode" AS "deliveryCountryCode",
    dc."name" AS "deliveryCountryName",
    pod."dropShipment",
    c.name AS "customerName",
    ca."addressLine1" AS "customerAddressLine1",
    ca."addressLine2" AS "customerAddressLine2",
    ca."city" AS "customerCity",
    ca."stateProvince" AS "customerStateProvince",
    ca."postalCode" AS "customerPostalCode",
    ca."countryCode" AS "customerCountryCode",
    cc."name" AS "customerCountryName"
  FROM "purchaseOrder" po
  LEFT OUTER JOIN "supplier" s
    ON s.id = po."supplierId"
  LEFT OUTER JOIN "supplierTax" stx
    ON stx."supplierId" = s.id
  LEFT OUTER JOIN "supplierLocation" sl
    ON sl.id = po."supplierLocationId"
  LEFT OUTER JOIN "address" sa
    ON sa.id = sl."addressId"
  LEFT OUTER JOIN "country" sc
    ON sc.alpha2 = sa."countryCode"
  LEFT OUTER JOIN "supplierContact" sct
    ON sct.id = po."supplierContactId"
  LEFT OUTER JOIN "contact" scon
    ON scon.id = sct."contactId"
  LEFT OUTER JOIN "company" comp
    ON comp.id = po."companyId"
  LEFT OUTER JOIN "country" compc
    ON compc.alpha2 = comp."countryCode"
  INNER JOIN "purchaseOrderDelivery" pod
    ON pod.id = po.id
  LEFT OUTER JOIN "location" dl
    ON dl.id = pod."locationId"
  LEFT OUTER JOIN "country" dc
    ON dc.alpha2 = dl."countryCode"
  LEFT OUTER JOIN "customer" c
    ON c.id = pod."customerId"
  LEFT OUTER JOIN "customerLocation" cl
    ON cl.id = pod."customerLocationId"
  LEFT OUTER JOIN "address" ca
    ON ca.id = cl."addressId"
  LEFT OUTER JOIN "country" cc
    ON cc.alpha2 = ca."countryCode";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesOrderLocations" WITH(SECURITY_INVOKER=true) AS
  SELECT
    so.id,
    c.name AS "customerName",
    ca."addressLine1" AS "customerAddressLine1",
    ca."addressLine2" AS "customerAddressLine2",
    ca."city" AS "customerCity",
    ca."stateProvince" AS "customerStateProvince",
    ca."postalCode" AS "customerPostalCode",
    ca."countryCode" AS "customerCountryCode",
    cc."name" AS "customerCountryName",
    ctx."taxId" AS "customerTaxId",
    ctx."vatNumber" AS "customerVatNumber",
    ctx."eori" AS "customerEori",
    pc.name AS "paymentCustomerName",
    pa."addressLine1" AS "paymentAddressLine1",
    pa."addressLine2" AS "paymentAddressLine2",
    pa."city" AS "paymentCity",
    pa."stateProvince" AS "paymentStateProvince",
    pa."postalCode" AS "paymentPostalCode",
    pa."countryCode" AS "paymentCountryCode",
    pn."name" AS "paymentCountryName"
  FROM "salesOrder" so
  INNER JOIN "customer" c
    ON c.id = so."customerId"
  LEFT OUTER JOIN "customerTax" ctx
    ON ctx."customerId" = c.id
  LEFT OUTER JOIN "customerLocation" cl
    ON cl.id = so."customerLocationId"
  LEFT OUTER JOIN "address" ca
    ON ca.id = cl."addressId"
  LEFT OUTER JOIN "country" cc
    ON cc.alpha2 = ca."countryCode"
  LEFT OUTER JOIN "salesOrderPayment" sop
    ON sop.id = so.id
  LEFT OUTER JOIN "customer" pc
    ON pc.id = sop."invoiceCustomerId"
  LEFT OUTER JOIN "customerLocation" pl
    ON pl.id = sop."invoiceCustomerLocationId"
  LEFT OUTER JOIN "address" pa
    ON pa.id = pl."addressId"
  LEFT OUTER JOIN "country" pn
    ON pn.alpha2 = pa."countryCode";
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesInvoiceLocations" WITH(SECURITY_INVOKER=true) AS
  SELECT
    si.id,
    c.name AS "customerName",
    ca."addressLine1" AS "customerAddressLine1",
    ca."addressLine2" AS "customerAddressLine2",
    ca."city" AS "customerCity",
    ca."stateProvince" AS "customerStateProvince",
    ca."postalCode" AS "customerPostalCode",
    ca."countryCode" AS "customerCountryCode",
    cc."name" AS "customerCountryName",
    ctx."taxId" AS "customerTaxId",
    ctx."vatNumber" AS "customerVatNumber",
    ctx."eori" AS "customerEori",
    ic.name AS "invoiceCustomerName",
    ica."addressLine1" AS "invoiceAddressLine1",
    ica."addressLine2" AS "invoiceAddressLine2",
    ica."city" AS "invoiceCity",
    ica."stateProvince" AS "invoiceStateProvince",
    ica."postalCode" AS "invoicePostalCode",
    ica."countryCode" AS "invoiceCountryCode",
    icc."name" AS "invoiceCountryName",
    sc.name AS "shipmentCustomerName",
    sa."addressLine1" AS "shipmentAddressLine1",
    sa."addressLine2" AS "shipmentAddressLine2",
    sa."city" AS "shipmentCity",
    sa."stateProvince" AS "shipmentStateProvince",
    sa."postalCode" AS "shipmentPostalCode",
    sa."countryCode" AS "shipmentCountryCode",
    scc."name" AS "shipmentCountryName"
  FROM "salesInvoice" si
  INNER JOIN "customer" c
    ON c.id = si."customerId"
  LEFT OUTER JOIN "customerTax" ctx
    ON ctx."customerId" = c.id
  LEFT OUTER JOIN "customerLocation" cl
    ON cl.id = si."locationId"
  LEFT OUTER JOIN "address" ca
    ON ca.id = cl."addressId"
  LEFT OUTER JOIN "country" cc
    ON cc.alpha2 = ca."countryCode"
  LEFT OUTER JOIN "customer" ic
    ON ic.id = si."invoiceCustomerId"
  LEFT OUTER JOIN "customerLocation" icl
    ON icl.id = si."invoiceCustomerLocationId"
  LEFT OUTER JOIN "address" ica
    ON ica.id = icl."addressId"
  LEFT OUTER JOIN "country" icc
    ON icc.alpha2 = ica."countryCode"
  LEFT OUTER JOIN "salesInvoiceShipment" sis
    ON sis.id = si.id
  LEFT OUTER JOIN "customerLocation" scl
    ON scl.id = sis."locationId"
  LEFT OUTER JOIN "address" sa
    ON sa.id = scl."addressId"
  LEFT OUTER JOIN "country" scc
    ON scc.alpha2 = sa."countryCode"
  LEFT OUTER JOIN "customer" sc
    ON sc.id = scl."customerId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "quoteCustomerDetails" WITH(SECURITY_INVOKER=true) AS
SELECT
  q.id as "quoteId",
  c.name as "customerName",
  contact."fullName" as "contactName",
  contact."email" as "contactEmail",
  ca."addressLine1" AS "customerAddressLine1",
  ca."addressLine2" AS "customerAddressLine2",
  ca."city" AS "customerCity",
  ca."stateProvince" AS "customerStateProvince",
  ca."postalCode" AS "customerPostalCode",
  ca."countryCode" AS "customerCountryCode",
  country."name" AS "customerCountryName",
  ctx."taxId" AS "customerTaxId",
  ctx."vatNumber" AS "customerVatNumber",
  ctx."eori" AS "customerEori"
FROM "quote" q
INNER JOIN "customer" c ON c."id" = q."customerId"
LEFT JOIN "customerTax" ctx ON ctx."customerId" = c.id
LEFT JOIN "customerContact" cc ON cc."id" = q."customerContactId"
LEFT JOIN "contact" contact ON contact.id = cc."contactId"
LEFT JOIN "customerLocation" cl ON cl."id" = q."customerLocationId"
LEFT JOIN "address" ca ON ca."id" = cl."addressId"
LEFT OUTER JOIN "country" country ON country.alpha2 = ca."countryCode";
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchaseOrders" WITH(SECURITY_INVOKER=true) AS
  SELECT
    p.*,
    pl."thumbnailPath",
    pl."itemType",
    pl."orderTotal" + pd."supplierShippingCost" * p."exchangeRate" AS "orderTotal",
    pd."shippingMethodId",
    pd."shippingTermId",
    pd."receiptRequestedDate",
    pd."receiptPromisedDate",
    pd."deliveryDate",
    pd."dropShipment",
    pp."paymentTermId",
    pd."locationId",
    pd."supplierShippingCost",
    pd."incoterm",
    pd."incotermLocation",
    u."fullName" AS "createdByFullName",
    u."email" AS "createdByEmail",
    u."phone" AS "createdByPhone"
  FROM "purchaseOrder" p
  LEFT JOIN (
    SELECT
      pol."purchaseOrderId",
      MIN(CASE
        WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
        ELSE i."thumbnailPath"
      END) AS "thumbnailPath",
      SUM(COALESCE(pol."purchaseQuantity", 0)*(COALESCE(pol."unitPrice", 0)) + COALESCE(pol."shippingCost", 0) + COALESCE(pol."taxAmount", 0)) AS "orderTotal",
      MIN(i."type") AS "itemType"
    FROM "purchaseOrderLine" pol
    LEFT JOIN "item" i
      ON i."id" = pol."itemId"
    LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    GROUP BY pol."purchaseOrderId"
  ) pl ON pl."purchaseOrderId" = p."id"
  LEFT JOIN "purchaseOrderDelivery" pd ON pd."id" = p."id"
  LEFT JOIN "shippingTerm" st ON st."id" = pd."shippingTermId"
  LEFT JOIN "purchaseOrderPayment" pp ON pp."id" = p."id"
  LEFT JOIN "user" u ON u."id" = p."createdBy";
--> statement-breakpoint

CREATE OR REPLACE VIEW "customFieldTables" WITH(SECURITY_INVOKER=true) AS
SELECT
  cft.*,
  c.id AS "companyId",
  COALESCE(cf.fields, '[]') as fields
FROM "customFieldTable" cft
  CROSS JOIN "company" c
  LEFT JOIN (
    SELECT
      cf."table",
      cf."companyId",
      COALESCE(json_agg(
        json_build_object(
          'id', id,
          'name', name,
          'sortOrder', "sortOrder",
          'dataTypeId', "dataTypeId",
          'listOptions', "listOptions",
          'active', active,
          'tags', tags,
          'required', required
        )
      ), '[]') AS fields
    FROM "customField" cf
    GROUP BY cf."table", cf."companyId"
  ) cf
    ON cf.table = cft.table AND cf."companyId" = c.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW "companies" WITH(SECURITY_INVOKER=true) AS
  SELECT DISTINCT
    c.*,
    uc.*,
    et.name AS "employeeType",
    cg.name AS "companyGroupName",
    cg."ownerId"
  FROM "userToCompany" uc
  INNER JOIN "company" c
    ON c.id = uc."companyId"
  LEFT JOIN "employee" e
    ON e.id = uc."userId" AND e."companyId" = uc."companyId"
  LEFT JOIN "employeeType" et
    ON et.id = e."employeeTypeId"
  LEFT JOIN "companyGroup" cg
    ON cg.id = c."companyGroupId";
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchaseOrderLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT DISTINCT ON (pl.id)
    pl.*,
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    i.name as "itemName",
    i."readableIdWithRevision" as "itemReadableId",
    i.description as "itemDescription",
    COALESCE(mu.id, imu.id) as "modelId",
    COALESCE(mu."autodeskUrn", imu."autodeskUrn") as "autodeskUrn",
    COALESCE(mu."modelPath", imu."modelPath") as "modelPath",
    COALESCE(mu."name", imu."name") as "modelName",
    COALESCE(mu."size", imu."size") as "modelSize",
    ic."unitCost" as "unitCost",
    sp."supplierPartId",
    jo."description" as "jobOperationDescription",
    a."name" as "accountName"
  FROM "purchaseOrderLine" pl
  INNER JOIN "purchaseOrder" so ON so.id = pl."purchaseOrderId"
  LEFT JOIN "modelUpload" mu ON pl."modelUploadId" = mu."id"
  LEFT JOIN "item" i ON i.id = pl."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
  LEFT JOIN "supplierPart" sp ON sp."supplierId" = so."supplierId" AND sp."itemId" = i.id
  LEFT JOIN "jobOperation" jo ON jo."id" = pl."jobOperationId"
  LEFT JOIN "account" a ON a.id = pl."accountId"
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesOrderLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    sl.*,
    i."readableIdWithRevision" as "itemReadableId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    COALESCE(mu.id, imu.id) as "modelId",
    COALESCE(mu."autodeskUrn", imu."autodeskUrn") as "autodeskUrn",
    COALESCE(mu."modelPath", imu."modelPath") as "modelPath",
    COALESCE(mu."name", imu."name") as "modelName",
    COALESCE(mu."size", imu."size") as "modelSize",
    ic."unitCost" as "unitCost",
    cp."customerPartId",
    cp."customerPartRevision",
    so."orderDate",
    so."customerId",
    so."salesOrderId" as "salesOrderReadableId"
  FROM "salesOrderLine" sl
  INNER JOIN "salesOrder" so ON so.id = sl."salesOrderId"
  LEFT JOIN "modelUpload" mu ON sl."modelUploadId" = mu."id"
  INNER JOIN "item" i ON i.id = sl."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
  LEFT JOIN "customerPartToItem" cp ON cp."customerId" = so."customerId" AND cp."itemId" = i.id
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "quoteLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    ql.*,
    i."readableIdWithRevision" as "itemReadableId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    COALESCE(mu.id, imu.id) as "modelId",
    COALESCE(mu."autodeskUrn", imu."autodeskUrn") as "autodeskUrn",
    COALESCE(mu."modelPath", imu."modelPath") as "modelPath",
    COALESCE(mu."name", imu."name") as "modelName",
    COALESCE(mu."size", imu."size") as "modelSize",
    ic."unitCost" as "unitCost"
  FROM "quoteLine" ql
  LEFT JOIN "modelUpload" mu ON ql."modelUploadId" = mu."id"
  INNER JOIN "item" i ON i.id = ql."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "supplierQuoteLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    ql.*,
    i."readableIdWithRevision" as "itemReadableId",
    i."type" as "itemType",
    COALESCE(i."thumbnailPath", mu."thumbnailPath") as "thumbnailPath",
    ic."unitCost" as "unitCost",
    a."name" as "accountName"
  FROM "supplierQuoteLine" ql
  LEFT JOIN "item" i ON i.id = ql."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  LEFT JOIN "account" a ON a.id = ql."accountId"
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "purchaseInvoiceLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    pl.*,
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    i."readableIdWithRevision" as "itemReadableId",
    i.name as "itemName",
    i.description as "itemDescription",
    ic."unitCost" as "unitCost",
    sp."supplierPartId",
    a."name" as "accountName"
  FROM "purchaseInvoiceLine" pl
  INNER JOIN "purchaseInvoice" pi ON pi.id = pl."invoiceId"
  LEFT JOIN "modelUpload" mu ON pl."modelUploadId" = mu."id"
  LEFT JOIN "item" i ON i.id = pl."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
  LEFT JOIN "supplierPart" sp ON sp."supplierId" = pi."supplierId" AND sp."itemId" = i.id
  LEFT JOIN "account" a ON a.id = pl."accountId"
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "salesInvoiceLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    sl.*,
    i."readableIdWithRevision" as "itemReadableId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
      ELSE i."thumbnailPath"
    END as "thumbnailPath",
    i.name as "itemName",
    i.description as "itemDescription",
    ic."unitCost" as "unitCost",
    (SELECT cp."customerPartId"
     FROM "customerPartToItem" cp
     WHERE cp."customerId" = si."customerId" AND cp."itemId" = i.id
     LIMIT 1) as "customerPartId"
  FROM "salesInvoiceLine" sl
  INNER JOIN "salesInvoice" si ON si.id = sl."invoiceId"
  LEFT JOIN "modelUpload" mu ON sl."modelUploadId" = mu."id"
  INNER JOIN "item" i ON i.id = sl."itemId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
);
--> statement-breakpoint

CREATE OR REPLACE VIEW "processes" WITH(SECURITY_INVOKER=true) AS
  SELECT
    p.*,
    wcp."workCenters",
    sp."suppliers"
  FROM "process" p
  LEFT JOIN (
    SELECT
      "processId",
      array_agg("workCenterId"::text) as "workCenters"
    FROM "workCenterProcess" wcp
    INNER JOIN "workCenter" wc ON wcp."workCenterId" = wc.id
    GROUP BY "processId"
  ) wcp ON p.id = wcp."processId"
  LEFT JOIN (
    SELECT
      "processId",
      jsonb_agg(jsonb_build_object('id', sp."id", 'name', s.name)) as "suppliers"
    FROM "supplierProcess" sp
    INNER JOIN "supplier" s ON sp."supplierId" = s.id
    GROUP BY "processId"
  ) sp ON p.id = sp."processId";
--> statement-breakpoint

DROP MATERIALIZED VIEW IF EXISTS "itemStockQuantities";

CREATE MATERIALIZED VIEW "itemStockQuantities" AS
SELECT
  "itemId",
  "companyId",
  COALESCE("locationId", '') AS "locationId",
  SUM("quantity") FILTER (
    WHERE "trackedEntityStatus" IS NULL
       OR "trackedEntityStatus" != to_jsonb('Rejected'::text)
  ) AS "quantityOnHand"
FROM "itemLedger"
GROUP BY "itemId", "companyId", COALESCE("locationId", '');

CREATE UNIQUE INDEX "itemStockQuantities_itemId_companyId_locationId_idx"
  ON "itemStockQuantities" ("itemId", "companyId", "locationId");

CREATE INDEX "itemStockQuantities_companyId_idx"
  ON "itemStockQuantities" ("companyId");
--> statement-breakpoint

GRANT SELECT ON ALL TABLES IN SCHEMA public TO carbon_app, carbon_service;
--> statement-breakpoint

DROP FUNCTION IF EXISTS get_method_tree(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_method_tree(uid text, company_id text)
RETURNS TABLE (
  "methodMaterialId" text,
  "makeMethodId" text,
  "materialMakeMethodId" text,
  "itemId" text,
  "itemReadableId" text,
  "itemType" text,
  "description" text,
  "unitOfMeasureCode" text,
  "unitCost" numeric,
  "quantity" numeric,
  "methodType" "methodType",
  "itemTrackingType" text,
  "parentMaterialId" text,
  "order" double precision,
  "operationId" text,
  "isRoot" boolean,
  "kit" boolean,
  "revision" text,
  "externalId" jsonb,
  "version" numeric(10, 2),
  "storageUnitIds" jsonb,
  "isPickDescendant" boolean,
  "replenishmentSystem" "itemReplenishmentSystem"
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
WITH RECURSIVE material AS (
  SELECT
    "id",
    "makeMethodId",
    "methodType",
    COALESCE(
      "materialMakeMethodId",
      CASE WHEN "methodType" = 'Pull from Inventory' THEN (
        SELECT amm.id
        FROM "activeMakeMethods" amm
        WHERE amm."itemId" = "methodMaterial"."itemId"
          AND amm."companyId" = company_id
        LIMIT 1
      ) END
    ) AS "materialMakeMethodId",
    "itemId",
    "itemType",
    "quantity",
    "makeMethodId" AS "parentMaterialId",
    NULL AS "operationId",
    COALESCE("order", 1) AS "order",
    "kit",
    "storageUnitIds",
    false AS "isPickDescendant"
  FROM "methodMaterial"
  WHERE "makeMethodId" = uid
    AND "companyId" = company_id
  UNION
  SELECT
    child."id",
    child."makeMethodId",
    child."methodType",
    COALESCE(
      child."materialMakeMethodId",
      CASE WHEN child."methodType" = 'Pull from Inventory' THEN (
        SELECT amm.id
        FROM "activeMakeMethods" amm
        WHERE amm."itemId" = child."itemId"
          AND amm."companyId" = company_id
        LIMIT 1
      ) END
    ) AS "materialMakeMethodId",
    child."itemId",
    child."itemType",
    child."quantity",
    parent."id" AS "parentMaterialId",
    child."methodOperationId" AS "operationId",
    child."order",
    child."kit",
    child."storageUnitIds",
    (parent."methodType" = 'Pull from Inventory' OR parent."isPickDescendant") AS "isPickDescendant"
  FROM "methodMaterial" child
  JOIN material parent ON parent."materialMakeMethodId" = child."makeMethodId"
  WHERE child."companyId" = company_id
)
SELECT
  material.id AS "methodMaterialId",
  material."makeMethodId",
  material."materialMakeMethodId",
  material."itemId",
  item."readableIdWithRevision" AS "itemReadableId",
  material."itemType",
  item."name" AS "description",
  item."unitOfMeasureCode",
  cost."unitCost",
  material."quantity",
  material."methodType",
  item."itemTrackingType",
  material."parentMaterialId",
  material."order",
  material."operationId",
  false AS "isRoot",
  material."kit",
  item."revision",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item'
      AND eim."entityId" = item.id
      AND eim."companyId" = company_id
  ) AS "externalId",
  mm2."version",
  material."storageUnitIds",
  material."isPickDescendant",
  item."replenishmentSystem"
FROM material
JOIN item ON material."itemId" = item.id AND item."companyId" = company_id
JOIN "itemCost" cost ON item.id = cost."itemId" AND cost."companyId" = company_id
JOIN "makeMethod" mm ON material."makeMethodId" = mm.id AND mm."companyId" = company_id
LEFT JOIN "makeMethod" mm2 ON material."materialMakeMethodId" = mm2.id AND mm2."companyId" = company_id
UNION
SELECT
  mm."id" AS "methodMaterialId",
  NULL AS "makeMethodId",
  mm.id AS "materialMakeMethodId",
  mm."itemId",
  item."readableIdWithRevision" AS "itemReadableId",
  item."type"::text,
  item."name" AS "description",
  item."unitOfMeasureCode",
  cost."unitCost",
  1 AS "quantity",
  'Make to Order'::"methodType" AS "methodType",
  item."itemTrackingType",
  NULL AS "parentMaterialId",
  CAST(1 AS double precision) AS "order",
  NULL AS "operationId",
  true AS "isRoot",
  false AS "kit",
  item."revision",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item'
      AND eim."entityId" = item.id
      AND eim."companyId" = company_id
  ) AS "externalId",
  mm."version",
  '{}'::jsonb AS "storageUnitIds",
  false AS "isPickDescendant",
  item."replenishmentSystem"
FROM "makeMethod" mm
JOIN item ON mm."itemId" = item.id AND item."companyId" = company_id
JOIN "itemCost" cost ON item.id = cost."itemId" AND cost."companyId" = company_id
WHERE mm.id = uid
  AND mm."companyId" = company_id
ORDER BY "order"
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_job_method(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_job_method(jid text, company_id text)
RETURNS TABLE (
  "jobId" text,
  "methodMaterialId" text,
  "jobMakeMethodId" text,
  "jobMaterialMakeMethodId" text,
  "itemId" text,
  "itemReadableId" text,
  "description" text,
  "itemType" text,
  "quantity" numeric,
  "unitCost" numeric,
  "methodType" "methodType",
  "parentMaterialId" text,
  "order" double precision,
  "isRoot" boolean,
  "kit" boolean,
  "revision" text,
  "version" numeric(10, 2),
  "storageUnitId" text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
WITH RECURSIVE material AS (
  SELECT
    "jobId",
    "id",
    "id" AS "jobMakeMethodId",
    'Make to Order'::"methodType" AS "methodType",
    "id" AS "jobMaterialMakeMethodId",
    "itemId",
    'Part' AS "itemType",
    1::numeric AS "quantity",
    0::numeric AS "unitCost",
    "parentMaterialId",
    CAST(1 AS double precision) AS "order",
    true AS "isRoot",
    false AS "kit",
    "version",
    NULL::text AS "storageUnitId"
  FROM "jobMakeMethod"
  WHERE "jobId" = jid
    AND "parentMaterialId" IS NULL
    AND "companyId" = company_id
  UNION
  SELECT
    child."jobId",
    child."id",
    child."jobMakeMethodId",
    child."methodType",
    child."jobMaterialMakeMethodId",
    child."itemId",
    child."itemType",
    child."quantity",
    child."unitCost",
    parent."id" AS "parentMaterialId",
    child."order",
    false AS "isRoot",
    child."kit",
    child."version",
    child."storageUnitId"
  FROM "jobMaterialWithMakeMethodId" child
  JOIN material parent ON parent."jobMaterialMakeMethodId" = child."jobMakeMethodId"
  WHERE parent."methodType" = 'Make to Order'
    AND child."companyId" = company_id
)
SELECT
  material."jobId",
  material.id AS "methodMaterialId",
  material."jobMakeMethodId",
  material."jobMaterialMakeMethodId",
  material."itemId",
  item."readableIdWithRevision" AS "itemReadableId",
  item."name" AS "description",
  material."itemType",
  material."quantity",
  material."unitCost",
  material."methodType",
  material."parentMaterialId",
  material."order",
  material."isRoot",
  material."kit",
  item."revision",
  material."version",
  material."storageUnitId"
FROM material
JOIN item ON material."itemId" = item.id AND item."companyId" = company_id
WHERE material."jobId" = jid
ORDER BY "order"
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_quote_methods_by_method_id(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_quote_methods_by_method_id(mid text, company_id text)
RETURNS TABLE (
  "quoteId" text,
  "quoteLineId" text,
  "methodMaterialId" text,
  "quoteMakeMethodId" text,
  "quoteMaterialMakeMethodId" text,
  "itemId" text,
  "itemReadableId" text,
  "description" text,
  "unitOfMeasureCode" text,
  "itemType" text,
  "itemTrackingType" text,
  "quantity" numeric,
  "unitCost" numeric,
  "methodType" "methodType",
  "parentMaterialId" text,
  "order" double precision,
  "isRoot" boolean,
  "kit" boolean,
  "revision" text,
  "externalId" jsonb,
  "version" numeric(10, 2),
  "storageUnitId" text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
WITH RECURSIVE material AS (
  SELECT
    "quoteId",
    "quoteLineId",
    "id",
    "id" AS "quoteMakeMethodId",
    'Make to Order'::"methodType" AS "methodType",
    "id" AS "quoteMaterialMakeMethodId",
    "version",
    "itemId",
    'Part' AS "itemType",
    1::numeric AS "quantity",
    0::numeric AS "unitCost",
    "parentMaterialId",
    CAST(1 AS double precision) AS "order",
    true AS "isRoot",
    false AS "kit",
    NULL::text AS "storageUnitId"
  FROM "quoteMakeMethod"
  WHERE "id" = mid
    AND "companyId" = company_id
  UNION
  SELECT
    child."quoteId",
    child."quoteLineId",
    child."id",
    child."quoteMakeMethodId",
    child."methodType",
    child."quoteMaterialMakeMethodId",
    child."version",
    child."itemId",
    child."itemType",
    child."quantity",
    child."unitCost",
    parent."id" AS "parentMaterialId",
    child."order",
    false AS "isRoot",
    child."kit",
    child."storageUnitId"
  FROM "quoteMaterialWithMakeMethodId" child
  JOIN material parent ON parent."quoteMaterialMakeMethodId" = child."quoteMakeMethodId"
  WHERE parent."methodType" = 'Make to Order'
    AND child."companyId" = company_id
)
SELECT
  material."quoteId",
  material."quoteLineId",
  material.id AS "methodMaterialId",
  material."quoteMakeMethodId",
  material."quoteMaterialMakeMethodId",
  material."itemId",
  item."readableIdWithRevision" AS "itemReadableId",
  item."name" AS "description",
  item."unitOfMeasureCode",
  material."itemType",
  item."itemTrackingType",
  material."quantity",
  material."unitCost",
  material."methodType",
  material."parentMaterialId",
  material."order",
  material."isRoot",
  material."kit",
  item."revision",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item'
      AND eim."entityId" = item.id
      AND eim."companyId" = company_id
  ) AS "externalId",
  material."version",
  material."storageUnitId"
FROM material
JOIN item ON material."itemId" = item.id AND item."companyId" = company_id
ORDER BY "order"
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_quote_methods(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_quote_methods(qid text, company_id text)
RETURNS TABLE (
  "quoteId" text,
  "quoteLineId" text,
  "methodMaterialId" text,
  "quoteMakeMethodId" text,
  "quoteMaterialMakeMethodId" text,
  "itemId" text,
  "itemReadableId" text,
  "description" text,
  "itemType" text,
  "quantity" numeric,
  "unitCost" numeric,
  "methodType" "methodType",
  "parentMaterialId" text,
  "order" double precision,
  "isRoot" boolean,
  "kit" boolean,
  "revision" text,
  "externalId" jsonb,
  "version" numeric(10, 2),
  "storageUnitId" text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
WITH RECURSIVE material AS (
  SELECT
    "quoteId",
    "quoteLineId",
    "id",
    "id" AS "quoteMakeMethodId",
    'Make to Order'::"methodType" AS "methodType",
    "id" AS "quoteMaterialMakeMethodId",
    "itemId",
    'Part' AS "itemType",
    1::numeric AS "quantity",
    0::numeric AS "unitCost",
    "parentMaterialId",
    CAST(1 AS double precision) AS "order",
    true AS "isRoot",
    false AS "kit",
    "version",
    NULL::text AS "storageUnitId"
  FROM "quoteMakeMethod"
  WHERE "quoteId" = qid
    AND "parentMaterialId" IS NULL
    AND "companyId" = company_id
  UNION
  SELECT
    child."quoteId",
    child."quoteLineId",
    child."id",
    child."quoteMakeMethodId",
    child."methodType",
    child."quoteMaterialMakeMethodId",
    child."itemId",
    child."itemType",
    child."quantity",
    child."unitCost",
    parent."id" AS "parentMaterialId",
    child."order",
    false AS "isRoot",
    child."kit",
    child."version",
    child."storageUnitId"
  FROM "quoteMaterialWithMakeMethodId" child
  JOIN material parent ON parent."quoteMaterialMakeMethodId" = child."quoteMakeMethodId"
  WHERE child."companyId" = company_id
)
SELECT
  material."quoteId",
  material."quoteLineId",
  material.id AS "methodMaterialId",
  material."quoteMakeMethodId",
  material."quoteMaterialMakeMethodId",
  material."itemId",
  item."readableIdWithRevision" AS "itemReadableId",
  item."name" AS "description",
  material."itemType",
  material."quantity",
  material."unitCost",
  material."methodType",
  material."parentMaterialId",
  material."order",
  material."isRoot",
  material."kit",
  item."revision",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item'
      AND eim."entityId" = item.id
      AND eim."companyId" = company_id
  ) AS "externalId",
  material."version",
  material."storageUnitId"
FROM material
JOIN item ON material."itemId" = item.id AND item."companyId" = company_id
WHERE material."quoteId" = qid
ORDER BY "order"
$$;
