import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const manifestPath = resolve(scriptDir, "rls-semantic-review.json");
const actions = new Set(["view", "create", "update", "delete"]);
const listDynamic = process.argv.includes("--list-dynamic");
const importPermissionModules = parseImportPermissionModules();
const ignoredPathParts = [
  "node_modules/",
  "packages/database/supa" + "base/",
  "packages/database/src/schema/index.ts",
];
const failures = [];

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifestTuples = collectManifestTuples(manifest);
const files = sourceFiles();
const serverGates = new Map();
const uiGates = new Map();
const dynamicRequirePermissions = [];

for (const file of files) {
  const source = readFileSync(resolve(repoRoot, file), "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") || file.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  );

  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }

    if (isRequirePermissionsCall(node)) {
      const permissionArg = node.arguments[1];
      if (!permissionArg) {
        return;
      }

      const tuples = collectPermissionObjectTuples(permissionArg);
      if (tuples === null) {
        dynamicRequirePermissions.push(locationFor(sourceFile, node));
        return;
      }
      for (const tuple of tuples) {
        addGate(serverGates, tuple, locationFor(sourceFile, node));
      }
      return;
    }

    if (isPermissionsCanCall(node)) {
      const action = stringLiteralText(node.arguments[0]);
      const module = stringLiteralText(node.arguments[1]);
      if (action && module && actions.has(action)) {
        addGate(uiGates, `${action}:${module}`, locationFor(sourceFile, node));
      }
    }
  });
}

for (const tuple of manifestTuples) {
  if (!serverGates.has(tuple)) {
    failures.push(
      `RLS semantic manifest permission "${tuple}" has no server requirePermissions gate.`
    );
  }
}

if (!hasAuthServerContract()) {
  failures.push(
    "Could not verify requirePermissions handles Better Auth claims, API-key scopes, and customer/supplier account scope."
  );
}

failures.push(...externalAccountRouteScopeFailures());
failures.push(...serviceClientRbacBoundaryFailures());
failures.push(...serviceClientProtectedRouteFailures());
failures.push(...bypassRlsRequestGateFailures());
failures.push(...publicServiceClientRouteBoundaryFailures());
failures.push(...oauthTokenRouteServiceClientScopeFailures());
failures.push(...publicShareServiceClientScopeFailures());
failures.push(...publicDigitalQuoteServiceClientScopeFailures());
failures.push(...publicCustomerPortalServiceClientScopeFailures());
failures.push(...postAuthorizedServiceClientScopeFailures());
failures.push(...requestScopedRpcRouteFailures());
failures.push(...apiRouteDirectQuerySelectorFailures());
failures.push(...radanIntegrationRpcScopeFailures());
failures.push(...trainingAssignmentRpcScopeFailures());
failures.push(...aiToolPermissionFailures());
failures.push(...integrationWebhookAuthFailures());
failures.push(...accountingBackfillServiceClientScopeFailures());
failures.push(...stripeBillingServiceClientScopeFailures());
failures.push(...publicModelFileAccessFailures());
failures.push(...filePdfRequestScopeFailures());
failures.push(...qualityIssueRouteRequestScopeFailures());
failures.push(...inventoryTransferRouteRequestScopeFailures());
failures.push(...inventoryItemRuleRouteRequestScopeFailures());
failures.push(...inventoryDocumentCreateRouteFailures());
failures.push(...inventoryLineMutationRouteFailures());
failures.push(...receiptTrackingRpcScopeFailures());
failures.push(...purchasedPriceRpcScopeFailures());
failures.push(...inventoryInvoicingRouteRequestScopeFailures());
failures.push(...purchasingRouteRequestScopeFailures());
failures.push(...qualityDocumentRouteRequestScopeFailures());
failures.push(...itemMethodRouteRequestScopeFailures());
failures.push(...peopleAttributeRouteRequestScopeFailures());
failures.push(...accountingDimensionCurrencyRouteFailures());
failures.push(...salesOrderRouteRequestScopeFailures());
failures.push(...salesRfqRouteRequestScopeFailures());
failures.push(...purchasingRfqRouteRequestScopeFailures());
failures.push(...supplierQuoteRouteRequestScopeFailures());
failures.push(...quoteCoreRouteRequestScopeFailures());
failures.push(...quoteMethodRouteRequestScopeFailures());
failures.push(...jobMethodRouteRequestScopeFailures());
failures.push(...resourceSubmissionRouteRequestScopeFailures());
failures.push(...maintenanceIssueRouteRequestScopeFailures());
failures.push(...maintenanceDispatchJobScopeFailures());
failures.push(...notificationJobServiceClientScopeFailures());
failures.push(...sendEmailJobServiceClientScopeFailures());
failures.push(...auditEventWorkerScopeFailures());
failures.push(...scheduledCleanupJobScopeFailures());
failures.push(...scheduledAuditArchiveJobScopeFailures());
failures.push(...scheduledMrpJobScopeFailures());
failures.push(...timecardAutoCloseJobScopeFailures());
failures.push(...weeklyCloudCleanupJobScopeFailures());
failures.push(...weeklyTrainingReminderJobScopeFailures());
failures.push(...scheduledExchangeRateJobScopeFailures());
failures.push(...onboardJobServiceClientScopeFailures());
failures.push(...postTransactionJobScopeFailures());
failures.push(...paperlessPartsJobServiceClientScopeFailures());
failures.push(...searchIndexJobServiceClientScopeFailures());
failures.push(...approvalRuleRouteRequestScopeFailures());
failures.push(...sharedImportRouteRequestScopeFailures());
failures.push(...auditLogRouteRequestScopeFailures());
failures.push(...jobCoreRouteRequestScopeFailures());
failures.push(...maintenanceLocationRpcScopeFailures());
failures.push(...productionScheduleRpcScopeFailures());
failures.push(...productionStepRecordRpcScopeFailures());
failures.push(...itemDetailRpcScopeFailures());
failures.push(...relatedRecordLookupRpcScopeFailures());
failures.push(...methodTreeRpcScopeFailures());
failures.push(...inventoryQuantityRpcScopeFailures());
failures.push(...planningRpcScopeFailures());
failures.push(...accountingReportingRpcScopeFailures());
failures.push(...intercompanyRpcScopeFailures());
failures.push(...mcpCompanyGroupContextFailures());
failures.push(...storageUnitRequirementRpcScopeFailures());
failures.push(...userAdminRouteRequestScopeFailures());
failures.push(...onboardingRouteRequestScopeFailures());
failures.push(...companySettingsRouteRequestScopeFailures());
failures.push(...mesSubmissionRouteRequestScopeFailures());
failures.push(...mesJobOperationRouteRequestScopeFailures());
failures.push(...mesMaintenanceInventoryActionRouteRequestScopeFailures());
failures.push(...mesProductionCompanyScopeFailures());

if (failures.length > 0) {
  console.error("RLS app-gate audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (dynamicRequirePermissions.length > 0) {
    console.error(
      `- dynamic requirePermissions calls skipped: ${dynamicRequirePermissions.length}`
    );
  }
  process.exit(1);
}

console.log("RLS app-gate audit passed");
console.log(`- source files scanned: ${files.length}`);
console.log(`- manifest permission tuples checked: ${manifestTuples.length}`);
console.log(`- server permission tuples found: ${serverGates.size}`);
console.log(`- UI permission tuples found: ${uiGates.size}`);
console.log(
  `- dynamic requirePermissions calls skipped: ${dynamicRequirePermissions.length}`
);
console.log("- protected-route service client usage checked");
console.log("- service-client Better Auth/RBAC boundary checked");
console.log("- request-scoped bypassRls permission/org usage checked");
console.log("- public-route service client boundary checked");
console.log("- OAuth token route service-client scope checked");
console.log("- public share service-client tenant scope checked");
console.log("- public digital-quote service-client tenant scope checked");
console.log("- public customer portal service-client tenant scope checked");
console.log("- post-authorization service-client tenant scope checked");
console.log("- request-scoped protected RPC routes checked");
console.log("- API route direct-query selector shape checked");
console.log("- Radan integration RPC company scope checked");
console.log("- training assignment RPC company scope checked");
console.log("- AI write-tool permission boundary checked");
console.log("- integration webhook/interactive service-client auth checked");
console.log("- accounting backfill service-client tenant scope checked");
console.log("- Stripe billing service-client tenant scope checked");
console.log("- public model file service-client access checked");
console.log("- file/PDF request-scoped client usage checked");
console.log("- quality issue route request-scoped client usage checked");
console.log("- inventory transfer route request-scoped client usage checked");
console.log("- inventory item-rule route request-scoped client usage checked");
console.log("- inventory document creation route service-client usage checked");
console.log("- inventory line mutation route request-scoped client usage checked");
console.log("- receipt tracking RPC company scope checked");
console.log("- purchased-price RPC Better Auth company scope checked");
console.log("- inventory/invoicing route request-scoped client usage checked");
console.log("- purchasing route request-scoped client usage checked");
console.log("- quality document route request-scoped client usage checked");
console.log("- item method route request-scoped client usage checked");
console.log("- people attribute route request-scoped client usage checked");
console.log("- accounting dimension/currency route scope checked");
console.log("- sales order route request-scoped client usage checked");
console.log("- sales RFQ route request-scoped client usage checked");
console.log("- purchasing RFQ route request-scoped client usage checked");
console.log("- supplier quote route request-scoped client usage checked");
console.log("- quote core route request-scoped client usage checked");
console.log("- quote method route request-scoped client usage checked");
console.log("- job method route request-scoped client usage checked");
console.log("- resource submission route request-scoped client usage checked");
console.log("- maintenance issue route request-scoped client usage checked");
console.log("- maintenance dispatch job service-client tenant scope checked");
console.log("- notification job service-client tenant scope checked");
console.log("- send-email job service-client tenant scope checked");
console.log("- audit event worker service-client tenant scope checked");
console.log("- scheduled cleanup job service-client tenant scope checked");
console.log("- scheduled audit archive service-client tenant scope checked");
console.log("- scheduled MRP job service-client tenant scope checked");
console.log("- timecard auto-close job service-client tenant scope checked");
console.log("- weekly cloud cleanup service-client tenant scope checked");
console.log("- weekly training reminder service-client tenant scope checked");
console.log("- scheduled exchange-rate service-client group scope checked");
console.log("- onboard job service-client tenant scope checked");
console.log("- post-transaction job service-client tenant scope checked");
console.log("- Paperless Parts job service-client tenant scope checked");
console.log("- search-index job service-client tenant scope checked");
console.log("- approval rule route request-scoped client usage checked");
console.log("- shared import route request-scoped client usage checked");
console.log("- audit log route request-scoped client usage checked");
console.log("- job core route request-scoped client usage checked");
console.log("- maintenance location RPC company scope checked");
console.log("- production schedule RPC company scope checked");
console.log("- production step-record RPC company scope checked");
console.log("- item detail RPC company scope checked");
console.log("- related-record lookup RPC company scope checked");
console.log("- method tree RPC company scope checked");
console.log("- inventory quantity RPC company scope checked");
console.log("- planning RPC company scope checked");
console.log("- accounting reporting RPC company-group scope checked");
console.log("- intercompany RPC company-group scope checked");
console.log("- MCP company-group context usage checked");
console.log("- storage-unit requirement RPC company scope checked");
console.log("- user admin route request-scoped client usage checked");
console.log("- onboarding route request-scoped/bootstrap usage checked");
console.log("- company settings route request-scoped/bootstrap usage checked");
console.log("- MES submission route request-scoped client usage checked");
console.log("- MES job/operation route request-scoped client usage checked");
console.log("- MES maintenance/inventory action request-scoped client usage checked");
console.log("- MES production route company-scope usage checked");
console.log(`- covered manifest tuples: ${manifestTuples.join(", ")}`);

if (listDynamic && dynamicRequirePermissions.length > 0) {
  console.log("- dynamic requirePermissions calls:");
  for (const location of dynamicRequirePermissions) {
    console.log(`  - ${location}`);
  }
}

function collectManifestTuples(data) {
  const tuples = new Set();
  for (const review of data.reviews ?? []) {
    for (const permission of review.permissions ?? []) {
      for (const [action, module] of Object.entries(permission)) {
        tuples.add(`${action}:${module}`);
      }
    }
  }
  return [...tuples].sort();
}

function sourceFiles() {
  return git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "apps",
    "packages"
  )
    .split("\n")
    .filter(
      (file) =>
        /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) &&
        existsSync(resolve(repoRoot, file)) &&
        !ignoredPathParts.some(
          (ignored) => file === ignored || file.startsWith(ignored)
        )
    );
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function isRequirePermissionsCall(node) {
  const expression = unwrap(node.expression);
  return ts.isIdentifier(expression) && expression.text === "requirePermissions";
}

function isPermissionsCanCall(node) {
  const expression = unwrap(node.expression);
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "can" &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "permissions"
  );
}

function collectPermissionObjectTuples(node) {
  const expression = unwrap(node);
  const tuples = [];

  if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const action = propertyNameText(property.name);
        if (!actions.has(action)) {
          continue;
        }
        const modules = collectModuleNames(property.initializer);
        if (modules === null) {
          return null;
        }
        for (const module of modules) {
          tuples.push(`${action}:${module}`);
        }
      } else if (ts.isSpreadAssignment(property)) {
        const spreadTuples = collectPermissionObjectTuples(property.expression);
        if (spreadTuples === null) {
          return null;
        }
        tuples.push(...spreadTuples);
      }
    }
    return tuples;
  }

  if (ts.isConditionalExpression(expression)) {
    const trueTuples = collectPermissionObjectTuples(expression.whenTrue);
    const falseTuples = collectPermissionObjectTuples(expression.whenFalse);
    return trueTuples === null || falseTuples === null
      ? null
      : [...trueTuples, ...falseTuples];
  }

  return null;
}

function collectModuleNames(node) {
  const expression = unwrap(node);
  const literal = stringLiteralText(expression);
  if (literal) {
    return [literal];
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const modules = [];
    for (const element of expression.elements) {
      const module = stringLiteralText(element);
      if (!module) {
        return null;
      }
      modules.push(module);
    }
    return modules;
  }

  if (ts.isConditionalExpression(expression)) {
    const trueModules = collectModuleNames(expression.whenTrue);
    const falseModules = collectModuleNames(expression.whenFalse);
    return trueModules === null || falseModules === null
      ? null
      : [...trueModules, ...falseModules];
  }

  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "importPermissions"
  ) {
    return importPermissionModules;
  }

  return null;
}

function unwrap(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression?.(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function stringLiteralText(node) {
  if (!node) {
    return null;
  }
  const expression = unwrap(node);
  return ts.isStringLiteralLike(expression) ? expression.text : null;
}

function propertyNameText(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return "";
}

function addGate(map, tuple, location) {
  const locations = map.get(tuple) ?? [];
  locations.push(location);
  map.set(tuple, locations);
}

function locationFor(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${sourceFile.fileName}:${position.line + 1}`;
}

function hasAuthServerContract() {
  const source = readFileSync(
    resolve(repoRoot, "packages/auth/src/services/auth.server.ts"),
    "utf8"
  );
  return (
    /export\s+async\s+function\s+requirePermissions\b/.test(source) &&
    /getUserClaims\(userId,\s*companyId\)/.test(source) &&
    /apiKeyData\.scopes/.test(source) &&
    /getCarbon\(accessToken,\s*effectiveUserId\)/.test(source) &&
    /requiredPermissions\.bypassRls\s*&&\s*myClaims\.role\s*===\s*"employee"[\s\S]*\?\s*getCarbonServiceClient\(\)/.test(
      source
    ) &&
    /getCarbonAPIKeyClient\(\s*apiKeyData\.id\s*\)/.test(source) &&
    /getExternalAccountScope\(\s*effectiveUserId,\s*companyId,\s*myClaims\.role\s*\)/.test(
      source
    ) &&
    /\.from\("customerAccount"\)[\s\S]*\.eq\("active",\s*true\)/.test(
      source
    ) &&
    /\.from\("supplierAccount"\)[\s\S]*\.eq\("active",\s*true\)/.test(source)
  );
}

function externalAccountRouteScopeFailures() {
  const scopeFailures = [];
  const authServer = readFileSync(
    resolve(repoRoot, "packages/auth/src/services/auth.server.ts"),
    "utf8"
  );
  const customerRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/customer+/$customerId.tsx"),
    "utf8"
  );
  const customerListRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales+/customers.tsx"),
    "utf8"
  );
  const supplierRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier+/$supplierId.tsx"),
    "utf8"
  );
  const supplierApprovalRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier+/$supplierId.approval.tsx"),
    "utf8"
  );
  const customerContactNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/customer+/$customerId.contacts.new.tsx"),
    "utf8"
  );
  const supplierContactNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier+/$supplierId.contacts.new.tsx"),
    "utf8"
  );
  const supplierListRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchasing+/suppliers.tsx"),
    "utf8"
  );
  const customerContactApiRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/sales.customer-contacts.$customerId.ts"),
    "utf8"
  );
  const customerLocationApiRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/sales.customer-locations.$customerId.ts"),
    "utf8"
  );
  const supplierContactApiRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/purchasing.supplier-contacts.$supplierId.ts"),
    "utf8"
  );
  const supplierLocationApiRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/purchasing.supplier-locations.$supplierId.ts"),
    "utf8"
  );
  const supplierProcessApiRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/purchasing.supplier-processes.$processId.ts"),
    "utf8"
  );
  const customerPaymentRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/customer+/$customerId.payments.tsx"),
    "utf8"
  );
  const customerShippingRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/customer+/$customerId.shipping.tsx"),
    "utf8"
  );
  const customerTaxRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/customer+/$customerId.tax.tsx"),
    "utf8"
  );
  const supplierPaymentRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier+/$supplierId.payments.tsx"),
    "utf8"
  );
  const supplierShippingRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier+/$supplierId.shipping.tsx"),
    "utf8"
  );
  const supplierTaxRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier+/$supplierId.tax.tsx"),
    "utf8"
  );
  const mcpRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/_index.ts"),
    "utf8"
  );
  const purchasingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/purchasing/purchasing.service.ts"),
    "utf8"
  );

  if (
    !/export\s+function\s+assertCustomerAccountScope\b[\s\S]*role\s*===\s*"customer"[\s\S]*customerId\s*!==\s*customerId/.test(
      authServer
    )
  ) {
    scopeFailures.push(
      "Could not verify assertCustomerAccountScope rejects out-of-scope customer routes."
    );
  }

  if (
    !/export\s+function\s+assertSupplierAccountScope\b[\s\S]*role\s*===\s*"supplier"[\s\S]*supplierId\s*!==\s*supplierId/.test(
      authServer
    )
  ) {
    scopeFailures.push(
      "Could not verify assertSupplierAccountScope rejects out-of-scope supplier routes."
    );
  }

  if (!/assertCustomerAccountScope\(\s*auth,\s*customerId\s*\)/.test(customerRoute)) {
    scopeFailures.push(
      "Customer detail route does not apply assertCustomerAccountScope(auth, customerId)."
    );
  }

  if (!/customerId:\s*scopedCustomerId/.test(customerListRoute)) {
    scopeFailures.push(
      "Customer list route does not read the scoped customerId from requirePermissions."
    );
  }

  if (
    !/customerId:\s*role\s*===\s*"customer"\s*\?\s*scopedCustomerId\s*:\s*null/.test(
      customerListRoute
    )
  ) {
    scopeFailures.push(
      "Customer list route does not pass the scoped customerId filter for customer users."
    );
  }

  if (!/assertSupplierAccountScope\(\s*auth,\s*supplierId\s*\)/.test(supplierRoute)) {
    scopeFailures.push(
      "Supplier detail route does not apply assertSupplierAccountScope(auth, supplierId)."
    );
  }

  if (
    /getCarbonServiceClient\s*\(/.test(customerContactNewRoute) ||
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*auth/.test(
      customerContactNewRoute
    ) ||
    !/insertCustomerContact\(client,\s*\{/.test(customerContactNewRoute)
  ) {
    scopeFailures.push(
      "Customer contact creation must use the request-scoped Better Auth client after account-scope validation."
    );
  }

  if (
    /getCarbonServiceClient\s*\(/.test(supplierContactNewRoute) ||
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*auth/.test(
      supplierContactNewRoute
    ) ||
    !/insertSupplierContact\(client,\s*\{/.test(supplierContactNewRoute)
  ) {
    scopeFailures.push(
      "Supplier contact creation must use the request-scoped Better Auth client after account-scope validation."
    );
  }

  if (
    /getCarbonServiceClient\s*\(/.test(supplierRoute) ||
    !/getSupplierApprovalContext\(\s*client,\s*supplierId/.test(supplierRoute)
  ) {
    scopeFailures.push(
      "Supplier detail route must keep approval-context reads on the request-scoped Better Auth client."
    );
  }

  if (
    /getCarbonServiceClient\s*\(/.test(supplierApprovalRoute) ||
    !/hasPendingApproval\(\s*client\s*,\s*"supplier"\s*,\s*supplierId\s*\)/.test(
      supplierApprovalRoute
    ) ||
    !/createApprovalRequest\(client,\s*\{/.test(supplierApprovalRoute) ||
    (supplierApprovalRoute.match(/canApproveRequest\(\s*client\s*,/g) ?? [])
      .length < 2 ||
    !/getLatestApprovalRequestForDocument\(\s*client\s*,\s*"supplier"\s*,\s*supplierId\s*\)/.test(
      supplierApprovalRoute
    ) ||
    occurrences(supplierApprovalRoute, '.eq("companyId", companyId)') < 2
  ) {
    scopeFailures.push(
      "Supplier approval route must use the request-scoped Better Auth client and company-filter supplier status updates."
    );
  }

  if (!/supplierId:\s*scopedSupplierId/.test(supplierListRoute)) {
    scopeFailures.push(
      "Supplier list route does not read the scoped supplierId from requirePermissions."
    );
  }

  if (
    !/supplierId:\s*role\s*===\s*"supplier"\s*\?\s*scopedSupplierId\s*:\s*null/.test(
      supplierListRoute
    )
  ) {
    scopeFailures.push(
      "Supplier list route does not pass the scoped supplierId filter for supplier users."
    );
  }

  for (const failure of scopedRouteHelperFailures({
    routePrefix: "apps/erp/app/routes/x+/customer+/",
    routeParamSegment: "$customerId",
    helper: "assertCustomerAccountScope"
  })) {
    scopeFailures.push(failure);
  }

  for (const failure of scopedRouteHelperFailures({
    routePrefix: "apps/erp/app/routes/x+/supplier+/",
    routeParamSegment: "$supplierId",
    helper: "assertSupplierAccountScope"
  })) {
    scopeFailures.push(failure);
  }

  for (const file of files.filter(
    (file) =>
      (file.startsWith("apps/erp/app/routes/x+/customer+/") ||
        file.startsWith("apps/erp/app/routes/x+/supplier+/")) &&
      file.endsWith(".tsx")
  )) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonServiceClient\s*\(/.test(source)) {
      scopeFailures.push(
        `${file} must not use carbon_service inside customer/supplier account routes.`
      );
    }
  }

  for (const failure of customerJobScopeFailures()) {
    scopeFailures.push(failure);
  }

  for (const failure of supplierItemScopeFailures()) {
    scopeFailures.push(failure);
  }

  for (const [label, source] of [
    ["customer contacts API", customerContactApiRoute],
    ["customer locations API", customerLocationApiRoute],
  ]) {
    if (!/assertCustomerAccountScope\(\s*authorized,\s*customerId\s*\)/.test(source)) {
      scopeFailures.push(
        `${label} route must verify URL customerId against the Better Auth external-account scope.`
      );
    }
  }

  for (const [label, source] of [
    ["supplier contacts API", supplierContactApiRoute],
    ["supplier locations API", supplierLocationApiRoute],
  ]) {
    if (!/assertSupplierAccountScope\(\s*authorized,\s*supplierId\s*\)/.test(source)) {
      scopeFailures.push(
        `${label} route must verify URL supplierId against the Better Auth external-account scope.`
      );
    }
  }

  if (
    !/authorized\.role\s*===\s*"supplier"\s*\?\s*authorized\.supplierId\s*:\s*null/.test(
      supplierProcessApiRoute
    ) ||
    !/getSupplierProcessesByProcess\(\s*authorized\.client,\s*processId,\s*supplierId\s*\)/.test(
      supplierProcessApiRoute
    ) ||
    !/export\s+async\s+function\s+getSupplierProcessesByProcess[\s\S]*supplierId\?:\s*string\s*\|\s*null[\s\S]*query\s*=\s*query\.eq\("supplierId",\s*supplierId\)/.test(
      purchasingService
    )
  ) {
    scopeFailures.push(
      "Supplier processes API route must filter process lookups to the scoped supplier account for supplier users."
    );
  }

  for (const [label, source] of [
    ["customer payment", customerPaymentRoute],
    ["customer shipping", customerShippingRoute],
    ["customer tax", customerTaxRoute],
  ]) {
    if (
      !/assertCustomerAccountScope\(\s*auth,\s*customerId\s*\)/.test(source) ||
      !/validation\.data\.customerId\s*!==\s*customerId/.test(source) ||
      !/badRequest\("customerId does not match route parameter"\)/.test(source)
    ) {
      scopeFailures.push(
        `${label} route must verify customer account scope and reject mismatched form customerId values.`
      );
    }
  }

  for (const [label, source] of [
    ["supplier payment", supplierPaymentRoute],
    ["supplier shipping", supplierShippingRoute],
    ["supplier tax", supplierTaxRoute],
  ]) {
    if (
      !/assertSupplierAccountScope\(\s*auth,\s*supplierId\s*\)/.test(source) ||
      !/validation\.data\.supplierId\s*!==\s*supplierId/.test(source) ||
      !/badRequest\("supplierId does not match route parameter"\)/.test(source)
    ) {
      scopeFailures.push(
        `${label} route must verify supplier account scope and reject mismatched form supplierId values.`
      );
    }
  }

  if (
    !/const\s+auth\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      mcpRoute
    ) ||
    !/auth\.role\s*===\s*"customer"\s*\|\|\s*auth\.role\s*===\s*"supplier"/.test(
      mcpRoute
    ) ||
    !/MCP access is not available for external accounts/.test(mcpRoute)
  ) {
    scopeFailures.push(
      "MCP API route must reject external customer/supplier sessions before exposing broad dynamic tools."
    );
  }

  return scopeFailures;
}

function serviceClientRbacBoundaryFailures() {
  const serviceClient = readFileSync(
    resolve(repoRoot, "packages/auth/src/lib/carbon/client.server.ts"),
    "utf8"
  );
  const authServer = readFileSync(
    resolve(repoRoot, "packages/auth/src/services/auth.server.ts"),
    "utf8"
  );
  const authUsers = readFileSync(
    resolve(repoRoot, "packages/auth/src/services/users.server.ts"),
    "utf8"
  );
  const authUserHelpers = readFileSync(
    resolve(repoRoot, "packages/auth/src/services/users.ts"),
    "utf8"
  );
  const erpUsers = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/users/users.server.ts"),
    "utf8"
  );
  const mesConsoleService = readFileSync(
    resolve(repoRoot, "apps/mes/app/services/console.server.ts"),
    "utf8"
  );
  const mesUserMiddleware = readFileSync(
    resolve(repoRoot, "apps/mes/app/middleware/user.ts"),
    "utf8"
  );
  const boundaryFailures = [];

  if (
    !/getServiceDatabaseQueryClient/.test(serviceClient) ||
    !/return\s+getServiceDatabaseQueryClient\(\)/.test(serviceClient)
  ) {
    boundaryFailures.push(
      "getCarbonServiceClient must remain a thin carbon_service database client wrapper."
    );
  }

  for (const token of [
    "requirePermissions",
    "getUserClaims",
    "authProvider",
    "getExternalAccountScope",
    "getCarbonAPIKeyClient",
    "getCarbon("
  ]) {
    if (serviceClient.includes(token)) {
      boundaryFailures.push(
        `getCarbonServiceClient must not translate Better Auth/RBAC/org scope; found ${token}.`
      );
    }
  }

  if (
    !/const\s+client\s*=\s*getCarbonAPIKeyClient\(\s*apiKeyData\.id\s*\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "API-key requests must use getCarbonAPIKeyClient(apiKeyData.id), not the service client, after scope checks."
    );
  }

  if (
    /\.\.\.company\(companyGroupId\)/.test(authServer) ||
    !/\.from\("apiKey"\)[\s\S]*\.select\(\s*"id, companyId, createdBy, scopes, rateLimit, rateLimitWindow, expiresAt"\s*\)[\s\S]*\.eq\("keyHash",\s*keyHash\)/.test(
      authServer
    ) ||
    !/\.from\("company"\)[\s\S]*\.select\("companyGroupId"\)[\s\S]*\.eq\("id",\s*apiKeyRecord\.data\.companyId\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "API-key company-group scope must be resolved through an explicit company lookup, not a Supabase/PostgREST embedded company selector."
    );
  }

  if (
    /companyGroup\(name\)/.test(authUserHelpers) ||
    !/\.from\("companies"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("userId",\s*userId\)/.test(
      authUserHelpers
    )
  ) {
    boundaryFailures.push(
      "Auth company list helpers must use the greenfield companies view fields directly instead of embedding companyGroup(name)."
    );
  }

  if (
    !/\.from\("apiKey"\)[\s\S]*\.update\(\{\s*lastUsedAt:[\s\S]*\.eq\("id"\s+as\s+any,\s*apiKeyData\.id\)[\s\S]*\.eq\("companyId"\s+as\s+any,\s*companyId\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "API-key lastUsedAt updates in requirePermissions must bind both apiKeyData.id and companyId."
    );
  }

  if (
    !/checkApiKeyRateLimit\(\s*serviceClient,\s*apiKeyData\.id,\s*apiKeyData\.rateLimit,\s*apiKeyData\.rateLimitWindow\s*\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "API-key requests must rate-limit the resolved API key before creating an API-key scoped database client."
    );
  }

  if (
    !/requiredPermissions\.bypassRls\s*&&\s*myClaims\.role\s*===\s*"employee"[\s\S]*\?\s*getCarbonServiceClient\(\)[\s\S]*:\s*\(getCarbon\(accessToken,\s*effectiveUserId\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "Employee session requests may receive getCarbonServiceClient() only for explicit bypassRls after Better Auth permission checks."
    );
  }

  if (
    !/getExternalAccountScope\(\s*effectiveUserId,\s*companyId,\s*myClaims\.role\s*\)/.test(
      authServer
    ) ||
    !/return\s+\{[\s\S]*\.\.\.externalAccountScope[\s\S]*\}/.test(authServer)
  ) {
    boundaryFailures.push(
      "requirePermissions must resolve Better Auth external-account scope before returning route authorization context."
    );
  }

  if (
    !/export\s+async\s+function\s+refreshAccessToken[\s\S]*getCompaniesForUser\(\s*client,\s*providerSession\.userId\s*\)[\s\S]*companies\.includes\(companyId\)[\s\S]*const\s+\{\s*data:\s*companyRecord\s*\}\s*=\s*await\s+client[\s\S]*\.from\("company"\)[\s\S]*\.eq\("id",\s*refreshedCompanyId\)[\s\S]*makeAuthSession\(\s*providerSession,\s*refreshedCompanyId,\s*companyRecord\?\.companyGroupId\s*\?\?\s*companyGroupId\s*\?\?\s*""\s*\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "refreshAccessToken must revalidate Better Auth user company membership and rederive companyGroupId before refreshing the Carbon session."
    );
  }

  if (
    !/verifyConsolePinPayload\(\s*pinRaw\s*\)/.test(authServer) ||
    !/const\s+effectiveUserId\s*=\s*await\s+getEffectiveUser\(/.test(
      authServer
    ) ||
    !/\.from\("employee"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("id",\s*pinIn\.userId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.maybeSingle\(\)/.test(
      authServer
    )
  ) {
    boundaryFailures.push(
      "Console-mode effective users must come from a signed pin cookie and an active employee in the current company."
    );
  }

  if (
    !/signConsolePinPayload\(data\)/.test(mesConsoleService) ||
    !/verifyConsolePinPayload\(raw\)/.test(mesConsoleService) ||
    !/type\s+ConsolePinIn\s*=\s*ConsolePinPayload/.test(mesConsoleService)
  ) {
    boundaryFailures.push(
      "MES console pin-in cookies must use the shared signed console-pin payload helpers."
    );
  }

  if (
    !/const\s+cookiePinIn\s*=\s*consoleMode\s*\?\s*getConsolePinIn\(request,\s*companyId\)\s*:\s*null/.test(
      mesUserMiddleware
    ) ||
    !/\.from\("employee"\)[\s\S]*\.eq\("id",\s*cookiePinIn\.userId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*const\s+pinIn\s*=\s*employee\?\.data\s*\?\s*cookiePinIn\s*:\s*null/.test(
      mesUserMiddleware
    )
  ) {
    boundaryFailures.push(
      "MES user middleware must validate signed console pin-in cookies against an active employee in the current company before setting effectiveUserId."
    );
  }

  if (
    !/function\s+getPermissionCacheKey\(\s*userId:\s*string,\s*companyId:\s*string\s*\)[\s\S]*`permissions:\$\{userId\}:\$\{companyId\}`/.test(
      authUserHelpers
    )
  ) {
    boundaryFailures.push(
      "Shared permission cache keys must include both userId and companyId so Better Auth claims stay org-scoped."
    );
  }

  for (const [label, source] of [
    ["packages/auth user claims", authUsers],
    ["ERP user claims", erpUsers],
  ]) {
    if (
      !/redis\.get\(\s*getPermissionCacheKey\(\s*userId,\s*companyId\s*\)\s*\)/.test(
        source
      ) ||
      !/redis\.set\(\s*getPermissionCacheKey\(\s*userId,\s*companyId\s*\),\s*JSON\.stringify\(claims\)/.test(
        source
      )
    ) {
      boundaryFailures.push(
        `${label} must cache Better Auth permission claims by userId and companyId.`
      );
    }
  }

  if (
    !/export\s+async\s+function\s+deactivateUser[\s\S]*\.from\("invite"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("email",\s*user\.data\?\.email\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)[\s\S]*\.maybeSingle\(\)/.test(
      authUsers
    ) ||
    !/export\s+async\s+function\s+deactivateUser[\s\S]*\.from\("invite"\)[\s\S]*\.update\(\{\s*revokedAt:\s*new Date\(\)\.toISOString\(\)\s*\}\)[\s\S]*\.eq\("email",\s*userRecord\.data\.email\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)/.test(
      authUsers
    )
  ) {
    boundaryFailures.push(
      "Shared deactivateUser must only infer and revoke pending invite rows for the resolved company."
    );
  }

  return boundaryFailures;
}

function bypassRlsRequestGateFailures() {
  const scopeFailures = [];

  for (const file of files) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (!/bypassRls\s*:/.test(source)) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") || file.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
    );

    visit(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isRequirePermissionsCall(node)) {
        return;
      }

      const permissionArg = node.arguments[1];
      if (!permissionArg) {
        return;
      }

      const bypassRls = booleanObjectProperty(permissionArg, "bypassRls");
      if (bypassRls === false) {
        return;
      }

      const location = locationFor(sourceFile, node);
      if (bypassRls === null) {
        scopeFailures.push(
          `${location} uses dynamic bypassRls; use an explicit true/false value so the RBAC audit can classify it.`
        );
        return;
      }

      const tuples = collectPermissionObjectTuples(permissionArg);
      if (tuples === null || tuples.length === 0) {
        scopeFailures.push(
          `${location} uses bypassRls without a concrete view/create/update/delete permission tuple.`
        );
      }

      if (!hasCompanyScopeBinding(source, node)) {
        scopeFailures.push(
          `${location} uses bypassRls without carrying companyId or companyGroupId from requirePermissions.`
        );
      }
    });
  }

  return scopeFailures;
}

function serviceClientProtectedRouteFailures() {
  return files
    .filter((file) => /apps\/(erp|mes)\/app\/routes\/x\+/.test(file))
    .flatMap((file) => {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      if (!/getCarbonService(Client|Role)\s*\(/.test(source)) {
        return [];
      }

      if (isAllowedCompanyBootstrapServiceRoute(file, source)) {
        return [];
      }

      return [
        `${file} uses a service database client in a protected route outside the audited company bootstrap boundary.`
      ];
    });
}

function isAllowedCompanyBootstrapServiceRoute(file, source) {
  const companyBootstrapRoutes = new Map([
    [
      "apps/erp/app/routes/x+/settings+/company.new.tsx",
      [
        /requirePermissions\s*\(\s*request,\s*\{[\s\S]*update:\s*\[\s*"settings",\s*"users"\s*\]/,
        /const\s+client\s*=\s*getCarbonServiceClient\(\)/,
        /insertCompany\(\s*client,/,
        /seedCompany\(\s*client,/,
        /insertEmployeeJob\(\s*client,/,
        /updateCompanySession\(/,
      ],
    ],
    [
      "apps/erp/app/routes/x+/settings+/companies.new.tsx",
      [
        /requirePermissions\s*\(\s*request,\s*\{[\s\S]*create:\s*"settings"/,
        /const\s+client\s*=\s*getCarbonServiceClient\(\)/,
        /insertCompany\(\s*client,/,
        /seedCompany\(\s*client,/,
        /insertEmployeeJob\(\s*client,/,
      ],
    ],
  ]);

  const evidence = companyBootstrapRoutes.get(file);
  return !!evidence && evidence.every((pattern) => pattern.test(source));
}

function publicServiceClientRouteBoundaryFailures() {
  const publicFlowAllowlist = new Map([
    [
      "apps/academy/app/routes/_auth+/health.tsx",
      [/\.from\("attributeDataType"\)[\s\S]*\.select\("id"\)[\s\S]*\.limit\(1\)/, /new Response\("OK"\)/],
    ],
    [
      "apps/starter/app/routes/_public+/health.tsx",
      [/\.from\("attributeDataType"\)[\s\S]*\.select\("id"\)[\s\S]*\.limit\(1\)/, /new Response\("OK"\)/],
    ],
    [
      "apps/erp/app/routes/_public+/invite.$code.tsx",
      [
        /\.from\("invite"\)[\s\S]*\.select\("\*"\)/,
        /\.eq\("code", code\)/,
        /\.is\("acceptedAt",\s*null\)/,
        /\.is\("revokedAt",\s*null\)/,
        /\.from\("company"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("id",\s*invite\.data\.companyId\)[\s\S]*\.eq\("active",\s*true\)/,
        /acceptInvite/,
      ],
    ],
    [
      "apps/erp/app/routes/api+/purchasing.digital-quote.$id.tsx",
      [/getSupplierQuoteByExternalLinkId/, /externalLinkId/],
    ],
    [
      "apps/erp/app/routes/api+/sales.digital-quote.$id.tsx",
      [/getQuoteByExternalId/, /convertQuoteToOrder/],
    ],
    [
      "apps/erp/app/routes/oauth+/token.tsx",
      [/client_secret/, /oauthClient/, /oauthCode/],
    ],
    [
      "apps/erp/app/routes/share+/customer.$id.$.tsx",
      [/getCustomerPortal/, /Ratelimit/, /assertCompanyPath/],
    ],
    [
      "apps/erp/app/routes/share+/customer.$id.tsx",
      [/getCustomerPortal/, /getExternalSalesOrderLines/],
    ],
    [
      "apps/erp/app/routes/share+/quote.$id.tsx",
      [/getQuoteByExternalId/, /QuoteState/],
    ],
    [
      "apps/erp/app/routes/share+/scar.$id.tsx",
      [/getExternalLink/, /documentId/, /getIssueFromExternalLink/],
    ],
    [
      "apps/erp/app/routes/share+/supplier-quote.$id.tsx",
      [/getSupplierQuoteByExternalLinkId/, /QuoteState/],
    ],
  ]);

  return files
    .filter((file) => /apps\/[^/]+\/app\/routes\//.test(file))
    .filter((file) => !/app\/routes\/x\+/.test(file))
    .filter((file) => !/\.server\.[cm]?[tj]sx?$/.test(file))
    .flatMap((file) => {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      if (!/getCarbonServiceClient\s*\(/.test(source)) {
        return [];
      }

      if (hasPublicServiceClientBoundary(source)) {
        return [];
      }

      const evidence = publicFlowAllowlist.get(file);
      if (evidence?.every((pattern) => pattern.test(source))) {
        return [];
      }

      return [
        `${file} uses getCarbonServiceClient() outside protected routes without a recognized auth boundary or explicit public-flow allowlist.`
      ];
    });
}

function oauthTokenRouteServiceClientScopeFailures() {
  const failures = [];
  const route = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/oauth+/token.tsx"),
    "utf8"
  );

  if (
    !/const\s+clientCompanyId\s*=\s*oauthClient\.data\.companyId/.test(route)
  ) {
    failures.push(
      "OAuth token route must derive the tenant scope from the authenticated OAuth client."
    );
  }

  if (
    !/\.from\("oauthCode"\)[\s\S]*\.select\("\*"[\s\S]*\.eq\("code",\s*code\)[\s\S]*\.eq\("clientId",\s*client_id\)[\s\S]*\.eq\("redirectUri",\s*redirect_uri\)[\s\S]*\.eq\("companyId",\s*clientCompanyId\)/.test(
      route
    )
  ) {
    failures.push(
      "OAuth authorization-code lookup must bind code, client ID, redirect URI, and client company."
    );
  }

  if (
    !/\.from\("oauthCode"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("code",\s*code\)[\s\S]*\.eq\("clientId",\s*client_id\)[\s\S]*\.eq\("companyId",\s*clientCompanyId\)/.test(
      route
    )
  ) {
    failures.push(
      "OAuth used-code deletion must bind code, client ID, and client company."
    );
  }

  if (
    !/\.from\("oauthToken"\)[\s\S]*\.select\("\*"[\s\S]*\.eq\("refreshToken",\s*refresh_token\)[\s\S]*\.eq\("clientId",\s*client_id\)[\s\S]*\.eq\("companyId",\s*clientCompanyId\)/.test(
      route
    )
  ) {
    failures.push(
      "OAuth refresh-token lookup must bind refresh token, client ID, and client company."
    );
  }

  if (
    !/\.from\("oauthToken"\)[\s\S]*\.update\(\{[\s\S]*accessToken:\s*newAccessToken[\s\S]*expiresAt:[\s\S]*\}\)[\s\S]*\.eq\("refreshToken",\s*refresh_token\)[\s\S]*\.eq\("clientId",\s*client_id\)[\s\S]*\.eq\("companyId",\s*tokenResult\.data\.companyId\)/.test(
      route
    )
  ) {
    failures.push(
      "OAuth refresh-token update must bind refresh token, client ID, and token company."
    );
  }

  return failures;
}

function publicShareServiceClientScopeFailures() {
  const failures = [];
  const scarRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/share+/scar.$id.tsx"),
    "utf8"
  );
  const qualityService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/quality/quality.service.ts"),
    "utf8"
  );
  const purchasingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/purchasing/purchasing.service.ts"),
    "utf8"
  );

  if (
    !/export\s+async\s+function\s+getSupplier\([\s\S]*companyId\?:\s*string[\s\S]*\.from\("suppliers"\)[\s\S]*\.eq\("id",\s*supplierId\)[\s\S]*if\s*\(companyId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      purchasingService
    )
  ) {
    failures.push(
      "Supplier helper must support an optional companyId predicate before public service-client reads."
    );
  }

  if (
    !/function\s+getIssueFromExternalLink\([\s\S]*id:\s*string,\s*companyId\?:\s*string[\s\S]*\.from\("nonConformanceSupplier"\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*if\s*\(companyId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      qualityService
    )
  ) {
    failures.push(
      "SCAR public-share issue lookup must optionally bind nonConformanceSupplier by external-link companyId."
    );
  }

  if (
    !/function\s+updateIssueTaskStatus\([\s\S]*companyId\?:\s*string[\s\S]*nonConformanceId\?:\s*string[\s\S]*supplierId\?:\s*string\s*\|\s*null[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("nonConformanceId",\s*nonConformanceId\)[\s\S]*\.eq\("supplierId",\s*supplierId\)/.test(
      qualityService
    ) ||
    !/function\s+updateIssueTaskContent\([\s\S]*companyId\?:\s*string[\s\S]*nonConformanceId\?:\s*string[\s\S]*supplierId\?:\s*string\s*\|\s*null[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("nonConformanceId",\s*nonConformanceId\)[\s\S]*\.eq\("supplierId",\s*supplierId\)/.test(
      qualityService
    )
  ) {
    failures.push(
      "SCAR public-share task update helpers must support company, nonconformance, and supplier filters before service-client writes."
    );
  }

  if (
    !/getIssueFromExternalLink\(\s*serviceClient,\s*externalLink\.data\.documentId,\s*externalLink\.data\.companyId\s*\)/.test(
      scarRoute
    ) ||
    !/getSupplier\(\s*serviceClient,\s*issue\.data\.supplierId,\s*externalLink\.data\.companyId\s*\)/.test(
      scarRoute
    ) ||
    !/validation\.data\.supplierId\s*!==\s*issue\.data\.supplierId/.test(
      scarRoute
    ) ||
    !/getIssueActionTasks\(\s*serviceClient,\s*issue\.data\.nonConformanceId,\s*externalLink\.data\.companyId,\s*issue\.data\.supplierId\s*\)/.test(
      scarRoute
    ) ||
    !/updateIssueTaskStatus\(\s*serviceClient,\s*\{[\s\S]*companyId:\s*externalLink\.data\.companyId[\s\S]*nonConformanceId:\s*issue\.data\.nonConformanceId[\s\S]*supplierId:\s*issue\.data\.supplierId/.test(
      scarRoute
    ) ||
    !/updateIssueTaskContent\(\s*serviceClient,\s*\{[\s\S]*companyId:\s*externalLink\.data\.companyId[\s\S]*nonConformanceId:\s*issue\.data\.nonConformanceId[\s\S]*supplierId:\s*issue\.data\.supplierId/.test(
      scarRoute
    )
  ) {
    failures.push(
      "SCAR public-share route must derive task update scope from the external link and validated issue, not just the submitted task id."
    );
  }

  return failures;
}

function publicDigitalQuoteServiceClientScopeFailures() {
  const failures = [];
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const purchasingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/purchasing/purchasing.service.ts"),
    "utf8"
  );
  const quoteShareRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/share+/quote.$id.tsx"),
    "utf8"
  );
  const supplierQuoteShareRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/share+/supplier-quote.$id.tsx"),
    "utf8"
  );
  const salesDigitalQuoteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/sales.digital-quote.$id.tsx"),
    "utf8"
  );
  const purchasingDigitalQuoteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/purchasing.digital-quote.$id.tsx"),
    "utf8"
  );

  if (
    !/function\s+getQuoteByExternalId\([\s\S]*scope\?:\s*\{[\s\S]*companyId\?:\s*string[\s\S]*documentId\?:\s*string[\s\S]*customerId\?:\s*string\s*\|\s*null[\s\S]*\.eq\("externalLinkId",\s*externalId\)[\s\S]*\.eq\("companyId",\s*scope\.companyId\)[\s\S]*\.eq\("id",\s*scope\.documentId\)[\s\S]*\.eq\("customerId",\s*scope\.customerId\)/.test(
      salesService
    )
  ) {
    failures.push(
      "Digital quote lookup must support external-link-derived company, document, and customer scope."
    );
  }

  if (
    !/function\s+getSupplierQuoteByExternalLinkId\([\s\S]*scope\?:\s*\{[\s\S]*companyId\?:\s*string[\s\S]*documentId\?:\s*string[\s\S]*supplierId\?:\s*string\s*\|\s*null[\s\S]*\.eq\("externalLinkId",\s*externalLinkId\)[\s\S]*\.eq\("companyId",\s*scope\.companyId\)[\s\S]*\.eq\("id",\s*scope\.documentId\)[\s\S]*\.eq\("supplierId",\s*scope\.supplierId\)/.test(
      purchasingService
    )
  ) {
    failures.push(
      "Supplier digital-quote lookup must support external-link-derived company, document, and supplier scope."
    );
  }

  if (
    !/getExternalLink\(serviceClient,\s*id\)/.test(quoteShareRoute) ||
    !/externalLink\.data\?\.documentType\s*!==\s*"Quote"/.test(quoteShareRoute) ||
    !/getQuoteByExternalId\(serviceClient,\s*id,\s*\{[\s\S]*companyId:\s*externalLink\.data\.companyId[\s\S]*documentId:\s*externalLink\.data\.documentId[\s\S]*customerId:\s*externalLink\.data\.customerId/.test(
      quoteShareRoute
    )
  ) {
    failures.push(
      "Public quote share loader must resolve the external link and bind quote reads to link-derived company/document/customer scope."
    );
  }

  if (
    !/getExternalLink\(serviceClient,\s*id\)/.test(supplierQuoteShareRoute) ||
    !/externalLink\.data\?\.documentType\s*!==\s*"SupplierQuote"/.test(
      supplierQuoteShareRoute
    ) ||
    !/getSupplierQuoteByExternalLinkId\(serviceClient,\s*id,\s*\{[\s\S]*companyId:\s*externalLink\.data\.companyId[\s\S]*documentId:\s*externalLink\.data\.documentId[\s\S]*supplierId:\s*externalLink\.data\.supplierId/.test(
      supplierQuoteShareRoute
    ) ||
    !/\.from\("externalLink"\)[\s\S]*\.update\([\s\S]*lastAccessedAt[\s\S]*\.eq\("id",\s*quote\.data\.externalLinkId\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.eq\("documentType",\s*"SupplierQuote"\)[\s\S]*\.eq\("documentId",\s*quote\.data\.id\)/.test(
      supplierQuoteShareRoute
    )
  ) {
    failures.push(
      "Public supplier quote share loader must bind quote reads and external-link touches to link-derived company/document/supplier scope."
    );
  }

  if (
    !/getExternalLink\(serviceClient,\s*id\)/.test(salesDigitalQuoteRoute) ||
    !/externalLink\.data\?\.documentType\s*!==\s*"Quote"/.test(
      salesDigitalQuoteRoute
    ) ||
    !/getQuoteByExternalId\(serviceClient,\s*id,\s*\{[\s\S]*companyId:\s*externalLink\.data\.companyId[\s\S]*documentId:\s*externalLink\.data\.documentId[\s\S]*customerId:\s*externalLink\.data\.customerId/.test(
      salesDigitalQuoteRoute
    ) ||
    !/\.from\("quoteLine"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("quoteId",\s*quote\.data\.id\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.in\("id",\s*selectedLineIds\)/.test(
      salesDigitalQuoteRoute
    ) ||
    !/\.from\("opportunity"\)[\s\S]*\.update\([\s\S]*purchaseOrderDocumentPath[\s\S]*\.eq\("id",\s*quote\.data\.opportunityId!\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)/.test(
      salesDigitalQuoteRoute
    ) ||
    !/\.from\("quote"\)[\s\S]*\.update\([\s\S]*digitalQuoteRejectedBy[\s\S]*\.eq\("id",\s*quote\.data\.id\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.eq\("externalLinkId",\s*id\)/.test(
      salesDigitalQuoteRoute
    )
  ) {
    failures.push(
      "Sales digital-quote API must bind service-client reads/writes and submitted line IDs to the external-link quote scope."
    );
  }

  if (
    !/getExternalLink\(serviceClient,\s*id\)/.test(purchasingDigitalQuoteRoute) ||
    !/externalLink\.data\?\.documentType\s*!==\s*"SupplierQuote"/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/getSupplierQuoteByExternalLinkId\(serviceClient,\s*id,\s*\{[\s\S]*companyId:\s*externalLink\.data\.companyId[\s\S]*documentId:\s*externalLink\.data\.documentId[\s\S]*supplierId:\s*externalLink\.data\.supplierId/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("supplierQuote"\)[\s\S]*\.update\([\s\S]*status:\s*"Declined"[\s\S]*\.eq\("id",\s*quote\.data\.id\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.eq\("externalLinkId",\s*id\)/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("supplierQuoteLine"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("supplierQuoteId",\s*quote\.data\.id\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.in\("id",\s*submittedLineIds\)/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("supplierQuoteLinePrice"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("supplierQuoteId",\s*quote\.data\.id\)[\s\S]*\.eq\("supplierQuoteLineId",\s*lineId\)[\s\S]*\.eq\("quantity",\s*quantity\)/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("supplierQuoteLinePrice"\)[\s\S]*\.update\([\s\S]*supplierUnitPrice[\s\S]*\.eq\("supplierQuoteId",\s*quote\.data\.id\)[\s\S]*\.eq\("supplierQuoteLineId",\s*lineId\)[\s\S]*\.eq\("quantity",\s*quantity\)/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("supplierQuote"\)[\s\S]*\.update\([\s\S]*status:\s*"Active"[\s\S]*\.eq\("id",\s*quote\.data\.id\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.eq\("externalLinkId",\s*id\)/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("externalLink"\)[\s\S]*\.update\([\s\S]*(declinedAt|submittedAt)[\s\S]*\.eq\("id",\s*quote\.data\.externalLinkId\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)[\s\S]*\.eq\("documentType",\s*"SupplierQuote"\)[\s\S]*\.eq\("documentId",\s*quote\.data\.id\)/.test(
      purchasingDigitalQuoteRoute
    ) ||
    !/\.from\("supplierQuoteLine"\)[\s\S]*\.update\([\s\S]*externalNotes[\s\S]*\.eq\("id",\s*lineId\)[\s\S]*\.eq\("supplierQuoteId",\s*quote\.data\.id\)[\s\S]*\.eq\("companyId",\s*quote\.data\.companyId\)/.test(
      purchasingDigitalQuoteRoute
    )
  ) {
    failures.push(
      "Supplier digital-quote API must bind service-client writes, submitted line IDs, and external-link updates to the link-derived supplier quote scope."
    );
  }

  return failures;
}

function publicCustomerPortalServiceClientScopeFailures() {
  const failures = [];
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const sharedService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/shared/shared.service.ts"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const customerPortalRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/share+/customer.$id.tsx"),
    "utf8"
  );
  const customerPortalFileRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/share+/customer.$id.$.tsx"),
    "utf8"
  );
  const operationalSql = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0013_operational_helper_rpcs.sql"),
    "utf8"
  );

  if (
    /user\(id,\s*fullName,\s*avatarUrl\)/.test(sharedService) ||
    !/function\s+getNotes\([\s\S]*\.from\("note"\)[\s\S]*\.select\("id, note, createdAt, createdBy"\)[\s\S]*\.from\("user"\)[\s\S]*\.select\("id, fullName, avatarUrl"\)/.test(
      sharedService
    )
  ) {
    failures.push(
      "Shared notes must load author metadata through an explicit user lookup instead of an embedded selector."
    );
  }

  if (
    /customer:customerId\(id,\s*name\)/.test(sharedService) ||
    !/function\s+getCustomerPortal\([\s\S]*\.from\("externalLink"\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("documentType",\s*"Customer"\)/.test(
      sharedService
    ) ||
    !/\.from\("customer"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("id",\s*externalLink\.data\.customerId\)[\s\S]*\.eq\("companyId",\s*externalLink\.data\.companyId\)/.test(
      sharedService
    )
  ) {
    failures.push(
      "Customer portal lookup must resolve Customer external links and load customer metadata explicitly inside the link company."
    );
  }

  if (
    !/CREATE OR REPLACE FUNCTION get_sales_order_lines_by_customer_id\(customer_id text,\s*company_id text\)/.test(
      operationalSql
    ) ||
    !/WHERE so\."customerId"\s*=\s*customer_id\s+AND so\."companyId"\s*=\s*company_id/.test(
      operationalSql
    )
  ) {
    failures.push(
      "Customer portal sales-order-line RPC must require both customer_id and company_id."
    );
  }

  if (
    !/function\s+getExternalSalesOrderLines\([\s\S]*customerId:\s*string,\s*companyId:\s*string[\s\S]*"get_sales_order_lines_by_customer_id"[\s\S]*customer_id:\s*customerId,\s*company_id:\s*companyId/.test(
      salesService
    )
  ) {
    failures.push(
      "Customer portal sales-order-line service helper must pass external-link companyId into the RPC."
    );
  }

  if (
    !/function\s+getJobByOperationId\([\s\S]*scope\?:\s*\{[\s\S]*companyId\?:\s*string[\s\S]*\.eq\("id",\s*operationId\)[\s\S]*\.eq\("companyId",\s*scope\.companyId\)/.test(
      productionService
    )
  ) {
    failures.push(
      "Customer portal attachment job lookup must support company scope before service-client reads."
    );
  }

  if (
    !/isExpired\(customer\.data\.expiresAt\)/.test(customerPortalRoute) ||
    !/getExternalSalesOrderLines\(\s*serviceClient,\s*customer\.data\.customerId,\s*customer\.data\.companyId/.test(
      customerPortalRoute
    )
  ) {
    failures.push(
      "Customer portal route must reject expired links and pass link-derived companyId into external sales-order reads."
    );
  }

  if (
    !/isExpired\(customerData\.expiresAt\)/.test(customerPortalFileRoute) ||
    !/assertCompanyPath\(customerData\.companyId/.test(customerPortalFileRoute) ||
    !/getJobByOperationId\(serviceClient,\s*operationId,\s*\{\s*companyId:\s*customerData\.companyId\s*\}\)/.test(
      customerPortalFileRoute
    ) ||
    !/job\.data\.customerId\s*!==\s*customerData\.customerId/.test(
      customerPortalFileRoute
    )
  ) {
    failures.push(
      "Customer portal file route must reject expired links and bind service-client job/file reads to link-derived company/customer scope."
    );
  }

  return failures;
}

function postAuthorizedServiceClientScopeFailures() {
  const scopeFailures = [];
  const kanbanRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/kanban.$id.tsx"),
    "utf8"
  );
  const onshapeSyncRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/integrations.onshape.sync.ts"),
    "utf8"
  );
  const onshapeOAuthRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/integrations.onshape.oauth.ts"),
    "utf8"
  );

  if (
    !/requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(kanbanRoute) ||
    !/kanban\.data\.companyId\s*!==\s*companyId/.test(kanbanRoute)
  ) {
    scopeFailures.push(
      "Kanban API route must resolve Better Auth company scope and reject out-of-company kanban records before service-client writes."
    );
  }

  if (/getCarbonService(?:Client|Role)\s*\(/.test(kanbanRoute)) {
    scopeFailures.push(
      "Kanban API route must run post-authorization job/method/MRP side effects through the request-scoped Better Auth client, not carbon_service."
    );
  }

  if (
    !/upsertJobMethod\(client,\s*"itemToJob",\s*\{[\s\S]*companyId[\s\S]*userId[\s\S]*\}\)/.test(
      kanbanRoute
    ) ||
    !/updateKanbanJob\(client,\s*\{[\s\S]*companyId[\s\S]*userId[\s\S]*\}\)/.test(
      kanbanRoute
    ) ||
    !/runMRP\(client,\s*\{[\s\S]*companyId[\s\S]*userId[\s\S]*\}\)/.test(
      kanbanRoute
    )
  ) {
    scopeFailures.push(
      "Kanban API method, job association, and MRP calls must use the request-scoped client and carry companyId/userId from requirePermissions."
    );
  }

  if (
    !/client[\s\S]*\.from\("job"\)[\s\S]*\.update\([\s\S]*status:\s*"Ready"[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      kanbanRoute
    )
  ) {
    scopeFailures.push(
      "Kanban API request-scoped job status update must filter by created job id and companyId."
    );
  }

  if (
    !/requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"parts"\s*\}\s*\)/.test(
      onshapeSyncRoute
    ) ||
    !/record\.data\?\.companyId\s*!==\s*companyId/.test(onshapeSyncRoute)
  ) {
    scopeFailures.push(
      "Onshape sync route must resolve parts-update permission and verify the make method company before mapping writes."
    );
  }

  if (/getCarbonService(?:Client|Role)\s*\(/.test(onshapeSyncRoute)) {
    scopeFailures.push(
      "Onshape sync route must replace item integration mappings through the request-scoped Better Auth client, not carbon_service."
    );
  }

  if (
    !/client[\s\S]*\.from\("externalIntegrationMapping"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("entityType",\s*"item"\)[\s\S]*\.eq\("entityId",\s*itemId\)[\s\S]*\.eq\("integration",\s*"onshape"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      onshapeSyncRoute
    )
  ) {
    scopeFailures.push(
      "Onshape sync mapping replacement must use the request-scoped client and include companyId in the delete filter."
    );
  }

  if (
    !/client\.from\("externalIntegrationMapping"\)\.insert\(\{[\s\S]*id:\s*nanoid\(\)[\s\S]*entityType:\s*"item"[\s\S]*entityId:\s*itemId[\s\S]*integration:\s*"onshape"[\s\S]*companyId,[\s\S]*allowDuplicateExternalId:\s*false[\s\S]*createdAt:\s*now[\s\S]*createdBy:\s*userId[\s\S]*updatedAt:\s*now/.test(
      onshapeSyncRoute
    )
  ) {
    scopeFailures.push(
      "Onshape sync mapping insert must persist a complete request-scoped tenant row with id, timestamps, createdBy, and companyId."
    );
  }

  if (/getCarbonService(?:Client|Role)\s*\(/.test(onshapeOAuthRoute)) {
    scopeFailures.push(
      "Onshape OAuth route must save integration credentials through the request-scoped Better Auth client, not carbon_service."
    );
  }

  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"settings"\s*\}\s*\)/.test(
      onshapeOAuthRoute
    ) ||
    !/upsertCompanyIntegration\(client,\s*\{[\s\S]*id:\s*Onshape\.id[\s\S]*updatedBy:\s*userId[\s\S]*companyId:\s*companyId/.test(
      onshapeOAuthRoute
    )
  ) {
    scopeFailures.push(
      "Onshape OAuth route must require settings update permission and bind integration writes to the request-scoped company/user context."
    );
  }

  return scopeFailures;
}

function requestScopedRpcRouteFailures() {
  const scopeFailures = [];
  const searchRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/search.tsx"),
    "utf8"
  );
  const radanRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/integrations.radan.$version.ts"),
    "utf8"
  );
  const trainingsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/resources.trainings.ts"),
    "utf8"
  );
  const mrpRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mrp.ts"),
    "utf8"
  );

  if (/getCarbonServiceClient\s*\(/.test(searchRoute)) {
    scopeFailures.push(
      "Search API route must use the request-scoped Better Auth client, not carbon_service."
    );
  }

  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      searchRoute
    ) ||
    !/getUserClaims\(\s*userId,\s*companyId\s*\)/.test(searchRoute) ||
    !/client\.rpc\("search_company_index",\s*\{[\s\S]*p_company_id:\s*companyId[\s\S]*p_entity_types:\s*allowedEntityTypes/.test(
      searchRoute
    )
  ) {
    scopeFailures.push(
      "Search API route must bind Better Auth company/user scope, filter entity types from user claims, and call search_company_index through the scoped client."
    );
  }

  if (/getCarbonServiceClient\s*\(/.test(radanRoute)) {
    scopeFailures.push(
      "Radan API route must not instantiate carbon_service for company-scoped production export enrichment."
    );
  }

  if (
    !/requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"production"\s*\}\s*\)/.test(
      radanRoute
    ) ||
    !/getCompanyIntegration\(\s*client,\s*companyId,\s*"radan"\s*\)/.test(
      radanRoute
    ) ||
    !/client\.rpc\("get_radan_v1",\s*\{[\s\S]*company_id:\s*companyId/.test(
      radanRoute
    ) ||
    !/getJobDocuments\(\s*client,\s*companyId,\s*\{/.test(radanRoute)
  ) {
    scopeFailures.push(
      "Radan API route must require production view permission and keep RPC/document enrichment on the request-scoped client/company."
    );
  }

  if (/getCarbonServiceClient\s*\(/.test(trainingsRoute)) {
    scopeFailures.push(
      "Outstanding trainings API route must use the request-scoped Better Auth client, not carbon_service."
    );
  }

  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      trainingsRoute
    ) ||
    !/getOutstandingTrainingsForUser\(\s*client,\s*companyId,\s*userId\s*\)/.test(
      trainingsRoute
    )
  ) {
    scopeFailures.push(
      "Outstanding trainings API route must pass request-scoped client/company/user context into the training RPC helper."
    );
  }

  if (/getCarbonService(?:Client|Role)\s*\(/.test(mrpRoute)) {
    scopeFailures.push(
      "MRP API route must not instantiate a carbon_service client before dispatching the MRP function."
    );
  }

  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"inventory"\s*\}\s*\)/.test(
      mrpRoute
    ) ||
    !/\.from\("location"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("id",\s*locationId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.maybeSingle\(\)/.test(
      mrpRoute
    ) ||
    !/runMRP\(client,\s*\{[\s\S]*id:\s*locationId\s*\?\?\s*companyId[\s\S]*companyId[\s\S]*userId/.test(
      mrpRoute
    )
  ) {
    scopeFailures.push(
      "MRP API route must require inventory update permission, verify location company scope, and dispatch with request-scoped company/user context."
    );
  }

  return scopeFailures;
}

function apiRouteDirectQuerySelectorFailures() {
  const missing = [];
  const filesToCheck = [
    "apps/erp/app/routes/api+/assign.ts",
    "apps/erp/app/routes/api+/messaging.notify.ts",
    "apps/erp/app/routes/api+/resources.kpi.$key.ts",
    "apps/erp/app/routes/api+/production.kpi.$key.ts",
    "apps/erp/app/routes/api+/quality.kpi.$key.ts",
    "apps/erp/app/routes/api+/ai+/chat+/tools/get-part.ts",
  ];
  const forbiddenSelectors =
    /job\(id,\s*assignee\)|jobMakeMethod\(id,\s*parentMaterialId\)|workCenter:workCenterId\(name\)|maintenanceDispatch:maintenanceDispatchId\(|\.\.\.jobOperation\(jobId\)|jobOperation\.jobId|supplier:supplier\(id,\s*name\)|item\(id,\s*name,\s*description,\s*revision\)/;

  for (const file of filesToCheck) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (forbiddenSelectors.test(source)) {
      missing.push(
        `${file} must use explicit direct-query reads instead of Supabase/PostgREST relation selectors.`
      );
    }
  }

  const assignRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/assign.ts"),
    "utf8"
  );
  if (
    !/\.from\("jobOperation"\)[\s\S]*\.select\("id, jobId, jobMakeMethodId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      assignRoute
    ) ||
    !/\.from\("job"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      assignRoute
    ) ||
    !/\.from\("jobMakeMethod"\)[\s\S]*\.select\("id, parentMaterialId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      assignRoute
    )
  ) {
    missing.push(
      "Assign API route must build job-operation notification IDs through explicit company-scoped job and make-method reads."
    );
  }

  const messagingRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/messaging.notify.ts"),
    "utf8"
  );
  if (
    !/\.from\("jobOperation"\)[\s\S]*\.select\("id, jobId, jobMakeMethodId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      messagingRoute
    ) ||
    !/\.from\("jobOperationNote"\)[\s\S]*\.eq\("jobOperationId",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      messagingRoute
    ) ||
    !/\.from\("job"\)[\s\S]*\.select\("id, assignee"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      messagingRoute
    ) ||
    !/\.from\("jobMakeMethod"\)[\s\S]*\.select\("id, parentMaterialId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      messagingRoute
    )
  ) {
    missing.push(
      "Messaging notify API route must build job-operation notification context through explicit company-scoped reads."
    );
  }

  const resourcesRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/resources.kpi.$key.ts"),
    "utf8"
  );
  if (
    !/\.from\("maintenanceDispatch"\)[\s\S]*\.select\("id, workCenterId, createdAt"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resourcesRoute
    ) ||
    !/\.from\("workCenter"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resourcesRoute
    ) ||
    !/\.from\("maintenanceDispatchItem"\)[\s\S]*\.select\("id, quantity, totalCost, maintenanceDispatchId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resourcesRoute
    ) ||
    !/\.from\("maintenanceDispatch"\)[\s\S]*\.select\("id, workCenterId, completedAt"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resourcesRoute
    )
  ) {
    missing.push(
      "Resources KPI API route must enrich dispatch/work-center data through explicit company-scoped reads."
    );
  }

  const productionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/production.kpi.$key.ts"),
    "utf8"
  );
  if (
    !/\.from\("jobOperation"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.in\("jobId"/.test(
      productionRoute
    ) ||
    !/\.from\("productionEvent"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.in\("jobOperationId",\s*operationIds\)/.test(
      productionRoute
    ) ||
    !/jobIdByOperationId\.get\(event\.jobOperationId\)/.test(productionRoute)
  ) {
    missing.push(
      "Production KPI API route must map production events to jobs through explicit company-scoped jobOperation reads."
    );
  }

  const qualityRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/quality.kpi.$key.ts"),
    "utf8"
  );
  if (
    !/\.from\("nonConformanceSupplier"\)[\s\S]*\.select\("nonConformanceId, supplierId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      qualityRoute
    ) ||
    !/\.from\("supplier"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      qualityRoute
    )
  ) {
    missing.push(
      "Quality KPI API route must enrich supplier issue counts through explicit company-scoped supplier reads."
    );
  }

  const getPartTool = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/ai+/chat+/tools/get-part.ts"),
    "utf8"
  );
  if (
    !/\.from\("supplierPart"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*context\.companyId\)/.test(
      getPartTool
    ) ||
    !/const\s+supplierPartItem\s*=\s*await\s+context\.client[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, name, description, revision"\)[\s\S]*\.eq\("id",\s*supplierPart\.data\.itemId\)[\s\S]*\.eq\("companyId",\s*context\.companyId\)/.test(
      getPartTool
    )
  ) {
    missing.push(
      "AI get-part tool must resolve supplierPart item metadata through an explicit company-scoped item read."
    );
  }

  return missing;
}

function radanIntegrationRpcScopeFailures() {
  const missing = [];
  const radanRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0017_radan_integration_rpcs.sql"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_radan_v1\(\s*company_id\s+text,\s*processes\s+text\[\]/.test(
      radanRpcs
    )
  ) {
    missing.push(
      "Radan integration RPC must require company_id and process filters in its public signature."
    );
  }

  if (
    !/JOIN\s+"location"\s+l[\s\S]*l\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"salesOrderLine"\s+sol[\s\S]*sol\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"salesOrder"\s+so[\s\S]*so\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/WHERE\s+j\."companyId"\s*=\s*company_id[\s\S]*j\."status"\s+IN/.test(
      radanRpcs
    )
  ) {
    missing.push(
      "Radan relevant_jobs CTE must scope jobs, locations, and sales-order context to the requested company."
    );
  }

  if (
    !/LEFT\s+JOIN\s+"jobMakeMethod"\s+jmm[\s\S]*jmm\."companyId"\s*=\s*company_id[\s\S]*jmm\."jobId"\s*=\s*rj\.id/.test(
      radanRpcs
    ) ||
    !/JOIN\s+"item"\s+i[\s\S]*i\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/WHERE\s+jo\."companyId"\s*=\s*company_id[\s\S]*jo\."status"\s+NOT\s+IN/.test(
      radanRpcs
    )
  ) {
    missing.push(
      "Radan main export query must scope operations, make methods, and finished-good items to the requested company."
    );
  }

  if (
    !/WHERE\s+jm\."companyId"\s*=\s*company_id[\s\S]*jm\."itemType"\s*=\s*'Material'/.test(
      radanRpcs
    ) ||
    !/SELECT\s+DISTINCT\s+jo\."jobMakeMethodId"[\s\S]*WHERE\s+jo\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/JOIN\s+"item"\s+mi[\s\S]*mi\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"material"\s+m[\s\S]*m\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialSubstance"\s+ms[\s\S]*ms\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialForm"\s+mf[\s\S]*mf\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialDimension"\s+md[\s\S]*md\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialFinish"\s+mf2[\s\S]*mf2\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialGrade"\s+mg[\s\S]*mg\."companyId"\s*=\s*company_id/.test(
      radanRpcs
    ) ||
    /ORDER\s+BY\s+jm\."jobMakeMethodId",\s*jm\."order"\s+DESC\s+LIMIT\s+1/.test(
      radanRpcs
    )
  ) {
    missing.push(
      "Radan material export query must scope job materials, material items, and material taxonomy to the requested company without a global per-export LIMIT."
    );
  }

  return missing;
}

function trainingAssignmentRpcScopeFailures() {
  const missing = [];
  const helperRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0007_plain_audit_event_rpcs.sql"),
    "utf8"
  );
  const resourcesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/resources/resources.service.ts"),
    "utf8"
  );
  const trainingsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/resources.trainings.ts"),
    "utf8"
  );
  const mcpResourcesTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/resources.ts"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_training_assignment_status\(\s*p_company_id\s+text/.test(
      helperRpcs
    ) ||
    !/"completionId"\s+numeric/.test(helperRpcs) ||
    !/p_company_id\s*=\s*ANY\(app_companies_for_context\(\)\)/.test(
      helperRpcs
    ) ||
    !/JOIN\s+"training"\s+t[\s\S]*t\."companyId"\s*=\s*p_company_id[\s\S]*t\."status"\s*=\s*'Active'/.test(
      helperRpcs
    ) ||
    !/LEFT\s+JOIN\s+"trainingCompletion"\s+tc[\s\S]*tc\."trainingAssignmentId"\s*=\s*wp\."trainingAssignmentId"[\s\S]*tc\."companyId"\s*=\s*p_company_id/.test(
      helperRpcs
    )
  ) {
    missing.push(
      "Training assignment status RPC must gate carbon_app by Better Auth company context and scope training/completion joins to p_company_id."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_training_assignment_summary\(\s*p_company_id\s+text/.test(
      helperRpcs
    ) ||
    !/FROM\s+get_training_assignment_status\(p_company_id\)\s+tas/.test(
      helperRpcs
    )
  ) {
    missing.push(
      "Training assignment summary RPC must delegate to the company-scoped status RPC."
    );
  }

  if (
    /trainingQuestion\(\*\)|training\(id,\s*name/.test(resourcesService) ||
    !/function\s+getTraining\([\s\S]*\.from\("training"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("trainingQuestion"\)[\s\S]*\.eq\("trainingId",\s*id\)[\s\S]*\.eq\("companyId",\s*training\.data\.companyId/.test(
      resourcesService
    ) ||
    !/function\s+getTrainingAssignment\([\s\S]*\.from\("trainingAssignment"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("training"\)[\s\S]*\.select\("id, name, frequency, type, status"\)[\s\S]*\.eq\("companyId",\s*assignment\.data\.companyId\)/.test(
      resourcesService
    ) ||
    !/function\s+getTrainingAssignmentForCompletion\([\s\S]*\.from\("trainingQuestion"\)[\s\S]*\.eq\("trainingId",\s*training\.data\.id\)[\s\S]*\.eq\("companyId",\s*assignment\.data\.companyId\)/.test(
      resourcesService
    ) ||
    !/function\s+getTrainingAssignments\([\s\S]*\.from\("trainingAssignment"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("training"\)[\s\S]*\.select\("id, name, frequency"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resourcesService
    )
  ) {
    missing.push(
      "Training helpers must load training metadata and questions through explicit company-scoped reads instead of embedded selectors."
    );
  }

  if (
    !/getOutstandingTrainingsForUser\([\s\S]*companyId:\s*string,[\s\S]*employeeId:\s*string[\s\S]*rpc\(\s*"get_training_assignment_status",\s*\{[\s\S]*p_company_id:\s*companyId/.test(
      resourcesService
    ) ||
    !/rpc\(\s*"get_training_assignment_summary",\s*\{[\s\S]*p_company_id:\s*companyId/.test(
      resourcesService
    )
  ) {
    missing.push(
      "Training assignment service helpers must pass Better Auth company scope into training RPCs."
    );
  }

  if (
    !/getOutstandingTrainingsForUser\(\s*client,\s*companyId,\s*userId\s*\)/.test(
      trainingsRoute
    ) ||
    !/getOutstandingTrainingsForUser\(ctx\.client,\s*ctx\.companyId,\s*params\.employeeId/.test(
      mcpResourcesTools
    )
  ) {
    missing.push(
      "Training assignment API route and MCP tool must derive company scope from Better Auth request/MCP context."
    );
  }

  return missing;
}

function aiToolPermissionFailures() {
  const missing = [];
  const chatRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/ai+/chat+/_index.ts"),
    "utf8"
  );
  const createPurchaseOrderTool = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/api+/ai+/chat+/tools/create-purchase-order.server.ts"
    ),
    "utf8"
  );

  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId,\s*companyGroupId\s*\}[\s\S]*requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      chatRoute
    ) ||
    !/createChatContext\(\{[\s\S]*userId[\s\S]*companyId[\s\S]*companyGroupId[\s\S]*client/.test(
      chatRoute
    )
  ) {
    missing.push(
      "AI chat route must pass Better Auth client/user/company context into tool execution."
    );
  }

  if (/getCarbonServiceClient\s*\(/.test(createPurchaseOrderTool)) {
    missing.push(
      "AI create-purchase-order tool must not use carbon_service for scoped sequence or purchase-order writes."
    );
  }

  if (
    !/getUserClaims\(\s*context\.userId,\s*context\.companyId\s*\)/.test(
      createPurchaseOrderTool
    ) ||
    !/hasCompanyCreatePermission\(\s*claims\.permissions,\s*"purchasing",\s*context\.companyId\s*\)/.test(
      createPurchaseOrderTool
    ) ||
    !/permission\.create\.includes\("0"\)[\s\S]*permission\.create\.includes\(companyId\)/.test(
      createPurchaseOrderTool
    )
  ) {
    missing.push(
      "AI create-purchase-order tool must verify Better Auth create:purchasing claims before writing."
    );
  }

  if (
    !/getNextSequence\(\s*context\.client,\s*"purchaseOrder",\s*context\.companyId\s*\)/.test(
      createPurchaseOrderTool
    ) ||
    !/context\.client[\s\S]*\.from\("purchaseOrder"\)[\s\S]*\.insert\(purchaseOrder\)/.test(
      createPurchaseOrderTool
    )
  ) {
    missing.push(
      "AI create-purchase-order tool must keep sequence allocation and writes on the request-scoped client."
    );
  }

  return missing;
}

function booleanObjectProperty(node, propertyName) {
  const expression = unwrap(node);
  if (!ts.isObjectLiteralExpression(expression)) {
    return null;
  }

  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property)) {
      if (propertyNameText(property.name) !== propertyName) {
        continue;
      }
      const initializer = unwrap(property.initializer);
      if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
      }
      if (initializer.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
      }
      return null;
    }

    if (ts.isSpreadAssignment(property)) {
      return null;
    }
  }

  return false;
}

function hasCompanyScopeBinding(source, node) {
  const declaration = enclosingVariableDeclaration(node);
  if (!declaration) {
    return false;
  }

  if (bindingHasCompanyScope(declaration.name)) {
    return true;
  }

  if (!ts.isIdentifier(declaration.name)) {
    return false;
  }

  const variableName = escapeRegExp(declaration.name.text);
  return new RegExp(
    `\\{[^}]*\\bcompany(?:Group)?Id\\b[^}]*\\}\\s*=\\s*${variableName}\\b`
  ).test(source) || new RegExp(
    `\\b${variableName}\\.company(?:Group)?Id\\b`
  ).test(source);
}

function enclosingVariableDeclaration(node) {
  let current = node;
  while (current) {
    if (ts.isVariableDeclaration(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function bindingHasCompanyScope(name) {
  if (ts.isIdentifier(name)) {
    return name.text === "companyId" || name.text === "companyGroupId";
  }

  if (!ts.isObjectBindingPattern(name)) {
    return false;
  }

  return name.elements.some((element) => {
    const property = element.propertyName
      ? propertyNameText(element.propertyName)
      : "";
    return (
      property === "companyId" ||
      property === "companyGroupId" ||
      bindingHasCompanyScope(element.name)
    );
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPublicServiceClientBoundary(source) {
  return [
    /requirePermissions\s*\(\s*request/,
    /validateFunctionAuth\s*\(\s*request\s*\)/,
    /verifyIntegrationWebhookSignature\s*\(/,
    /verifySlackRequest\s*\(/,
    /XERO_WEBHOOK_SECRET/,
    /paperless-parts-signature/,
    /requireModelAccess\s*\(/,
  ].some((pattern) => pattern.test(source));
}

function integrationWebhookAuthFailures() {
  const webhookRoutes = [
    "apps/erp/app/routes/api+/webhook.jira.$companyId.ts",
    "apps/erp/app/routes/api+/webhook.linear.$companyId.ts",
  ];
  const webhookRouteSources = new Map(
    webhookRoutes.map((file) => [
      file,
      readFileSync(resolve(repoRoot, file), "utf8"),
    ])
  );

  const routeFailures = webhookRoutes.flatMap((file) => {
    const source = webhookRouteSources.get(file) ?? "";
    const routeName = file.includes("jira") ? "Jira" : "Linear";
    const missing = [];

    if (!/getCarbonServiceClient\s*\(/.test(source)) {
      missing.push(
        `${routeName} webhook no longer uses getCarbonServiceClient(); update the webhook boundary audit.`
      );
    }

    if (!/const\s+bodyText\s*=\s*await\s+request\.text\(\)/.test(source)) {
      missing.push(
        `${routeName} webhook must read the raw body before JSON parsing so the HMAC covers the exact payload.`
      );
    }

    if (
      !/verifyIntegrationWebhookSignature\s*\(\s*request\s*,\s*integration\.data\.metadata\s*,\s*bodyText\s*\)/.test(
        source
      )
    ) {
      missing.push(
        `${routeName} webhook uses the service client without verifyIntegrationWebhookSignature(request, integration.data.metadata, bodyText).`
      );
    }

    if (/request\.json\(\)/.test(source)) {
      missing.push(
        `${routeName} webhook must not parse request.json() before signature verification.`
      );
    }

    if (!/status:\s*401/.test(source)) {
      missing.push(
        `${routeName} webhook does not return 401 for failed webhook authentication.`
      );
    }

    return missing;
  });

  const helperSource = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/settings/settings.server.ts"),
    "utf8"
  );
  const formSource = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/integrations.$id.tsx"),
    "utf8"
  );
  const jiraOAuthSource = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/integrations.jira.oauth.ts"),
    "utf8"
  );
  const jiraConfigSource = readFileSync(
    resolve(repoRoot, "packages/ee/src/jira/config.tsx"),
    "utf8"
  );
  const linearConfigSource = readFileSync(
    resolve(repoRoot, "packages/ee/src/linear/config.tsx"),
    "utf8"
  );
  const jiraServiceSource = readFileSync(
    resolve(repoRoot, "packages/ee/src/jira/lib/service.ts"),
    "utf8"
  );
  const linearServiceSource = readFileSync(
    resolve(repoRoot, "packages/ee/src/linear/lib/service.ts"),
    "utf8"
  );
  const jiraSyncJobSource = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/integrations/jira.ts"),
    "utf8"
  );
  const linearSyncJobSource = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/integrations/linear.ts"),
    "utf8"
  );
  const slackInteractiveSource = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/integrations.slack.interactive.ts"),
    "utf8"
  );
  const slackClientSource = readFileSync(
    resolve(repoRoot, "packages/ee/src/slack/lib/client.ts"),
    "utf8"
  );
  const slackServiceSource = readFileSync(
    resolve(repoRoot, "packages/ee/src/slack/lib/service.ts"),
    "utf8"
  );
  const slackDocumentSyncSource = readFileSync(
    resolve(
      repoRoot,
      "packages/jobs/src/inngest/functions/integrations/slack-document-sync.ts"
    ),
    "utf8"
  );
  const xeroWebhookSource = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/webhook.xero.ts"),
    "utf8"
  );
  const accountingIntegrationService = readFileSync(
    resolve(repoRoot, "packages/ee/src/accounting/core/service.ts"),
    "utf8"
  );
  const paperlessWebhookSource = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/api+/webhook.paperless-parts.$companyId.ts"
    ),
    "utf8"
  );

  const contractFailures = [];
  const jiraLinearWebhookSurface =
    helperSource +
    jiraConfigSource +
    linearConfigSource +
    [...webhookRouteSources.values()].join("\n");

  if (
    /verifyIntegrationWebhookSecret/.test(helperSource) ||
    /x-carbon-webhook-secret/.test(jiraLinearWebhookSurface) ||
    /searchParams\.get\("secret"\)/.test(helperSource) ||
    /secret=\$\{encodeURIComponent\(webhookSecret\)\}/.test(
      jiraConfigSource + linearConfigSource
    )
  ) {
    contractFailures.push(
      "Jira/Linear webhooks must not fall back to query-string or x-carbon-webhook-secret authentication."
    );
  }

  if (
    !/function withIntegrationWebhookSecret/.test(helperSource) ||
    !/crypto\.randomUUID\s*\(/.test(helperSource) ||
    !/function verifyIntegrationWebhookSignature/.test(helperSource) ||
    !/crypto\s*\.\s*createHmac\s*\(\s*"sha256"/.test(helperSource) ||
    !/crypto\.timingSafeEqual\s*\(/.test(helperSource) ||
    !/x-carbon-webhook-signature/.test(helperSource)
  ) {
    contractFailures.push(
      "Integration webhook secret helper must mint secrets and verify SHA-256 HMAC signatures with timing-safe comparison."
    );
  }

  if (
    !/integrationId === "jira" \|\| integrationId === "linear"/.test(
      formSource
    ) ||
    !/withIntegrationWebhookSecret/.test(formSource)
  ) {
    contractFailures.push(
      "Jira and Linear integration settings must preserve or generate webhookSecret metadata."
    );
  }

  if (!/withIntegrationWebhookSecret/.test(jiraOAuthSource)) {
    contractFailures.push(
      "Jira OAuth install must generate webhookSecret metadata."
    );
  }

  if (
    !/webhookSecret/.test(jiraConfigSource) ||
    !/x-carbon-webhook-signature/.test(jiraConfigSource) ||
    !/<Copy text=\{webhookSecret\}/.test(jiraConfigSource)
  ) {
    contractFailures.push(
      "Jira setup instructions must expose the webhook URL plus HMAC signing secret."
    );
  }

  if (
    !/webhookSecret/.test(linearConfigSource) ||
    !/x-carbon-webhook-signature/.test(linearConfigSource) ||
    !/<Copy text=\{webhookSecret\}/.test(linearConfigSource)
  ) {
    contractFailures.push(
      "Linear setup instructions must expose the webhook URL plus HMAC signing secret."
    );
  }

  const jiraMappingDeletes =
    jiraServiceSource.match(
      /\.from\("externalIntegrationMapping"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("entityType",\s*"nonConformanceActionTask"\)[\s\S]*?\.eq\("entityId",\s*input\.actionId\)[\s\S]*?\.eq\("integration",\s*"jira"\)[\s\S]*?\.eq\("companyId",\s*companyId\)/g
    )?.length ?? 0;
  const linearMappingDeletes =
    linearServiceSource.match(
      /\.from\("externalIntegrationMapping"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("entityType",\s*"nonConformanceActionTask"\)[\s\S]*?\.eq\("entityId",\s*input\.actionId\)[\s\S]*?\.eq\("integration",\s*"linear"\)[\s\S]*?\.eq\("companyId",\s*companyId\)/g
    )?.length ?? 0;

  if (jiraMappingDeletes < 2 || linearMappingDeletes < 2) {
    contractFailures.push(
      "Jira/Linear service-client mapping deletes must bind entity type, action ID, integration, and companyId for both link and unlink paths."
    );
  }

  if (
    !/\.from\("company"\)[\s\S]*\.select\("id,\s*active"\)[\s\S]*\.eq\("id",\s*payload\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      jiraSyncJobSource
    ) ||
    !/\.from\("companyIntegration"\)[\s\S]*\.select\("id,\s*active"\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)[\s\S]*\.eq\("id",\s*"jira"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      jiraSyncJobSource
    ) ||
    !/\.from\("externalIntegrationMapping"\)[\s\S]*\.eq\("entityType",\s*"nonConformanceActionTask"\)[\s\S]*\.eq\("integration",\s*"jira"\)[\s\S]*\.eq\("externalId",\s*issueId\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)/.test(
      jiraSyncJobSource
    ) ||
    !/linkActionToJiraIssue\(carbon,\s*payload\.companyId/.test(
      jiraSyncJobSource
    )
  ) {
    contractFailures.push(
      "Jira sync job must re-check active company/integration and carry the webhook company through mapping lookups and action updates."
    );
  }

  if (
    !/\.from\("company"\)[\s\S]*\.select\("id,\s*active"\)[\s\S]*\.eq\("id",\s*payload\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      linearSyncJobSource
    ) ||
    !/\.from\("companyIntegration"\)[\s\S]*\.select\("id,\s*active"\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)[\s\S]*\.eq\("id",\s*"linear"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      linearSyncJobSource
    ) ||
    !/\.from\("externalIntegrationMapping"\)[\s\S]*\.eq\("entityType",\s*"nonConformanceActionTask"\)[\s\S]*\.eq\("integration",\s*"linear"\)[\s\S]*\.eq\("externalId",\s*payload\.event\.data\.id\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)/.test(
      linearSyncJobSource
    ) ||
    !/linkActionToLinearIssue\(carbon,\s*payload\.companyId/.test(
      linearSyncJobSource
    )
  ) {
    contractFailures.push(
      "Linear sync job must re-check active company/integration and carry the webhook company through mapping lookups and action updates."
    );
  }

  if (
    !/export async function getJiraIntegration[\s\S]*\.from\("companyIntegration"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("id",\s*"jira"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.limit\(1\)/.test(
      jiraServiceSource
    ) ||
    !/export async function updateJiraCredentials[\s\S]*\.from\("companyIntegration"\)[\s\S]*\.update\([\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("id",\s*"jira"\)[\s\S]*\.eq\("active",\s*true\)/.test(
      jiraServiceSource
    ) ||
    !/export async function getLinearIntegration[\s\S]*\.from\("companyIntegration"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("id",\s*"linear"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.limit\(1\)/.test(
      linearServiceSource
    )
  ) {
    contractFailures.push(
      "Jira/Linear provider clients must only read or refresh active company integration rows."
    );
  }

  if (
    /user\(email\)|\.\.\.nonConformanceRequiredAction|nonConformanceRequiredAction\(name\)/.test(
      `${jiraServiceSource}\n${linearServiceSource}\n${slackServiceSource}`
    ) ||
    !/export const getCompanyEmployees[\s\S]*\.from\("user"\)[\s\S]*\.select\("id, email"\)[\s\S]*\.in\("email",\s*emails\)[\s\S]*\.from\("userToCompany"\)[\s\S]*\.select\("userId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("role",\s*"employee"\)[\s\S]*\.in\("userId",\s*Array\.from\(usersById\.keys\(\)\)\)/.test(
      jiraServiceSource
    ) ||
    !/export const getCompanyEmployees[\s\S]*\.from\("user"\)[\s\S]*\.select\("id, email"\)[\s\S]*\.in\("email",\s*emails\)[\s\S]*\.from\("userToCompany"\)[\s\S]*\.select\("userId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("role",\s*"employee"\)[\s\S]*\.in\("userId",\s*Array\.from\(usersById\.keys\(\)\)\)/.test(
      linearServiceSource
    )
  ) {
    contractFailures.push(
      "Jira/Linear/Slack helpers must use explicit direct-query user and task metadata lookups instead of PostgREST relation selectors."
    );
  }

  if (
    !/verifySlackRequest\s*\(\s*request\s*\)/.test(slackInteractiveSource) ||
    !/getCarbonServiceClient\s*\(/.test(slackInteractiveSource) ||
    !/status\s*}/.test(slackInteractiveSource)
  ) {
    contractFailures.push(
      "Slack interactive route must verify Slack's request signature before service-client integration lookup."
    );
  }

  if (
    !/function verifySlackRequest/.test(slackClientSource) ||
    !/x-slack-request-timestamp/.test(slackClientSource) ||
    !/x-slack-signature/.test(slackClientSource) ||
    !/timingSafeEqual/.test(slackClientSource)
  ) {
    contractFailures.push(
      "Slack request verifier must validate timestamp/signature with timing-safe comparison."
    );
  }

  if (
    !/redis\.get\(`slack-user:\$\{companyId\}:\$\{userId\}`\)/.test(
      slackServiceSource
    ) ||
    /redis\.get\(`slack-user:\$\{userId\}`\)/.test(slackServiceSource) ||
    !/\.from\("userToCompany"\)[\s\S]*\.select\("userId"\)[\s\S]*\.eq\("userId",\s*userId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("user"\)[\s\S]*\.select\("email"\)[\s\S]*\.eq\("id",\s*userId\)/.test(
      slackServiceSource
    ) ||
    !/\.from\("nonConformanceActionTask"\)[\s\S]*\.eq\("id",\s*taskId\)[\s\S]*\.eq\("companyId",\s*data\.companyId\)/.test(
      slackServiceSource
    ) ||
    !/async function getRequiredActionName[\s\S]*\.from\("nonConformanceRequiredAction"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("id",\s*actionTypeId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      slackServiceSource
    ) ||
    !/\.from\("nonConformanceApprovalTask"\)[\s\S]*\.eq\("id",\s*taskId\)[\s\S]*\.eq\("companyId",\s*data\.companyId\)/.test(
      slackServiceSource
    )
  ) {
    contractFailures.push(
      "Slack document sync must scope Carbon-to-Slack user translation and task metadata reads to the event company."
    );
  }

  const activeSlackTokenCalls =
    slackDocumentSyncSource.match(/getActiveSlackToken\(serviceClient,\s*companyId\)/g)
      ?.length ?? 0;
  if (
    activeSlackTokenCalls < 4 ||
    !/async function getActiveSlackToken[\s\S]*\.from\("company"\)[\s\S]*\.select\("id,\s*active"\)[\s\S]*\.eq\("id",\s*companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)[\s\S]*\.from\("companyIntegration"\)[\s\S]*\.select\("metadata"\)[\s\S]*\.eq\("id",\s*"slack"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      slackDocumentSyncSource
    )
  ) {
    contractFailures.push(
      "Slack document sync jobs must load Slack tokens only after checking the active event company and active Slack integration."
    );
  }

  if (
    !/XERO_WEBHOOK_SECRET/.test(xeroWebhookSource) ||
    !/x-xero-signature/.test(xeroWebhookSource) ||
    !/function verifySignature/.test(xeroWebhookSource) ||
    !/return false/.test(xeroWebhookSource) ||
    !/crypto\.timingSafeEqual/.test(xeroWebhookSource) ||
    !/getCarbonServiceClient\s*\(/.test(xeroWebhookSource) ||
    !/getAccountingIntegrationByTenant\(\s*serviceClient,\s*tenantId,\s*ProviderID\.XERO\s*\)/.test(
      xeroWebhookSource
    ) ||
    !/companyId\s*=\s*integration\.companyId/.test(xeroWebhookSource)
  ) {
    contractFailures.push(
      "Xero webhook route must fail closed without a configured secret, verify x-xero-signature with timing-safe comparison, and derive companyId from the matched integration before service-client work."
    );
  }

  if (
    !/getAccountingIntegrationByCompany[\s\S]*\.eq\("id",\s*provider\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      accountingIntegrationService
    ) ||
    !/getAccountingIntegrationByTenant[\s\S]*\.eq\("id",\s*provider\)[\s\S]*\.eq\("metadata->credentials->>tenantId",\s*tenantId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      accountingIntegrationService
    ) ||
    !/async function requireActiveCompany[\s\S]*\.from\("company"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("id",\s*companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      accountingIntegrationService
    ) ||
    !/getAccountingIntegrationByCompany[\s\S]*await requireActiveCompany\(client,\s*companyId,\s*`company \$\{companyId\}`\)/.test(
      accountingIntegrationService
    ) ||
    !/getAccountingIntegrationByTenant[\s\S]*await requireActiveCompany\([\s\S]*client,[\s\S]*integration\.data\.companyId,[\s\S]*`tenant \$\{tenantId\}`/.test(
      accountingIntegrationService
    ) ||
    !/onTokenRefresh[\s\S]*\.from\("companyIntegration"\)[\s\S]*\.update\(\{ metadata:[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("id",\s*provider\)[\s\S]*\.eq\("active",\s*true\)/.test(
      accountingIntegrationService
    ) ||
    /\.or\(\s*`companyId\.eq\./.test(accountingIntegrationService)
  ) {
    contractFailures.push(
      "Accounting integration lookup must keep company-scoped job/request lookups separate from tenant-scoped Xero webhook lookup and fail closed on inactive integrations or inactive companies."
    );
  }

  if (
    !/paperless-parts-signature/.test(paperlessWebhookSource) ||
    !/function signaturesMatch/.test(paperlessWebhookSource) ||
    !/crypto\.timingSafeEqual/.test(paperlessWebhookSource) ||
    !/getIntegration\(\s*serviceClient,\s*"paperless-parts",\s*companyId\s*\)/.test(
      paperlessWebhookSource
    ) ||
    !/!paperlessPartsIntegration\.data\.active/.test(
      paperlessWebhookSource
    ) ||
    !/trigger\("paperless-parts",\s*\{[\s\S]*apiKey[\s\S]*companyId[\s\S]*payload/.test(
      paperlessWebhookSource
    )
  ) {
    contractFailures.push(
      "Paperless Parts webhook route must verify the active integration HMAC signature with the company integration secret before triggering tenant-scoped background work."
    );
  }

  return [...routeFailures, ...contractFailures];
}

function accountingBackfillServiceClientScopeFailures() {
  const missing = [];
  const backfillRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/integrations.xero.backfill.ts"),
    "utf8"
  );
  const backfillJob = readFileSync(
    resolve(
      repoRoot,
      "packages/jobs/src/inngest/functions/integrations/accounting-backfill.ts"
    ),
    "utf8"
  );

  if (
    !/const\s*\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\(\s*request,\s*\{[\s\S]*update:\s*"settings"[\s\S]*\}\s*\)/.test(
      backfillRoute
    ) ||
    !/\.from\("companyIntegration"\)[\s\S]*\.select\("\*"[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("id",\s*"xero"\)[\s\S]*\.single\(\)/.test(
      backfillRoute
    ) ||
    !/integration\.error\s*\|\|\s*!integration\.data\?\.active/.test(
      backfillRoute
    ) ||
    !/trigger\("accounting-backfill",\s*\{[\s\S]*companyId,[\s\S]*provider:\s*ProviderID\.XERO/.test(
      backfillRoute
    )
  ) {
    missing.push(
      "Accounting backfill route must require settings update permission, verify the active Xero integration in the request company, and trigger with that companyId."
    );
  }

  const syncFactoryCompanyContext =
    backfillJob.match(/companyId:\s*payload\.companyId/g)?.length ?? 0;
  const mappingServiceCompanyContext =
    backfillJob.match(
      /createMappingService\(\s*database,\s*payload\.companyId\s*\)/g
    )?.length ?? 0;

  if (
    !/BackfillPayloadSchema[\s\S]*companyId:\s*z\.string\(\)[\s\S]*provider:\s*z\.nativeEnum\(ProviderID\)/.test(
      backfillJob
    ) ||
    !/getAccountingIntegration\(\s*client,\s*payload\.companyId,\s*payload\.provider\s*\)/.test(
      backfillJob
    ) ||
    !/getProviderIntegration\(\s*client,\s*payload\.companyId,\s*integration\.id,\s*integration\.metadata\s*\)/.test(
      backfillJob
    ) ||
    !/getAccountingIntegration\(\s*pullClient,\s*payload\.companyId,\s*payload\.provider\s*\)/.test(
      backfillJob
    ) ||
    !/getAccountingIntegration\(\s*pushClient,\s*payload\.companyId,\s*payload\.provider\s*\)/.test(
      backfillJob
    ) ||
    syncFactoryCompanyContext < 5 ||
    mappingServiceCompanyContext < 3
  ) {
    missing.push(
      "Accounting backfill job must carry payload.companyId through integration lookup, provider construction, mapping reads, and syncer writes."
    );
  }

  return missing;
}

function stripeBillingServiceClientScopeFailures() {
  const missing = [];
  const stripeServer = readFileSync(
    resolve(repoRoot, "packages/stripe/src/stripe.server.ts"),
    "utf8"
  );

  if (
    !/getStripeWebhookEvent\(\{ body,\s*signature \}\)/.test(stripeServer) ||
    !/stripe\.webhooks\.constructEvent\([\s\S]*process\.env\.STRIPE_WEBHOOK_SECRET/.test(
      stripeServer
    )
  ) {
    missing.push(
      "Stripe billing webhooks must verify Stripe's signed raw body before service-client billing updates."
    );
  }

  if (
    !/collectedTaxId[\s\S]*\.from\("company"\)[\s\S]*\.update\(\{\s*taxId:\s*collectedTaxId\s*\}\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      stripeServer
    )
  ) {
    missing.push(
      "Stripe checkout tax ID updates must be scoped to the checkout metadata company."
    );
  }

  if (
    !/const\s+companyPlan\s*=\s*await\s+serviceClient[\s\S]*\.from\("companyPlan"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("stripeCustomerId",\s*customer\)[\s\S]*\.maybeSingle\(\)/.test(
      stripeServer
    ) ||
    !/redis\.del\(`stripe:company:\$\{companyPlan\.data\.id\}`\)/.test(
      stripeServer
    ) ||
    !/\.from\("companyPlan"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*companyPlan\.data\.id\)[\s\S]*\.eq\("stripeCustomerId",\s*customer\)/.test(
      stripeServer
    )
  ) {
    missing.push(
      "Stripe subscription deletion must resolve the Carbon company and delete companyPlan by both company ID and Stripe customer ID."
    );
  }

  if (
    !/\.from\("companyPlan"\)[\s\S]*\.select\("stripeCustomerId"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      stripeServer
    ) ||
    !/\.from\("companyPlan"\)[\s\S]*\.select\("\*"[\s\S]*\.eq\("stripeCustomerId",\s*customerId\)/.test(
      stripeServer
    )
  ) {
    missing.push(
      "Stripe customer cache fallbacks must resolve companyPlan through explicit company or Stripe customer keys."
    );
  }

  if (
    !/const\s+companyPlanData:\s*TableInsert<"companyPlan">[\s\S]*id:\s*companyId[\s\S]*stripeCustomerId:\s*customerId[\s\S]*upsertCompanyPlan\(serviceClient,\s*companyPlanData\)/.test(
      stripeServer
    )
  ) {
    missing.push(
      "Stripe subscription sync must upsert companyPlan rows with the resolved company ID and Stripe customer ID."
    );
  }

  if (
    /plan!inner|\.{3}user\(email\)/.test(stripeServer) ||
    !/\.from\("companyPlan"\)[\s\S]*\.select\("stripeSubscriptionId, planId"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      stripeServer
    ) ||
    !/\.from\("plan"\)[\s\S]*\.select\("userBasedPricing"\)[\s\S]*\.eq\("id",\s*planId\)/.test(
      stripeServer
    ) ||
    !/\.from\("userToCompany"\)[\s\S]*\.select\("userId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      stripeServer
    ) ||
    !/\.from\("user"\)[\s\S]*\.select\("id, email"\)[\s\S]*\.in\("id",\s*userIds\)/.test(
      stripeServer
    )
  ) {
    missing.push(
      "Stripe user-based quantity updates must count users through explicit company-scoped membership and user reads instead of embedded selectors."
    );
  }

  return missing;
}

function publicModelFileAccessFailures() {
  const modelRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/model+/$id.tsx"),
    "utf8"
  );
  const publicRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/model+/public.$.tsx"),
    "utf8"
  );
  const accessHelper = readFileSync(
    resolve(repoRoot, "apps/erp/app/utils/modelAccess.server.ts"),
    "utf8"
  );
  const thumbnailTask = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/tasks/model-thumbnail.ts"),
    "utf8"
  );
  const modelUploadRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/model.upload.ts"),
    "utf8"
  );
  const missing = [];

  if (
    !/requireModelAccess\s*\(\s*request\s*,\s*model\.data\.companyId\s*\)/.test(
      modelRoute
    ) ||
    !/getCarbonServiceClient\s*\(/.test(modelRoute) ||
    !/modelUrl/.test(modelRoute)
  ) {
    missing.push(
      "CAD model page must authorize by Better Auth company scope or thumbnail token before returning service-client model data."
    );
  }

  if (
    !/requireModelAccess\s*\(\s*request\s*,\s*companyId\s*\)/.test(
      publicRoute
    ) ||
    !/downloadObject/.test(publicRoute)
  ) {
    missing.push(
      "Public CAD model object route must authorize by Better Auth company scope or thumbnail token before direct S3 download."
    );
  }

  if (
    !/THUMBNAIL_SERVICE_TOKEN/.test(accessHelper) ||
    !/requirePermissions\s*\(\s*request\s*,\s*\{\s*\}\s*\)/.test(
      accessHelper
    ) ||
    !/timingSafeEqual/.test(accessHelper)
  ) {
    missing.push(
      "CAD model access helper must support Better Auth company scope and timing-safe thumbnail token validation."
    );
  }

  if (
    !/THUMBNAIL_SERVICE_TOKEN/.test(thumbnailTask) ||
    !/token=\$\{encodeURIComponent\(THUMBNAIL_SERVICE_TOKEN\)\}/.test(
      thumbnailTask
    ) ||
    !/\.from\("modelUpload"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("id",\s*modelId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.single\(\)[\s\S]*Skipping model-thumbnail task[\s\S]*const\s+url\s*=\s*getModelUrl\(modelId\)/.test(
      thumbnailTask
    ) ||
    !/\.from\("modelUpload"\)[\s\S]*\.update\(\{[\s\S]*thumbnailPath[\s\S]*\.eq\("id",\s*modelId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      thumbnailTask
    )
  ) {
    missing.push(
      "Model thumbnail task must pass the thumbnail-service token through the render URL only after checking event company ownership and must scope thumbnail writes by company."
    );
  }

  if (
    !/requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"parts"\s*\}\s*\)/.test(
      modelUploadRoute
    ) ||
    !/modelPath\.startsWith\(`\$\{companyId\}\/models\/`\)/.test(
      modelUploadRoute
    )
  ) {
    missing.push(
      "Model upload API must require Better Auth parts update permission and reject model paths outside the request company."
    );
  }

  for (const [table, idName] of [
    ["item", "itemId"],
    ["salesRfqLine", "salesRfqLineId"],
    ["quoteLine", "quoteLineId"],
    ["salesOrderLine", "salesOrderLineId"],
    ["job", "jobId"],
  ]) {
    const pattern = new RegExp(
      `\\.from\\("${table}"\\)[\\s\\S]*\\.update\\(\\{\\s*modelUploadId:\\s*modelId\\s*\\}\\)[\\s\\S]*\\.eq\\("id",\\s*${idName}\\)[\\s\\S]*\\.eq\\("companyId",\\s*companyId\\)`
    );
    if (!pattern.test(modelUploadRoute)) {
      missing.push(
        `Model upload API must bind ${table} modelUploadId updates to the request company.`
      );
    }
  }

  return missing;
}

function filePdfRequestScopeFailures() {
  const missing = [];
  const requestScopedPdfRoutes = [
    "apps/erp/app/routes/file+/issue+/$id[.]pdf.tsx",
    "apps/erp/app/routes/file+/shipment+/$id[.]pdf.tsx",
    "apps/erp/app/routes/file+/traveler+/$id[.]pdf.tsx",
    "apps/erp/app/routes/file+/job+/$jobId.traveler[.]pdf.tsx",
  ];

  for (const file of requestScopedPdfRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (
      /job\(jobId\)|jobOperationStepRecord\(\*\)|modelUpload\(thumbnailPath\)|\.\.\.item\(itemType:type\)|salesInvoiceShipment\(\*\)/.test(
        source
      )
    ) {
      missing.push(
        `${file} must use explicit direct-query reads instead of Supabase/PostgREST relation selectors.`
      );
    }
    if (/getCarbonServiceClient\s*\(/.test(source)) {
      missing.push(
        `${file} must use the request-scoped Better Auth client, not carbon_service.`
      );
    }
    if (!/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request/.test(source)) {
      missing.push(
        `${file} must bind client and companyId from requirePermissions(request, ...).`
      );
    }
  }

  const issuePdf = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/issue+/$id[.]pdf.tsx"),
    "utf8"
  );
  if (
    !/\.from\("jobOperationStep"\)[\s\S]*\.select\("id, name, nonConformanceActionId, operationId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      issuePdf
    ) ||
    !/\.from\("jobOperationStepRecord"\)[\s\S]*\.select\("\*"\)[\s\S]*\.in\("jobOperationStepId",\s*stepIds\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      issuePdf
    ) ||
    !/\.from\("jobOperation"\)[\s\S]*\.select\("id, jobId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      issuePdf
    ) ||
    !/\.from\("job"\)[\s\S]*\.select\("id, jobId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      issuePdf
    )
  ) {
    missing.push(
      "Issue PDF route must load job-operation records and job readable IDs with explicit company-scoped reads."
    );
  }

  const shipmentPdf = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/shipment+/$id[.]pdf.tsx"),
    "utf8"
  );
  if (
    !/getShipment\(\s*client,\s*id,\s*companyId\s*\)/.test(shipmentPdf) ||
    !/getShipmentLinesWithDetails\(\s*client,\s*id,\s*companyId\s*\)/.test(
      shipmentPdf
    ) ||
    !/shipment\.data\.companyId\s*!==\s*companyId/.test(shipmentPdf) ||
    !/getSalesOrder\(\s*client,\s*shipment\.data\.sourceDocumentId,\s*companyId\s*\)/.test(
      shipmentPdf
    ) ||
    !/getPurchaseOrder\(\s*client,\s*shipment\.data\.sourceDocumentId,\s*companyId\s*\)/.test(
      shipmentPdf
    ) ||
    !/getShipmentTracking\(\s*client,\s*shipment\.data\.id,\s*companyId\s*\)/.test(
      shipmentPdf
    ) ||
    !/\.from\("salesInvoice"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      shipmentPdf
    ) ||
    !/\.from\("salesInvoiceShipment"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("id",\s*salesInvoice\.data\?\.id\s*\?\?\s*""\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.maybeSingle\(\)/.test(
      shipmentPdf
    ) ||
    occurrences(shipmentPdf, '.eq("companyId", companyId)') < 2
  ) {
    missing.push(
      "Shipment PDF route must keep shipment, line, tracking, source-document, and customer/supplier reads company-scoped on the request client."
    );
  }

  const travelerPdf = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/traveler+/$id[.]pdf.tsx"),
    "utf8"
  );
  if (
    !/getJobMakeMethodById\(\s*client,\s*id,\s*companyId\s*\)/.test(
      travelerPdf
    ) ||
    !/getJob\(\s*client,\s*jobMakeMethod\.data\?\.jobId\s*\?\?\s*"",\s*companyId\s*\)/.test(
      travelerPdf
    ) ||
    !/job\.data\.companyId\s*!==\s*companyId/.test(travelerPdf) ||
    !/getJobOperationsByMethodId\(\s*client,\s*id,\s*companyId\s*\)/.test(
      travelerPdf
    ) ||
    !/getTrackedEntityByJobId\(\s*[\s\S]*client,\s*[\s\S]*job\.data\.id!,\s*[\s\S]*companyId/.test(
      travelerPdf
    ) ||
    !/\.from\("modelUpload"\)[\s\S]*\.select\("thumbnailPath"\)[\s\S]*\.eq\("id",\s*item\.data\.modelUploadId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      travelerPdf
    ) ||
    occurrences(travelerPdf, '.eq("companyId", companyId)') < 2
  ) {
    missing.push(
      "Single-method traveler PDF route must read through the request client and company-scope customer/item lookups."
    );
  }

  const jobTravelerPdf = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/job+/$jobId.traveler[.]pdf.tsx"),
    "utf8"
  );
  if (
    !/getJob\(\s*client,\s*jobId,\s*companyId\s*\)/.test(jobTravelerPdf) ||
    !/job\.data\.companyId\s*!==\s*companyId/.test(jobTravelerPdf) ||
    !/\.from\("jobMakeMethod"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      jobTravelerPdf
    ) ||
    !/getJobOperationsByMethodId\(\s*client,\s*makeMethod\.id,\s*companyId\s*\)/.test(
      jobTravelerPdf
    ) ||
    !/getTrackedEntityByJobId\(\s*[\s\S]*client,\s*[\s\S]*job\.data!\.id!,\s*[\s\S]*companyId/.test(
      jobTravelerPdf
    ) ||
    !/\.from\("modelUpload"\)[\s\S]*\.select\("thumbnailPath"\)[\s\S]*\.eq\("id",\s*item\.data\.modelUploadId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      jobTravelerPdf
    ) ||
    occurrences(jobTravelerPdf, '.eq("companyId", companyId)') < 3
  ) {
    missing.push(
      "Full-job traveler PDF route must verify job company and company-scope make-method/customer/item lookups."
    );
  }

  return missing;
}

function qualityIssueRouteRequestScopeFailures() {
  const missing = [];
  const qualityService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/quality/quality.service.ts"),
    "utf8"
  );
  const issueRoutes = [
    "apps/erp/app/routes/x+/issue+/new.tsx",
    "apps/erp/app/routes/x+/issue+/$id.close.tsx",
    "apps/erp/app/routes/x+/issue+/update.tsx",
  ];

  for (const file of issueRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the request-scoped Better Auth client, not carbon_service.`
      );
    }
  }

  if (
    /nonConformance\(\*\)|nonConformance\(id,nonConformanceId\)|\.\.\.item\(name\)|salesOrder\(salesOrderId\)/.test(
      qualityService
    ) ||
    !/function\s+getIssueFromExternalLink\([\s\S]*\.from\("nonConformanceSupplier"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("nonConformance"\)[\s\S]*\.eq\("id",\s*supplierIssue\.data\.nonConformanceId\)[\s\S]*\.eq\("companyId",\s*supplierIssue\.data\.companyId\)/.test(
      qualityService
    ) ||
    !/function\s+getIssueAction\([\s\S]*\.from\("nonConformanceActionTask"\)[\s\S]*\.select\("id,notes,nonConformanceId,companyId"\)[\s\S]*\.from\("nonConformance"\)[\s\S]*\.select\("id, nonConformanceId"\)[\s\S]*\.eq\("companyId",\s*action\.data\.companyId\)/.test(
      qualityService
    ) ||
    !/function\s+getIssueItems\([\s\S]*\.from\("nonConformanceItem"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      qualityService
    ) ||
    !/\.from\("salesOrderLine"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("salesOrder"\)[\s\S]*\.select\("salesOrderId"\)[\s\S]*\.eq\("companyId",\s*nonConformance\.companyId\)/.test(
      qualityService
    )
  ) {
    missing.push(
      "Quality issue helpers must load parent issue, item, and sales-order metadata through explicit company-scoped reads instead of embedded selectors."
    );
  }

  const newIssue = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/issue+/new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"quality"/.test(
      newIssue
    ) ||
    !/getNextSequence\(\s*client,\s*"nonConformance",\s*companyId\s*\)/.test(
      newIssue
    ) ||
    !/upsertIssue\(\s*client,\s*\{/.test(newIssue) ||
    !/deleteIssue\(\s*client,\s*ncrId\s*\)/.test(newIssue) ||
    /notifyIssueCreated\(\s*\{\s*client,\s*serviceClient/.test(newIssue)
  ) {
    missing.push(
      "Issue creation route must keep sequence, issue insert cleanup, and notifications on the request-scoped quality client."
    );
  }

  const closeIssue = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/issue+/$id.close.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"quality"/.test(
      closeIssue
    ) ||
    !/closeIssue\(\s*client,\s*\{[\s\S]*nonConformanceId:\s*id,[\s\S]*companyId,[\s\S]*userId/.test(
      closeIssue
    )
  ) {
    missing.push(
      "Issue close route must run disposition closure through the request-scoped quality client."
    );
  }

  const updateIssue = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/issue+/update.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"quality"/.test(
      updateIssue
    ) ||
    occurrences(updateIssue, '.eq("companyId", companyId)') < 3
  ) {
    missing.push(
      "Issue bulk update route must use the request client and company-scope issue reads and writes."
    );
  }

  const issueItemRoutes = [
    "apps/erp/app/routes/x+/issue+/item+/split.tsx",
    "apps/erp/app/routes/x+/issue+/item+/assign-entities.tsx",
    "apps/erp/app/routes/x+/issue+/item+/update.tsx",
  ];
  for (const file of issueItemRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (
      /nonConformance\(status\)/.test(source) ||
      !/\.from\("nonConformanceItem"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
        source
      ) ||
      !/\.from\("nonConformance"\)[\s\S]*\.select\("status"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
        source
      )
    ) {
      missing.push(
        `${file} must check issue lock status through an explicit company-scoped nonConformance read instead of an embedded selector.`
      );
    }
  }

  return missing;
}

function inventoryTransferRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/stock-transfer+/new.tsx",
    "apps/erp/app/routes/x+/stock-transfer+/$id.status.tsx",
    "apps/erp/app/routes/x+/warehouse-transfer+/$transferId.status.tsx",
    "apps/erp/app/routes/x+/warehouse-transfer+/$transferId.update.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the request-scoped Better Auth client for inventory transfer status/rule work.`
      );
    }
  }

  const stockTransferNew = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/stock-transfer+/new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"inventory"/.test(
      stockTransferNew
    ) ||
    !/evaluateLinesForSurface\(\s*\{\s*client,\s*companyId,\s*userId,[\s\S]*surface:\s*"stockTransfer"/.test(
      stockTransferNew
    )
  ) {
    missing.push(
      "Stock transfer creation must evaluate item rules on the request-scoped inventory client."
    );
  }

  const stockTransferStatus = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/stock-transfer+/$id.status.tsx"),
    "utf8"
  );
  if (
    !/\.from\("stockTransferLine"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      stockTransferStatus
    ) ||
    !/evaluateLinesForSurface\(\s*\{\s*client,\s*companyId,\s*userId,[\s\S]*surface:\s*"stockTransfer"/.test(
      stockTransferStatus
    ) ||
    !/updateStockTransferStatus\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*updatedBy:\s*userId/.test(
      stockTransferStatus
    )
  ) {
    missing.push(
      "Stock transfer status route must company-scope rule reads and status writes through the request client."
    );
  }

  const warehouseTransferStatus = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/warehouse-transfer+/$transferId.status.tsx"
    ),
    "utf8"
  );
  if (
    !/\.from\("warehouseTransferLine"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      warehouseTransferStatus
    ) ||
    !/evaluateLinesForSurface\(\s*\{\s*client,\s*companyId,\s*userId,[\s\S]*surface:\s*"warehouseTransfer"/.test(
      warehouseTransferStatus
    ) ||
    !/updateWarehouseTransferStatus\([\s\S]*userId,\s*companyId\s*\)/.test(
      warehouseTransferStatus
    )
  ) {
    missing.push(
      "Warehouse transfer status route must company-scope rule reads and status writes through the request client."
    );
  }

  const warehouseTransferUpdate = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/warehouse-transfer+/$transferId.update.tsx"
    ),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"inventory"/.test(
      warehouseTransferUpdate
    ) ||
    !/updateWarehouseTransferStatus\([\s\S]*userId,\s*companyId\s*\)/.test(
      warehouseTransferUpdate
    )
  ) {
    missing.push(
      "Warehouse transfer update route must pass companyId into the status helper."
    );
  }

  const inventoryService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/inventory/inventory.service.ts"),
    "utf8"
  );
  if (
    !/companyId\?:\s*string[\s\S]*return\s+companyId\s*\?\s*update\.eq\("companyId",\s*companyId\)\s*:\s*update/.test(
      inventoryService
    )
  ) {
    missing.push(
      "Inventory transfer status helpers must support companyId filters for request-scoped writes."
    );
  }

  return missing;
}

function inventoryItemRuleRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/inventory+/quantities+/$itemId.adjustment.tsx",
    "apps/erp/app/routes/x+/receipt+/$receiptId.post.tsx",
    "apps/erp/app/routes/x+/shipment+/$shipmentId.post.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the request-scoped Better Auth client for item-rule preflight reads.`
      );
    }
  }

  const adjustment = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/inventory+/quantities+/$itemId.adjustment.tsx"
    ),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"inventory"/.test(
      adjustment
    ) ||
    !/evaluateLinesForSurface\(\s*\{\s*client,\s*companyId,\s*userId,[\s\S]*surface:\s*"inventoryAdjustment"/.test(
      adjustment
    )
  ) {
    missing.push(
      "Inventory adjustment route must evaluate item rules on the request-scoped inventory client."
    );
  }

  const receiptPost = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/receipt+/$receiptId.post.tsx"),
    "utf8"
  );
  if (
    !/\.from\("receiptLine"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      receiptPost
    ) ||
    !/\.from\("receipt"\)[\s\S]*\.select\("sourceDocument"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      receiptPost
    ) ||
    !/evaluateLinesForSurface\(\s*\{\s*client,\s*companyId,\s*userId,[\s\S]*surface,/.test(
      receiptPost
    ) ||
    occurrences(receiptPost, '.eq("companyId", companyId)') < 5
  ) {
    missing.push(
      "Receipt posting route must use request-scoped, company-filtered reads/writes around item-rule preflight and pending/draft status changes."
    );
  }

  const shipmentPost = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shipment+/$shipmentId.post.tsx"),
    "utf8"
  );
  if (
    !/\.from\("shipmentLine"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      shipmentPost
    ) ||
    !/\.from\("shipment"\)[\s\S]*\.select\("sourceDocument"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      shipmentPost
    ) ||
    !/evaluateLinesForSurface\(\s*\{\s*client,\s*companyId,\s*userId,[\s\S]*surface,/.test(
      shipmentPost
    ) ||
    !/upsertDocument\(\s*client,\s*\{/.test(shipmentPost) ||
    occurrences(shipmentPost, '.eq("companyId", companyId)') < 8
  ) {
    missing.push(
      "Shipment posting route must use request-scoped, company-filtered reads/writes around item-rule preflight, expired-batch checks, PDF document creation, and pending/draft status changes."
    );
  }

  return missing;
}

function inventoryDocumentCreateRouteFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/receipt+/new.tsx",
    "apps/erp/app/routes/x+/shipment+/new.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must not instantiate carbon_service for request-owned inventory document creation.`
      );
    }
    if (
      !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"inventory"/.test(
        source
      ) ||
      !/invokeFunction<\{\s*id:\s*string;\s*\}>\("create",/.test(source)
    ) {
      missing.push(
        `${file} must create inventory documents through explicit function dispatch after create:inventory auth.`
      );
    }
  }

  return missing;
}

function inventoryLineMutationRouteFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/receipt+/lines.split.tsx",
    "apps/erp/app/routes/x+/shipment+/lines.split.tsx",
    "apps/erp/app/routes/x+/receipt+/lines.tracking.tsx",
    "apps/erp/app/routes/x+/shipment+/lines.tracking.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for inventory line split/tracking work.`
      );
    }
  }

  const receiptSplit = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/receipt+/lines.split.tsx"),
    "utf8"
  );
  if (
    !/\.from\("receiptLine"\)[\s\S]*\.eq\("id",\s*documentLineId\)[\s\S]*receiptLine\.data\.companyId\s*!==\s*companyId/.test(
      receiptSplit
    ) ||
    !/invokeFunction<\{\s*id:\s*string;\s*\}>\("create",[\s\S]*type:\s*"receiptLineSplit"[\s\S]*companyId,[\s\S]*userId:\s*userId/.test(
      receiptSplit
    )
  ) {
    missing.push(
      "Receipt line split route must verify the line company and dispatch the split with request-scoped company/user context."
    );
  }

  const shipmentSplit = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shipment+/lines.split.tsx"),
    "utf8"
  );
  if (
    !/\.from\("shipmentLine"\)[\s\S]*\.eq\("id",\s*documentLineId\)[\s\S]*shipmentLine\.data\.companyId\s*!==\s*companyId/.test(
      shipmentSplit
    ) ||
    !/invokeFunction<\{\s*id:\s*string;\s*\}>\("create",[\s\S]*type:\s*"shipmentLineSplit"[\s\S]*companyId,[\s\S]*userId:\s*userId/.test(
      shipmentSplit
    )
  ) {
    missing.push(
      "Shipment line split route must verify the line company and dispatch the split with request-scoped company/user context."
    );
  }

  const receiptTracking = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/receipt+/lines.tracking.tsx"),
    "utf8"
  );
  if (
    !/\.from\("receiptLine"\)[\s\S]*\.eq\("id",\s*receiptLineId\)[\s\S]*\.eq\("receiptId",\s*receiptId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      receiptTracking
    ) ||
    !/client\.rpc\(\s*"update_receipt_line_batch_tracking"/.test(
      receiptTracking
    ) ||
    !/client\.rpc\(\s*"update_receipt_line_serial_tracking"/.test(
      receiptTracking
    )
  ) {
    missing.push(
      "Receipt line tracking route must verify receipt-line company scope and call tracking RPCs through the request client."
    );
  }

  const shipmentTracking = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shipment+/lines.tracking.tsx"),
    "utf8"
  );
  if (
    !/\.from\("trackedEntity"\)[\s\S]*\.eq\("id",\s*trackedEntityId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.single\(\)/.test(
      shipmentTracking
    ) ||
    occurrences(shipmentTracking, '.eq("companyId", companyId)') < 3 ||
    !/\.eq\("status",\s*"Available"\)/.test(shipmentTracking)
  ) {
    missing.push(
      "Shipment line tracking route must keep tracked-entity reads and writes request-scoped, company-filtered, and status-guarded."
    );
  }

  return missing;
}

function receiptTrackingRpcScopeFailures() {
  const missing = [];
  const receiptTrackingRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0014_receipt_tracking_rpcs.sql"),
    "utf8"
  );
  const receiptTrackingRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/receipt+/lines.tracking.tsx"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+resolve_shelf_life_start_for_receipt\(\s*p_item_id\s+text,\s*p_receipt_id\s+text,\s*p_company_id\s+text/.test(
      receiptTrackingRpcs
    ) ||
    !/FROM\s+"itemShelfLife"[\s\S]*"itemId"\s*=\s*p_item_id[\s\S]*"companyId"\s*=\s*p_company_id/.test(
      receiptTrackingRpcs
    ) ||
    !/FROM\s+"receipt"[\s\S]*id\s*=\s*p_receipt_id[\s\S]*"companyId"\s*=\s*p_company_id/.test(
      receiptTrackingRpcs
    )
  ) {
    missing.push(
      "Receipt shelf-life helper must require company scope for item shelf-life and receipt reads."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+update_receipt_line_batch_tracking\(\s*p_company_id\s+text,\s*p_receipt_line_id\s+text,\s*p_receipt_id\s+text/.test(
      receiptTrackingRpcs
    ) ||
    !/p_company_id\s*=\s*ANY\(app_companies_for_context\(\)\)/.test(
      receiptTrackingRpcs
    ) ||
    !/JOIN\s+"receipt"\s+r[\s\S]*r\."companyId"\s*=\s*p_company_id[\s\S]*r\.id\s*=\s*p_receipt_id/.test(
      receiptTrackingRpcs
    ) ||
    !/JOIN\s+"item"\s+i[\s\S]*i\."companyId"\s*=\s*p_company_id/.test(
      receiptTrackingRpcs
    ) ||
    !/WHERE\s+rl\.id\s*=\s*p_receipt_line_id[\s\S]*rl\."companyId"\s*=\s*p_company_id[\s\S]*rl\."receiptId"\s*=\s*p_receipt_id/.test(
      receiptTrackingRpcs
    ) ||
    !/Tracked entity belongs to a different company/.test(receiptTrackingRpcs) ||
    !/ON\s+CONFLICT\s*\(id\)\s+DO\s+UPDATE[\s\S]*WHERE\s+"trackedEntity"\."companyId"\s*=\s*p_company_id/.test(
      receiptTrackingRpcs
    )
  ) {
    missing.push(
      "Receipt batch tracking RPC must require company scope, verify receipt/line/item scope, and reject cross-company tracked entity updates."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+update_receipt_line_serial_tracking\(\s*p_company_id\s+text,\s*p_receipt_line_id\s+text,\s*p_receipt_id\s+text/.test(
      receiptTrackingRpcs
    ) ||
    !/JOIN\s+"receipt"\s+r[\s\S]*r\."companyId"\s*=\s*p_company_id[\s\S]*r\.id\s*=\s*p_receipt_id/.test(
      receiptTrackingRpcs
    ) ||
    !/JOIN\s+"item"\s+i[\s\S]*i\."companyId"\s*=\s*p_company_id/.test(
      receiptTrackingRpcs
    ) ||
    !/resolve_shelf_life_start_for_receipt\(v_item_id,\s*p_receipt_id,\s*p_company_id\)/.test(
      receiptTrackingRpcs
    ) ||
    !/WHERE\s+id\s*=\s*p_tracked_entity_id[\s\S]*AND\s+"companyId"\s*=\s*p_company_id[\s\S]*GET\s+DIAGNOSTICS\s+v_rows\s*=\s*ROW_COUNT/.test(
      receiptTrackingRpcs
    )
  ) {
    missing.push(
      "Receipt serial tracking RPC must require company scope, resolve shelf life by company, and only update same-company tracked entities."
    );
  }

  if (
    !/client\.rpc\(\s*"update_receipt_line_batch_tracking",\s*\{[\s\S]*p_company_id:\s*companyId/.test(
      receiptTrackingRoute
    ) ||
    !/client\.rpc\(\s*"update_receipt_line_serial_tracking",\s*\{[\s\S]*p_company_id:\s*companyId/.test(
      receiptTrackingRoute
    )
  ) {
    missing.push(
      "Receipt tracking route must pass the Better Auth request company into receipt tracking RPCs."
    );
  }

  return missing;
}

function purchasedPriceRpcScopeFailures() {
  const missing = [];
  const purchasedPriceRpc = readFileSync(
    resolve(
      repoRoot,
      "packages/database/drizzle/0026_purchased_price_function_rpc.sql"
    ),
    "utf8"
  );
  const functionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/functions.$name.ts"),
    "utf8"
  );
  const jobCompletionSmoke = readFileSync(
    resolve(repoRoot, "packages/database/scripts/smoke-job-completion.mjs"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+update_purchased_prices\([\s\S]*p_company_id\s+text/.test(
      purchasedPriceRpc
    ) ||
    !/IF\s+p_company_id\s+IS\s+NULL\s+OR\s+p_company_id\s*=\s*''[\s\S]*RAISE\s+EXCEPTION\s+'companyId is required'/.test(
      purchasedPriceRpc
    ) ||
    !/session_user\s*=\s*'carbon_app'[\s\S]*p_company_id\s*=\s*ANY\(app_companies_for_context\(\)\)/.test(
      purchasedPriceRpc
    ) ||
    !/NULLIF\(app_uid\(\),\s*''\)/.test(purchasedPriceRpc)
  ) {
    missing.push(
      "Purchased-price RPC must require company scope, gate carbon_app by Better Auth company context, and avoid blank app_uid audit actors."
    );
  }

  if (
    !/FROM\s+"purchaseOrder"[\s\S]*WHERE\s+id\s*=\s*p_purchase_order_id[\s\S]*"companyId"\s*=\s*p_company_id/.test(
      purchasedPriceRpc
    ) ||
    !/FROM\s+"purchaseOrderLine"[\s\S]*WHERE\s+"purchaseOrderId"\s*=\s*p_purchase_order_id[\s\S]*"companyId"\s*=\s*p_company_id/.test(
      purchasedPriceRpc
    ) ||
    !/FROM\s+"purchaseInvoice"[\s\S]*WHERE\s+id\s*=\s*p_invoice_id[\s\S]*"companyId"\s*=\s*p_company_id/.test(
      purchasedPriceRpc
    ) ||
    !/FROM\s+"purchaseInvoiceLine"[\s\S]*WHERE\s+"invoiceId"\s*=\s*p_invoice_id[\s\S]*"companyId"\s*=\s*p_company_id/.test(
      purchasedPriceRpc
    )
  ) {
    missing.push(
      "Purchased-price RPC must scope purchase order/invoice headers and lines to p_company_id."
    );
  }

  if (
    !/p_company_id:\s*payload\.companyId/.test(functionRoute) ||
    !/case\s+"update-purchased-prices":[\s\S]*handleUpdatePurchasedPrices/.test(
      functionRoute
    )
  ) {
    missing.push(
      "Function route must pass explicit company scope into update_purchased_prices."
    );
  }

  if (
    !/psqlApp\(purchasedPriceAppScopeSql\(\)/.test(jobCompletionSmoke) ||
    !/update_purchased_prices\('purchaseOrder',\s*'po1',\s*NULL,\s*'co1',\s*false,\s*false\)/.test(
      jobCompletionSmoke
    ) ||
    !/update_purchased_prices\('purchaseOrder',\s*'po1',\s*NULL,\s*'co2',\s*false,\s*false\)/.test(
      jobCompletionSmoke
    ) ||
    !/Insufficient permissions/.test(jobCompletionSmoke)
  ) {
    missing.push(
      "Job-completion smoke must verify purchased-price RPC allows in-company carbon_app calls and rejects out-of-company Better Auth context."
    );
  }

  return missing;
}

function inventoryInvoicingRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/receipt+/$receiptId.tsx",
    "apps/erp/app/routes/x+/receipt+/$receiptId.details.tsx",
    "apps/erp/app/routes/x+/shipment+/$shipmentId.tsx",
    "apps/erp/app/routes/x+/shipment+/$shipmentId.details.tsx",
    "apps/erp/app/routes/x+/shipment+/$shipmentId.void.tsx",
    "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.tsx",
    "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.post.tsx",
    "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.void.tsx",
    "apps/erp/app/routes/x+/sales-invoice+/new.tsx",
    "apps/erp/app/routes/x+/purchase-invoice+/$invoiceId.post.tsx",
    "apps/erp/app/routes/x+/purchase-invoice+/new.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients after protected-route authorization.`
      );
    }
  }

  const receiptRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/receipt+/$receiptId.tsx"),
    "utf8"
  );
  const inventoryService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/inventory/inventory.service.ts"),
    "utf8"
  );
  const mcpInventoryTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/inventory.ts"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"inventory"/.test(
      receiptRoute
    ) ||
    !/getReceipt\(\s*client,\s*receiptId\s*\)/.test(receiptRoute) ||
    !/getReceiptLines\(\s*client,\s*receiptId\s*\)/.test(receiptRoute) ||
    !/getReceiptTracking\(\s*client,\s*receiptId,\s*companyId\s*\)/.test(
      receiptRoute
    ) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(receiptRoute)
  ) {
    missing.push(
      "Receipt detail loader must keep receipt reads/settings on the request-scoped inventory client."
    );
  }

  const receiptDetailsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/receipt+/$receiptId.details.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"inventory"/.test(
      receiptDetailsRoute
    ) ||
    !/getReceipt\(\s*client,\s*id\s*\)/.test(receiptDetailsRoute) ||
    !/invokeFunction<\{\s*id:\s*string;\s*\}>\("create",[\s\S]*companyId,[\s\S]*userId:\s*userId/.test(
      receiptDetailsRoute
    )
  ) {
    missing.push(
      "Receipt detail action must read through the request client and dispatch source-document regeneration with request company/user context."
    );
  }

  const shipmentDetailsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shipment+/$shipmentId.details.tsx"),
    "utf8"
  );
  const shipmentRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shipment+/$shipmentId.tsx"),
    "utf8"
  );
  if (
    /storageUnit\(name\)|trackedActivityInput\(trackedEntityId\)|fulfillment\(\*, job\(\*\)\)/.test(
      inventoryService
    ) ||
    !/function\s+getItemLedgerPage\([\s\S]*companyId:\s*string[\s\S]*\.from\("itemLedger"\)[\s\S]*\.select\("\*",\s*\{[\s\S]*count:\s*"exact"[\s\S]*\.from\("storageUnit"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      inventoryService
    ) ||
    !/function\s+getStockTransferTracking\([\s\S]*companyId:\s*string[\s\S]*\.from\("trackedActivity"\)[\s\S]*\.select\("id, attributes"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("trackedActivityInput"\)[\s\S]*\.select\("trackedActivityId, trackedEntityId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      inventoryService
    ) ||
    !/function\s+getShipmentLines\([\s\S]*shipmentId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("shipmentLines"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("fulfillment"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("job"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      inventoryService
    ) ||
    !/getShipmentLines\(\s*client,\s*shipmentId,\s*companyId\s*\)/.test(
      shipmentRoute
    ) ||
    !/getShipmentLines\([\s\S]*ctx\.client,[\s\S]*params\.shipmentId,[\s\S]*ctx\.companyId/.test(
      mcpInventoryTools
    )
  ) {
    missing.push(
      "Inventory ledger, stock-transfer tracking, and shipment-line helpers must resolve enriched rows through explicit company-scoped reads."
    );
  }

  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"inventory"/.test(
      shipmentDetailsRoute
    ) ||
    !/getShipment\(\s*client,\s*id\s*\)/.test(shipmentDetailsRoute) ||
    occurrences(shipmentDetailsRoute, "invokeFunction<{") < 3 ||
    occurrences(shipmentDetailsRoute, "companyId,") < 3
  ) {
    missing.push(
      "Shipment detail action must read through the request client and dispatch source-document regeneration with request company/user context."
    );
  }

  const shipmentVoidRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shipment+/$shipmentId.void.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"inventory"/.test(
      shipmentVoidRoute
    ) ||
    !/\.from\("shipment"\)[\s\S]*\.eq\("id",\s*shipmentId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      shipmentVoidRoute
    ) ||
    !/invokeFunction\(\s*"post-shipment",[\s\S]*type:\s*"void"[\s\S]*shipmentId:[\s\S]*userId:[\s\S]*companyId:/.test(
      shipmentVoidRoute
    )
  ) {
    missing.push(
      "Shipment void route must verify shipment company scope before dispatching a void with request company/user context."
    );
  }

  const salesInvoiceRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"invoicing"/.test(
      salesInvoiceRoute
    ) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(salesInvoiceRoute)
  ) {
    missing.push(
      "Sales invoice loader must keep company settings and invoice context reads on the request-scoped invoicing client."
    );
  }

  const salesInvoicePostRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.post.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}[\s\S]*requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"invoicing"/.test(
      salesInvoicePostRoute
    ) ||
    !/getSalesInvoice\(\s*client,\s*invoiceId\s*\)/.test(
      salesInvoicePostRoute
    ) ||
    !/upsertDocument\(\s*client,\s*\{/.test(salesInvoicePostRoute) ||
    !/getCompany\(\s*client,\s*companyId\s*\)/.test(salesInvoicePostRoute) ||
    !/getUser\(\s*client,\s*userId\s*\)/.test(salesInvoicePostRoute) ||
    !/uploadObject\(\{[\s\S]*companyId,[\s\S]*key:\s*documentFilePath/.test(
      salesInvoicePostRoute
    ) ||
    !/signDownload\(\{[\s\S]*companyId,[\s\S]*key:\s*documentFilePath/.test(
      salesInvoicePostRoute
    ) ||
    occurrences(salesInvoicePostRoute, '.eq("companyId", companyId)') < 2
  ) {
    missing.push(
      "Sales invoice posting route must keep invoice reads/document writes/email context on the request client and company-scope status transitions."
    );
  }

  const salesInvoiceVoidRoute = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.void.tsx"
    ),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"invoicing"/.test(
      salesInvoiceVoidRoute
    ) ||
    !/\.from\("salesInvoice"\)[\s\S]*\.eq\("id",\s*invoiceId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesInvoiceVoidRoute
    ) ||
    !/invokeFunction\(\s*"post-sales-invoice",[\s\S]*type:\s*"void"[\s\S]*invoiceId:[\s\S]*userId:[\s\S]*companyId:/.test(
      salesInvoiceVoidRoute
    )
  ) {
    missing.push(
      "Sales invoice void route must verify invoice company scope before dispatching a void with request company/user context."
    );
  }

  const salesInvoiceNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-invoice+/new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"invoicing"/.test(
      salesInvoiceNewRoute
    ) ||
    !/createSalesInvoiceFromSalesOrder\(\s*client,\s*sourceDocumentId,\s*companyId,\s*userId\s*\)/.test(
      salesInvoiceNewRoute
    ) ||
    !/createSalesInvoiceFromShipment\(\s*client,\s*sourceDocumentId,\s*companyId,\s*userId\s*\)/.test(
      salesInvoiceNewRoute
    )
  ) {
    missing.push(
      "Sales invoice creation from source documents must dispatch after create:invoicing auth using the request-scoped client context."
    );
  }

  const purchaseInvoicePostRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchase-invoice+/$invoiceId.post.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"invoicing"/.test(
      purchaseInvoicePostRoute
    ) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(
      purchaseInvoicePostRoute
    ) ||
    occurrences(purchaseInvoicePostRoute, '.eq("companyId", companyId)') < 4
  ) {
    missing.push(
      "Purchase invoice posting route must use request-scoped settings reads and company-scope pending/draft status transitions."
    );
  }

  const purchaseInvoiceNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchase-invoice+/new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"invoicing"/.test(
      purchaseInvoiceNewRoute
    ) ||
    !/createPurchaseInvoiceFromPurchaseOrder\(\s*client,\s*sourceDocumentId,\s*companyId,\s*userId\s*\)/.test(
      purchaseInvoiceNewRoute
    )
  ) {
    missing.push(
      "Purchase invoice creation from source documents must dispatch after create:invoicing auth using the request-scoped client context."
    );
  }

  return missing;
}

function purchasingRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/purchasing+/_index.tsx",
    "apps/erp/app/routes/x+/purchase-order+/$orderId.tsx",
    "apps/erp/app/routes/x+/purchase-order+/$orderId.finalize.tsx",
    "apps/erp/app/routes/x+/purchase-order+/$orderId.status.tsx",
    "apps/erp/app/routes/x+/purchase-order+/$orderId.delete.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected purchasing work.`
      );
    }
  }

  const dashboardRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchasing+/_index.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      dashboardRoute
    ) ||
    !/getPendingApprovalsForApprover\(\s*client,\s*userId,\s*companyId\s*\)/.test(
      dashboardRoute
    )
  ) {
    missing.push(
      "Purchasing dashboard must read pending approvals through the request-scoped purchasing client."
    );
  }

  const finalizeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchase-order+/$orderId.finalize.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"purchasing"/.test(
      finalizeRoute
    ) ||
    !/getPurchaseOrder\(\s*client,\s*orderId\s*\)/.test(finalizeRoute) ||
    !/isApprovalRequired\(\s*client,\s*"supplier",\s*companyId/.test(
      finalizeRoute
    ) ||
    !/createApprovalRequest\(\s*client,\s*\{/.test(finalizeRoute) ||
    !/updatePurchaseOrderStatus\(\s*client,\s*\{[\s\S]*companyId/.test(
      finalizeRoute
    ) ||
    !/upsertDocument\(\s*client,\s*\{/.test(finalizeRoute) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(finalizeRoute) ||
    !/signDownload\(\{[\s\S]*companyId,[\s\S]*key:\s*documentFilePath/.test(
      finalizeRoute
    )
  ) {
    missing.push(
      "Purchase-order finalize route must keep approval checks, status writes, document writes, and email context on the request client."
    );
  }

  const purchaseOrderRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchase-order+/$orderId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"purchasing"/.test(
      purchaseOrderRoute
    ) ||
    !/getLatestApprovalRequestForDocument\(\s*client,\s*"purchaseOrder",\s*orderId\s*\)/.test(
      purchaseOrderRoute
    ) ||
    !/canApproveRequest\(\s*client,\s*\{/.test(purchaseOrderRoute) ||
    !/upsertDocument\(\s*client,\s*\{/.test(purchaseOrderRoute) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(
      purchaseOrderRoute
    ) ||
    !/view:\s*"purchasing"[\s\S]*bypassRls:\s*true/.test(purchaseOrderRoute)
  ) {
    missing.push(
      "Purchase-order detail route must keep approval decision reads, document writes, and settings reads inside the authorized request boundary."
    );
  }

  const statusRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchase-order+/$orderId.status.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client:\s*viewClient,\s*companyId:\s*viewCompanyId\s*\}[\s\S]*requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      statusRoute
    ) ||
    !/\.from\("purchaseOrder"\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("companyId",\s*viewCompanyId\)/.test(
      statusRoute
    ) ||
    occurrences(statusRoute, '.eq("companyId", companyId)') < 4 ||
    !/canApproveRequest\(\s*client,\s*\{/.test(statusRoute) ||
    !/updatePurchaseOrderStatus\(\s*client,\s*\{[\s\S]*companyId/.test(
      statusRoute
    ) ||
    !/runMRP\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*userId/.test(statusRoute)
  ) {
    missing.push(
      "Purchase-order status route must company-scope current-status and approval updates, and dispatch MRP/status writes through the request client."
    );
  }

  const deleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchase-order+/$orderId.delete.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"purchasing"/.test(
      deleteRoute
    ) ||
    !/getPurchaseOrder\(\s*client,\s*orderId\s*\)/.test(deleteRoute) ||
    !/purchaseOrder\.data\.companyId\s*!==\s*companyId/.test(deleteRoute) ||
    !/getLatestApprovalRequestForDocument\(\s*client,\s*"purchaseOrder",\s*orderId\s*\)/.test(
      deleteRoute
    ) ||
    !/canApproveRequest\(\s*client,\s*\{/.test(deleteRoute) ||
    !/\.from\("approvalRequest"\)[\s\S]*\.eq\("documentId",\s*orderId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      deleteRoute
    )
  ) {
    missing.push(
      "Purchase-order delete route must verify company scope and cancel pending approval requests through the request client."
    );
  }

  const purchasingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/purchasing/purchasing.service.ts"),
    "utf8"
  );
  const mcpTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/purchasing.ts"),
    "utf8"
  );
  if (
    /supplier:supplierId\(id,\s*name\)/.test(purchasingService) ||
    !/function\s+getPurchasingRFQSuppliers\([\s\S]*\.from\("purchasingRfqSupplier"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("supplier"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.in\("id",\s*supplierIds\)[\s\S]*\.in\("companyId",\s*companyIds\)/.test(
      purchasingService
    ) ||
    !/function\s+getPurchasingRFQSuppliersWithLinks\([\s\S]*\.from\("purchasingRfqSupplier"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("supplier"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.in\("id",\s*supplierIds\)[\s\S]*\.in\("companyId",\s*companyIds\)/.test(
      purchasingService
    )
  ) {
    missing.push(
      "Purchasing RFQ supplier helpers must load supplier metadata through explicit company-scoped supplier reads instead of embedded selectors."
    );
  }

  if (
    !/companyId\?:\s*string[\s\S]*const\s+\{\s*id,\s*companyId,\s*\.\.\.data\s*\}\s*=\s*update[\s\S]*return\s+companyId\s*\?\s*query\.eq\("companyId",\s*companyId\)\s*:\s*query/.test(
      purchasingService
    ) ||
    !/updatePurchaseOrderStatus\(ctx\.client,\s*\{[\s\S]*companyId:\s*ctx\.companyId/.test(
      mcpTools
    )
  ) {
    missing.push(
      "Purchase-order status helper and MCP tool must preserve optional companyId filters for request-scoped writes."
    );
  }

  return missing;
}

function qualityDocumentRouteRequestScopeFailures() {
  const missing = [];
  const qualityService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/quality/quality.service.ts"),
    "utf8"
  );
  const routeFiles = [
    "apps/erp/app/routes/x+/quality-document+/$id.tsx",
    "apps/erp/app/routes/x+/quality-document+/update.tsx",
    "apps/erp/app/routes/x+/quality+/gauges.$id.tsx",
    "apps/erp/app/routes/x+/quality+/gauges.new.tsx",
    "apps/erp/app/routes/x+/quality+/inbound-inspections.$id.reject.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected quality work.`
      );
    }
  }

  if (
    /qualityDocumentStep\(\*\)/.test(qualityService) ||
    !/function\s+getQualityDocument\([\s\S]*\.from\("qualityDocument"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("qualityDocumentStep"\)[\s\S]*\.eq\("qualityDocumentId",\s*id\)[\s\S]*\.eq\("companyId",\s*document\.data\.companyId\)/.test(
      qualityService
    ) ||
    !/const\s+qualityDocumentSteps\s*=\s*await\s+client[\s\S]*\.from\("qualityDocumentStep"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("qualityDocumentId",\s*copyFromId\)[\s\S]*\.eq\("companyId",\s*rest\.companyId\)/.test(
      qualityService
    )
  ) {
    missing.push(
      "Quality document helpers must load document steps through explicit company-scoped reads instead of embedded selectors."
    );
  }

  const documentRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quality-document+/$id.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"quality"/.test(
      documentRoute
    ) ||
    !/getLatestApprovalRequestForDocument\(\s*client,\s*"qualityDocument",\s*id\s*\)/.test(
      documentRoute
    ) ||
    !/approvalRequest\.data\.companyId\s*!==\s*companyId/.test(documentRoute) ||
    !/canApproveRequest\(\s*client,\s*\{/.test(documentRoute) ||
    !/getQualityDocumentApprovalContext\(\s*client,\s*id/.test(documentRoute)
  ) {
    missing.push(
      "Quality-document detail route must keep approval reads/checks inside the authorized request client and verify company scope before decisions."
    );
  }

  const updateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quality-document+/update.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"quality"/.test(
      updateRoute
    ) ||
    !/isApprovalRequired\(\s*client,\s*"qualityDocument",\s*companyId/.test(
      updateRoute
    ) ||
    !/createApprovalRequest\(\s*client,\s*\{/.test(updateRoute) ||
    !/cancelPendingApprovalsForArchiveOrDraft\(\s*client,\s*userId/.test(
      updateRoute
    ) ||
    !/\.from\("approvalRequest"\)[\s\S]*\.eq\("id",\s*reqId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      updateRoute
    ) ||
    occurrences(updateRoute, '.eq("companyId", companyId)') < 5
  ) {
    missing.push(
      "Quality-document bulk update route must use request-scoped approval helpers and company-scope document/approval updates."
    );
  }

  const gaugeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quality+/gauges.$id.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"quality"/.test(
      gaugeRoute
    ) ||
    !/getGauge\(\s*client,\s*id\s*\)/.test(gaugeRoute) ||
    !/gauge\.data\.companyId\s*!==\s*companyId/.test(gaugeRoute) ||
    !/getGaugeCalibrationRecordsByGaugeId\(\s*client,\s*id\s*\)/.test(
      gaugeRoute
    )
  ) {
    missing.push(
      "Gauge detail route must load gauge records through the request-scoped quality client."
    );
  }

  const newGaugeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quality+/gauges.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"quality"/.test(
      newGaugeRoute
    ) ||
    !/getNextSequence\(\s*client,\s*"gauge",\s*companyId\s*\)/.test(
      newGaugeRoute
    ) ||
    !/upsertGauge\(\s*client,\s*\{/.test(newGaugeRoute)
  ) {
    missing.push(
      "Gauge creation route must allocate sequence and insert through the request-scoped quality client."
    );
  }

  const rejectRoute = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/quality+/inbound-inspections.$id.reject.tsx"
    ),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"quality"/.test(
      rejectRoute
    ) ||
    !/getNextSequence\(\s*client,\s*"nonConformance",\s*companyId\s*\)/.test(
      rejectRoute
    ) ||
    !/upsertIssue\(\s*client,\s*\{/.test(rejectRoute) ||
    !/\.from\("nonConformanceItem"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      rejectRoute
    ) ||
    !/deleteIssue\(\s*client,\s*ncrId\s*\)/.test(rejectRoute) ||
    !/notifyIssueCreated\(\s*\{\s*client\s*\}/.test(rejectRoute) ||
    occurrences(rejectRoute, '.eq("companyId", companyId)') < 4
  ) {
    missing.push(
      "Inbound-inspection rejection route must create/link the NCR through the request client with company-scoped follow-up writes."
    );
  }

  return missing;
}

function itemMethodRouteRequestScopeFailures() {
  const missing = [];
  const itemsService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/items/items.service.ts"),
    "utf8"
  );
  const routeFiles = [
    "apps/erp/app/routes/x+/items+/methods+/save.tsx",
    "apps/erp/app/routes/x+/items+/methods+/get.tsx",
    "apps/erp/app/routes/x+/items+/methods+/versions.activate.$id.tsx",
    "apps/erp/app/routes/x+/items+/methods+/version.new.tsx",
    "apps/erp/app/routes/x+/items+/revisions.new.tsx",
    "apps/erp/app/routes/x+/items+/methods+/operation.$operationId.step.order.tsx",
    "apps/erp/app/routes/x+/items+/methods+/operation.step.new.tsx",
    "apps/erp/app/routes/x+/items+/methods+/operation.step.$id.tsx",
    "apps/erp/app/routes/x+/items+/methods+/operation.step.delete.$id.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for item method/revision work.`
      );
    }
  }

  for (const file of [
    "apps/erp/app/routes/x+/items+/methods+/save.tsx",
    "apps/erp/app/routes/x+/items+/methods+/get.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (
      !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"parts"/.test(
        source
      ) ||
      !/copyMakeMethod\(\s*client,\s*\{/.test(source) ||
      !/copyItem\(\s*client,\s*\{/.test(source)
    ) {
      missing.push(
        `${file} must dispatch method copy helpers with the request-scoped parts client.`
      );
    }
  }

  const operationStepRoutes = [
    {
      path: "apps/erp/app/routes/x+/items+/methods+/operation.$operationId.step.order.tsx",
      pattern:
        /const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions[\s\S]*assertMethodOperationIsDraft\(\s*client,\s*operationId,\s*companyId\s*\)/,
    },
    {
      path: "apps/erp/app/routes/x+/items+/methods+/operation.step.new.tsx",
      pattern:
        /const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions[\s\S]*assertMethodOperationIsDraft\(\s*client,\s*validation\.data\.operationId,\s*companyId\s*\)/,
    },
    {
      path: "apps/erp/app/routes/x+/items+/methods+/operation.step.$id.tsx",
      pattern:
        /const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions[\s\S]*assertMethodOperationIsDraft\(\s*client,\s*validation\.data\.operationId,\s*companyId\s*\)/,
    },
    {
      path: "apps/erp/app/routes/x+/items+/methods+/operation.step.delete.$id.tsx",
      pattern:
        /const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions[\s\S]*\.from\("methodOperationStep"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*assertMethodOperationIsDraft\(\s*client,\s*step\.data\.operationId,\s*companyId\s*\)/,
    },
  ];
  const itemsServiceSlice = (start, end) => {
    const startIndex = itemsService.indexOf(start);
    const endIndex = itemsService.indexOf(end);
    if (startIndex < 0) return "";
    return endIndex > startIndex
      ? itemsService.slice(startIndex, endIndex)
      : itemsService.slice(startIndex);
  };

  if (
    !/function\s+assertMethodOperationIsDraft\([\s\S]*operationId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("methodOperation"\)[\s\S]*\.select\("makeMethodId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("makeMethod"\)[\s\S]*\.select\("status"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    ) ||
    /makeMethod!inner\(status\)/.test(itemsService) ||
    !operationStepRoutes.every(({ path, pattern }) =>
      pattern.test(readFileSync(resolve(repoRoot, path), "utf8"))
    )
  ) {
    missing.push(
      "Item method operation-step mutations must validate draft state through request company scope, without embedded makeMethod selectors."
    );
  }

  if (
    /\.\.\.item\(itemId:id, type\)/.test(itemsService) ||
    !/function\s+upsertMakeMethodVersion\([\s\S]*\.from\("makeMethod"\)[\s\S]*\.select\("id"\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, type"\)[\s\S]*\.eq\("companyId",\s*makeMethodVersion\.companyId\)/.test(
      itemsService
    )
  ) {
    missing.push(
      "Method version creation must resolve copied item metadata with an explicit company-scoped item query."
    );
  }

  const getMethodMaterial = itemsServiceSlice(
    "export async function getMethodMaterial",
    "export async function getMethodMaterials"
  );
  const getMethodMaterialsByMakeMethod = itemsServiceSlice(
    "export async function getMethodMaterialsByMakeMethod",
    "export async function getMethodOperations"
  );
  const getMethodOperationsByMakeMethod = itemsServiceSlice(
    "export async function getMethodOperationsByMakeMethodId",
    "type Method = NonNullable"
  );
  if (
    /item\(name\)/.test(getMethodMaterial) ||
    /item\(name, itemTrackingType, replenishmentSystem\)/.test(
      getMethodMaterialsByMakeMethod
    ) ||
    !/materialId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("methodMaterial"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getMethodMaterial
    ) ||
    !/makeMethodId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("methodMaterial"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, name, itemTrackingType, replenishmentSystem"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getMethodMaterialsByMakeMethod
    )
  ) {
    missing.push(
      "Method material helpers must resolve item metadata with explicit request-company-scoped item queries."
    );
  }

  if (
    /methodOperationTool\(\*\)|methodOperationParameter\(\*\)|methodOperationStep\(\*\)/.test(
      getMethodOperationsByMakeMethod
    ) ||
    !/makeMethodId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("methodOperation"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("methodOperationTool"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("methodOperationParameter"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("methodOperationStep"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getMethodOperationsByMakeMethod
    )
  ) {
    missing.push(
      "Method operation list helper must resolve tools, parameters, and steps with explicit request-company-scoped reads."
    );
  }

  const activateRoute = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/items+/methods+/versions.activate.$id.tsx"
    ),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"parts"/.test(
      activateRoute
    ) ||
    !/activateMethodVersion\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*userId/.test(
      activateRoute
    )
  ) {
    missing.push(
      "Method version activation route must dispatch through the request-scoped parts client."
    );
  }

  const newVersionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/items+/methods+/version.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"parts"/.test(
      newVersionRoute
    ) ||
    !/upsertMakeMethodVersion\(\s*client,\s*\{/.test(newVersionRoute) ||
    !/copyMakeMethod\(\s*client,\s*\{/.test(newVersionRoute)
  ) {
    missing.push(
      "Method version creation route must write and copy through the request-scoped parts client."
    );
  }

  const revisionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/items+/revisions.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"parts"/.test(
      revisionRoute
    ) ||
    !/getItem\(\s*client,\s*validation\.data\.copyFromId\s*\)/.test(
      revisionRoute
    ) ||
    !/currentItem\.data\.companyId\s*!==\s*companyId/.test(revisionRoute) ||
    !/createRevision\(\s*client,\s*\{/.test(revisionRoute)
  ) {
    missing.push(
      "Item revision creation route must verify item company scope and create the revision through the request client."
    );
  }

  return missing;
}

function peopleAttributeRouteRequestScopeFailures() {
  const missing = [];
  const peopleService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/people/people.service.ts"),
    "utf8"
  );
  const accountAttributeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/account+/$userId.attribute.tsx"),
    "utf8"
  );
  const accountDeleteAttributeRoute = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/account+/$userId.delete.attribute.tsx"
    ),
    "utf8"
  );
  const editAttributeRoute = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/people+/attributes.list.$categoryId.$attributeId.tsx"
    ),
    "utf8"
  );
  const attributeCategoryListRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/people+/attributes.list.$categoryId.tsx"),
    "utf8"
  );
  const attributeCategoryRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/people+/attributes.$categoryId.tsx"),
    "utf8"
  );
  const mcpPeopleTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/people.ts"),
    "utf8"
  );
  const serviceSlice = (start, end) => {
    const startIndex = peopleService.indexOf(start);
    const endIndex = peopleService.indexOf(end);
    return startIndex >= 0 && endIndex > startIndex
      ? peopleService.slice(startIndex, endIndex)
      : "";
  };
  const getAttribute = serviceSlice(
    "export async function getAttribute",
    "async function getAttributes"
  );
  const getAttributeCategories = serviceSlice(
    "export async function getAttributeCategories",
    "export async function getAttributeCategory"
  );
  const getAttributeCategory = serviceSlice(
    "export async function getAttributeCategory",
    "export async function getAttributeDataTypes"
  );

  if (
    /userAttributeCategory\(name\)/.test(getAttribute) ||
    !/attributeId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("userAttribute"\)[\s\S]*\.select\("\*"\)[\s\S]*\.from\("userAttributeCategory"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getAttribute
    ) ||
    /userAttribute\(id, name, attributeDataType\(id\)\)/.test(
      getAttributeCategories
    ) ||
    !/\.from\("userAttributeCategory"\)[\s\S]*\.select\("\*",\s*\{[\s\S]*count:\s*"exact"[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("userAttribute"\)[\s\S]*\.select\("id, name, attributeDataTypeId, userAttributeCategoryId"\)[\s\S]*\.from\("attributeDataType"\)[\s\S]*\.select\("id"\)/.test(
      getAttributeCategories
    ) ||
    /attributeDataType\(id, label/.test(getAttributeCategory) ||
    !/id:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("userAttributeCategory"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("userAttribute"\)[\s\S]*\.select\("id, name, sortOrder, attributeDataTypeId, userAttributeCategoryId"\)[\s\S]*\.from\("attributeDataType"\)[\s\S]*\.select\([\s\S]*id, label, isBoolean/.test(
      getAttributeCategory
    )
  ) {
    missing.push(
      "People attribute helpers must resolve categories and data types explicitly through the request company scope."
    );
  }

  if (
    !/getAttribute\(\s*client,\s*attributeId,\s*companyId\s*\)/.test(
      accountAttributeRoute
    ) ||
    !/getAttribute\(\s*client,\s*userAttributeId,\s*companyId\s*\)/.test(
      accountDeleteAttributeRoute
    ) ||
    !/getAttribute\(\s*client,\s*attributeId,\s*companyId\s*\)/.test(
      editAttributeRoute
    ) ||
    !/getAttributeCategory\([\s\S]*client,[\s\S]*categoryId,[\s\S]*companyId/.test(
      attributeCategoryListRoute
    ) ||
    !/getAttributeCategory\([\s\S]*client,[\s\S]*categoryId,[\s\S]*companyId/.test(
      attributeCategoryRoute
    ) ||
    !/getAttribute\([\s\S]*ctx\.client,[\s\S]*params\.attributeId,[\s\S]*ctx\.companyId/.test(
      mcpPeopleTools
    ) ||
    !/getAttributeCategory\([\s\S]*ctx\.client,[\s\S]*params\.id,[\s\S]*ctx\.companyId/.test(
      mcpPeopleTools
    )
  ) {
    missing.push(
      "People attribute routes and MCP tools must pass Better Auth company scope into attribute helpers."
    );
  }

  return missing;
}

function accountingDimensionCurrencyRouteFailures() {
  const missing = [];
  const accountingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/accounting/accounting.service.ts"),
    "utf8"
  );
  const currencyRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/accounting+/exchange-rates.$currencyId.tsx"),
    "utf8"
  );
  const dimensionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/accounting+/dimensions.$dimensionId.tsx"),
    "utf8"
  );
  const dimensionDeleteRoute = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/routes/x+/accounting+/dimensions.delete.$dimensionId.tsx"
    ),
    "utf8"
  );
  const journalEntryRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/journal-entry+/$journalEntryId.tsx"),
    "utf8"
  );
  const journalEntryDetailsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/journal-entry+/$journalEntryId.details.tsx"),
    "utf8"
  );
  const journalEntryPostRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/journal-entry+/$journalEntryId.post.tsx"),
    "utf8"
  );
  const mcpAccountingTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/accounting.ts"),
    "utf8"
  );
  const serviceSlice = (start, end) => {
    const startIndex = accountingService.indexOf(start);
    const endIndex = accountingService.indexOf(end);
    if (startIndex < 0) return "";
    return endIndex > startIndex
      ? accountingService.slice(startIndex, endIndex)
      : accountingService.slice(startIndex);
  };
  const getCurrency = serviceSlice(
    "export async function getCurrency",
    "export async function getCurrencyByCode"
  );
  const getDimensions = serviceSlice(
    "export async function getDimensions",
    "export async function getDimension("
  );
  const getDimension = serviceSlice(
    "export async function getDimension(",
    "export async function upsertDimension"
  );
  const getJournalEntry = serviceSlice(
    "export async function getJournalEntry",
    "export async function createJournalEntry"
  );
  const postJournalEntry = serviceSlice(
    "export async function postJournalEntry",
    "export async function reverseJournalEntry"
  );
  const reverseJournalEntry = serviceSlice(
    "export async function reverseJournalEntry",
    "export async function getFiscalPeriods"
  );

  if (
    /currencyCode!inner\(name\)/.test(getCurrency) ||
    !/currencyId:\s*string,[\s\S]*companyGroupId:\s*string[\s\S]*\.from\("currency"\)[\s\S]*\.eq\("companyGroupId",\s*companyGroupId\)[\s\S]*\.from\("currencyCode"\)[\s\S]*\.select\("name"\)/.test(
      getCurrency
    ) ||
    /dimensionValue\(id, name\)/.test(getDimensions + getDimension) ||
    !/\.from\("dimension"\)[\s\S]*\.select\("\*",\s*\{[\s\S]*count:\s*"exact"[\s\S]*\.eq\("companyGroupId",\s*companyGroupId\)[\s\S]*\.from\("dimensionValue"\)[\s\S]*\.select\("id, name, dimensionId"\)[\s\S]*\.eq\("companyGroupId",\s*companyGroupId\)/.test(
      getDimensions
    ) ||
    !/dimensionId:\s*string,[\s\S]*companyGroupId:\s*string[\s\S]*\.from\("dimension"\)[\s\S]*\.select\("\*"\)[\s\S]*dimension\.data\.companyGroupId\s*!==\s*companyGroupId[\s\S]*\.from\("dimensionValue"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyGroupId",\s*companyGroupId\)/.test(
      getDimension
    )
  ) {
    missing.push(
      "Accounting currency and dimension helpers must replace embedded selectors with explicit company-group-scoped reads."
    );
  }

  if (
    !/getCurrency\(\s*client,\s*currencyId,\s*companyGroupId\s*\)/.test(
      currencyRoute
    ) ||
    !/getDimension\(\s*client,\s*dimensionId,\s*companyGroupId\s*\)/.test(
      dimensionRoute
    ) ||
    !/getDimension\(\s*client,\s*dimensionId,\s*companyGroupId\s*\)/.test(
      dimensionDeleteRoute
    ) ||
    !/getCurrency\([\s\S]*ctx\.client,[\s\S]*params\.currencyId,[\s\S]*ctx\.companyGroupId/.test(
      mcpAccountingTools
    ) ||
    !/getDimension\([\s\S]*ctx\.client,[\s\S]*params\.dimensionId,[\s\S]*ctx\.companyGroupId/.test(
      mcpAccountingTools
    )
  ) {
    missing.push(
      "Accounting currency and dimension routes/MCP tools must pass Better Auth company-group scope into helpers."
    );
  }

  if (
    /journalLine\(\*, account!journalLine_accountId_fkey\(class\)\)/.test(
      getJournalEntry
    ) ||
    !/id:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("journal"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("journalLine"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("account"\)[\s\S]*\.select\("id, class"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getJournalEntry
    ) ||
    !/id:\s*string,[\s\S]*companyId:\s*string,[\s\S]*userId:\s*string[\s\S]*getJournalEntry\(client,\s*id,\s*companyId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      postJournalEntry
    ) ||
    !/getJournalEntry\(client,\s*id,\s*data\.companyId\)[\s\S]*\.eq\("companyId",\s*data\.companyId\)/.test(
      reverseJournalEntry
    )
  ) {
    missing.push(
      "Accounting journal entry helper must resolve journal lines/account classes explicitly inside the request company."
    );
  }

  if (
    !/getJournalEntry\(\s*client,\s*journalEntryId,\s*companyId\s*\)/.test(
      journalEntryRoute
    ) ||
    !/postJournalEntry\([\s\S]*client,[\s\S]*journalEntryId,[\s\S]*companyId,[\s\S]*userId/.test(
      journalEntryDetailsRoute
    ) ||
    !/postJournalEntry\(\s*client,\s*journalEntryId,\s*companyId,\s*userId\s*\)/.test(
      journalEntryPostRoute
    ) ||
    !/getJournalEntry\([\s\S]*ctx\.client,[\s\S]*params\.id,[\s\S]*ctx\.companyId/.test(
      mcpAccountingTools
    ) ||
    !/postJournalEntry\([\s\S]*ctx\.client,[\s\S]*params\.id,[\s\S]*ctx\.companyId,[\s\S]*ctx\.userId/.test(
      mcpAccountingTools
    )
  ) {
    missing.push(
      "Accounting journal entry routes and MCP tools must pass Better Auth company scope into journal helpers."
    );
  }

  return missing;
}

function salesOrderRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/sales-order+/$orderId.confirm.tsx",
    "apps/erp/app/routes/x+/sales-order+/$orderId.tsx",
    "apps/erp/app/routes/x+/sales-order+/$orderId.$lineId.details.tsx",
    "apps/erp/app/routes/x+/sales-order+/$orderId.$lineId.job.tsx",
    "apps/erp/app/routes/x+/sales-order+/$orderId.$lineId.shipment.tsx",
    "apps/erp/app/routes/x+/sales-order+/$orderId.lines.jobs.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected sales-order work.`
      );
    }
  }

  const confirmRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-order+/$orderId.confirm.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      confirmRoute
    ) ||
    !/getSalesOrder\(\s*client,\s*orderId\s*\)/.test(confirmRoute) ||
    !/generateAndAttachSalesOrderPdf\(\{[\s\S]*client,[\s\S]*pdfLoader/.test(
      confirmRoute
    ) ||
    !/sendSalesOrderEmail\(\{[\s\S]*client,[\s\S]*locales/.test(
      confirmRoute
    ) ||
    !/getSalesOrderLines\(\s*client,\s*orderId\s*\)/.test(confirmRoute) ||
    !/\.from\("salesOrder"\)[\s\S]*\.eq\("id",\s*orderId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      confirmRoute
    ) ||
    !/runMRP\(\s*client,\s*\{[\s\S]*companyId:[\s\S]*userId:/.test(
      confirmRoute
    )
  ) {
    missing.push(
      "Sales-order confirmation route must keep reads, PDF/document writes, email context, status update, and MRP dispatch on the request client with company scope."
    );
  }

  const salesOrderRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-order+/$orderId.tsx"),
    "utf8"
  );
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const mcpSalesTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/sales.ts"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"sales"[\s\S]*bypassRls:\s*true/.test(
      salesOrderRoute
    ) ||
    !/getSalesOrder\(\s*client,\s*orderId\s*\)/.test(salesOrderRoute) ||
    !/getSalesOrderLines\(\s*client,\s*orderId\s*\)/.test(salesOrderRoute) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(salesOrderRoute) ||
    !/getSalesOrderRelatedItems\([\s\S]*client,[\s\S]*orderId,[\s\S]*opportunity\.data\.id,[\s\S]*companyId/.test(
      salesOrderRoute
    )
  ) {
    missing.push(
      "Sales-order detail loader must keep order, settings, and related-item reads on the request-scoped sales client with company scope."
    );
  }

  const lineDetailsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-order+/$orderId.$lineId.details.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"sales"[\s\S]*bypassRls:\s*true/.test(
      lineDetailsRoute
    ) ||
    !/getSalesOrderLine\(\s*client,\s*lineId\s*\)/.test(lineDetailsRoute) ||
    !/getJobsBySalesOrderLine\(\s*client,\s*lineId\s*\)/.test(
      lineDetailsRoute
    ) ||
    !/getSalesOrderLineShipments\(\s*client,\s*lineId,\s*companyId\s*\)/.test(
      lineDetailsRoute
    ) ||
    !/getItemReplenishment\(\s*client,\s*itemId,\s*companyId\s*\)/.test(
      lineDetailsRoute
    ) ||
    !/getOpportunityLineDocuments\(\s*client,\s*companyId,\s*lineId,\s*itemId\s*\)/.test(
      lineDetailsRoute
    )
  ) {
    missing.push(
      "Sales-order line detail loader must use the request-scoped sales client for line, job, shipment, replenishment, and document reads."
    );
  }

  if (
    /shipmentLine\(\*\)|shipment\(\*\)|storageUnit\(id,\s*name\)/.test(
      salesService
    ) ||
    !/function\s+getSalesOrderRelatedItems\([\s\S]*companyId:\s*string[\s\S]*\.from\("job"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("shipment"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("salesInvoice"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("shipmentLine"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesService
    ) ||
    !/function\s+getSalesOrderLineShipments\([\s\S]*companyId:\s*string[\s\S]*\.from\("shipmentLine"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("shipment"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("storageUnit"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesService
    ) ||
    !/getSalesOrderRelatedItems\([\s\S]*ctx\.client,[\s\S]*params\.salesOrderId,[\s\S]*params\.opportunityId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    ) ||
    !/getSalesOrderLineShipments\([\s\S]*ctx\.client,[\s\S]*params\.salesOrderLineId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    )
  ) {
    missing.push(
      "Sales-order related-item and line-shipment helpers must resolve shipment lines, shipments, and storage units through explicit company-scoped reads."
    );
  }

  const lineJobRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-order+/$orderId.$lineId.job.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"production"/.test(
      lineJobRoute
    ) ||
    !/getNextSequence\(\s*client,\s*"job",\s*companyId\s*\)/.test(
      lineJobRoute
    ) ||
    !/getItemReplenishment\(\s*client,\s*validation\.data\.itemId,\s*companyId\s*\)/.test(
      lineJobRoute
    ) ||
    !/getDefaultStorageUnitForJob\(\s*client,/.test(lineJobRoute) ||
    !/upsertJob\(\s*client,\s*\{/.test(lineJobRoute) ||
    !/upsertJobMethod\(\s*client,\s*"quoteLineToJob"/.test(lineJobRoute) ||
    !/upsertJobMethod\(\s*client,\s*"itemToJob"/.test(lineJobRoute)
  ) {
    missing.push(
      "Sales-order line job creation route must allocate sequence, read replenishment/storage defaults, create job, and copy methods through the request production client."
    );
  }

  const lineShipmentRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-order+/$orderId.$lineId.shipment.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"inventory"/.test(
      lineShipmentRoute
    ) ||
    !/getSalesOrderLine\(\s*client,\s*lineId\s*\)/.test(lineShipmentRoute) ||
    !/companyId\s*!==\s*salesOrderLine\.data\.companyId/.test(
      lineShipmentRoute
    ) ||
    !/invokeFunction<\{\s*id:\s*string;\s*\}>\("create",[\s\S]*companyId,[\s\S]*userId/.test(
      lineShipmentRoute
    )
  ) {
    missing.push(
      "Sales-order line shipment route must verify line company scope through the request inventory client before dispatching shipment creation."
    );
  }

  const linesJobsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-order+/$orderId.lines.jobs.tsx"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const mcpProductionTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/production.ts"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"production"/.test(
      linesJobsRoute
    ) ||
    !/getSalesOrder\(\s*client,\s*orderId\s*\)/.test(linesJobsRoute) ||
    !/salesOrder\.data\.companyId\s*!==\s*companyId/.test(linesJobsRoute) ||
    !/convertSalesOrderLinesToJobs\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*userId/.test(
      linesJobsRoute
    ) ||
    /quotes\(\*\)|salesOrders\(\*\)/.test(productionService) ||
    !/function\s+convertSalesOrderLinesToJobs\([\s\S]*\.from\("quote"\)[\s\S]*\.eq\("opportunityId",\s*opportunityId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("salesOrder"\)[\s\S]*\.eq\("opportunityId",\s*opportunityId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      productionService
    ) ||
    !/convertSalesOrderLinesToJobs\([\s\S]*ctx\.client,[\s\S]*companyId:\s*ctx\.companyId,[\s\S]*userId:\s*ctx\.userId/.test(
      mcpProductionTools
    )
  ) {
    missing.push(
      "Sales-order bulk job conversion must verify order company scope and resolve opportunity quote/order links through explicit company-scoped reads."
    );
  }

  return missing;
}

function salesRfqRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/sales-rfq+/$rfqId.tsx",
    "apps/erp/app/routes/x+/sales-rfq+/$rfqId.$lineId.details.tsx",
    "apps/erp/app/routes/x+/sales-rfq+/$rfqId.convert.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected sales-RFQ work.`
      );
    }
  }

  const rfqRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-rfq+/$rfqId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"sales"/.test(
      rfqRoute
    ) ||
    !/getSalesRFQ\(\s*client,\s*rfqId\s*\)/.test(rfqRoute) ||
    !/getSalesRFQLines\(\s*client,\s*rfqId\s*\)/.test(rfqRoute) ||
    !/rfqSummary\.data\.companyId\s*!==\s*companyId/.test(rfqRoute) ||
    !/getOpportunity\(\s*client,/.test(rfqRoute) ||
    !/getOpportunityDocuments\(\s*client,\s*companyId,\s*opportunity\.data\.id\s*\)/.test(
      rfqRoute
    )
  ) {
    missing.push(
      "Sales-RFQ detail loader must keep RFQ, line, opportunity, and document reads on the request-scoped sales client with company scope."
    );
  }

  const lineRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-rfq+/$rfqId.$lineId.details.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"sales"/.test(
      lineRoute
    ) ||
    !/getSalesRFQLine\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/line\.data\.companyId\s*!==\s*companyId/.test(lineRoute) ||
    !/getOpportunityLineDocuments\(\s*client,\s*companyId,\s*lineId,\s*itemId\s*\)/.test(
      lineRoute
    )
  ) {
    missing.push(
      "Sales-RFQ line detail loader must verify line company scope and read line documents through the request-scoped sales client."
    );
  }

  const convertRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/sales-rfq+/$rfqId.convert.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      convertRoute
    ) ||
    !/getSalesRFQ\(\s*client,\s*id\s*\)/.test(convertRoute) ||
    !/rfq\.data\.companyId\s*!==\s*companyId/.test(convertRoute) ||
    !/convertSalesRfqToQuote\(\s*client,\s*\{/.test(convertRoute) ||
    !/\.from\("quoteLine"\)[\s\S]*\.eq\("quoteId",\s*quoteId\)/.test(
      convertRoute
    ) ||
    !/calculatePricesForQuantities\(\s*client,/.test(convertRoute) ||
    !/resolveQuoteLinePrices\(\s*client,/.test(convertRoute) ||
    !/resolvePurchaseToOrderPrices\(\s*client,/.test(convertRoute)
  ) {
    missing.push(
      "Sales-RFQ conversion route must verify RFQ company scope and seed quote prices through the request-scoped sales client."
    );
  }

  return missing;
}

function purchasingRfqRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/purchasing-rfq+/$rfqId.tsx",
    "apps/erp/app/routes/x+/purchasing-rfq+/$rfqId.$lineId.details.tsx",
    "apps/erp/app/routes/x+/purchasing-rfq+/$rfqId.compare.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected purchasing-RFQ work.`
      );
    }
  }

  const rfqRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchasing-rfq+/$rfqId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      rfqRoute
    ) ||
    !/getPurchasingRFQ\(\s*client,\s*rfqId\s*\)/.test(rfqRoute) ||
    !/getPurchasingRFQLines\(\s*client,\s*rfqId\s*\)/.test(rfqRoute) ||
    !/getPurchasingRFQSuppliersWithLinks\(\s*client,\s*rfqId\s*\)/.test(
      rfqRoute
    ) ||
    !/getLinkedSupplierQuotes\(\s*client,\s*rfqId\s*\)/.test(rfqRoute) ||
    !/rfqSummary\.data\.companyId\s*!==\s*companyId/.test(rfqRoute) ||
    !/getSupplierInteractionDocuments\(\s*client,\s*companyId,\s*rfqId\s*\)/.test(
      rfqRoute
    )
  ) {
    missing.push(
      "Purchasing-RFQ detail loader must keep RFQ, line, supplier-link, and document reads on the request-scoped purchasing client with company scope."
    );
  }

  const lineRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchasing-rfq+/$rfqId.$lineId.details.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      lineRoute
    ) ||
    !/getPurchasingRFQLine\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/line\.data\.companyId\s*!==\s*companyId/.test(lineRoute) ||
    !/getSupplierInteractionLineDocuments\(\s*client,\s*companyId,\s*lineId\s*\)/.test(
      lineRoute
    )
  ) {
    missing.push(
      "Purchasing-RFQ line detail loader must verify line company scope and read line documents through the request-scoped purchasing client."
    );
  }

  const compareRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/purchasing-rfq+/$rfqId.compare.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      compareRoute
    ) ||
    !/getPurchasingRFQ\(\s*client,\s*rfqId\s*\)/.test(compareRoute) ||
    !/rfq\.data\.companyId\s*!==\s*companyId/.test(compareRoute) ||
    !/getSupplierQuotesForComparison\(\s*client,\s*rfqId\s*\)/.test(
      compareRoute
    )
  ) {
    missing.push(
      "Purchasing-RFQ compare loader must verify RFQ company scope and load supplier quote comparison data through the request client."
    );
  }

  return missing;
}

function supplierQuoteRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/supplier-quote+/$id.tsx",
    "apps/erp/app/routes/x+/supplier-quote+/$id.$lineId.details.tsx",
    "apps/erp/app/routes/x+/supplier-quote+/$id.new.tsx",
    "apps/erp/app/routes/x+/supplier-quote+/$id.convert.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected supplier-quote work.`
      );
    }
  }

  const quoteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier-quote+/$id.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*companyGroupId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      quoteRoute
    ) ||
    !/getSupplierQuote\(\s*client,\s*id\s*\)/.test(quoteRoute) ||
    !/getSupplierQuoteLines\(\s*client,\s*id\s*\)/.test(quoteRoute) ||
    !/getSupplierQuoteLinePricesByQuoteId\(\s*client,\s*id\s*\)/.test(
      quoteRoute
    ) ||
    !/getSiblingQuotesForQuote\(\s*client,\s*id\s*\)/.test(quoteRoute) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(quoteRoute) ||
    !/getSupplierInteraction\(\s*client,/.test(quoteRoute) ||
    !/getCurrencyByCode\(\s*client,\s*companyGroupId/.test(quoteRoute) ||
    !/getSupplier\(\s*client,\s*quote\.data\.supplierId/.test(quoteRoute) ||
    !/getCompanySettings\(\s*client,\s*companyId\s*\)/.test(quoteRoute) ||
    !/getSupplierInteractionDocuments\(\s*client,\s*companyId/.test(
      quoteRoute
    )
  ) {
    missing.push(
      "Supplier-quote detail loader must keep quote, lines, prices, sibling quotes, supplier context, settings, and documents on the request-scoped purchasing client."
    );
  }

  const lineRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier-quote+/$id.$lineId.details.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"purchasing"/.test(
      lineRoute
    ) ||
    !/getSupplierQuoteLine\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/getSupplierQuoteLinePrices\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/line\.data\.companyId\s*!==\s*companyId/.test(lineRoute) ||
    !/getSupplierInteractionLineDocuments\(\s*client,\s*companyId,\s*lineId\s*\)/.test(
      lineRoute
    ) ||
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"purchasing"/.test(
      lineRoute
    ) ||
    !/getSupplierQuote\(\s*viewClient,\s*id\s*\)/.test(lineRoute) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(lineRoute) ||
    !/upsertSupplierQuoteLine\(\s*client,\s*\{/.test(lineRoute)
  ) {
    missing.push(
      "Supplier-quote line detail/action route must verify quote/line company scope and use the request-scoped purchasing client for line documents, prices, and writes."
    );
  }

  const newLineRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier-quote+/$id.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"purchasing"/.test(
      newLineRoute
    ) ||
    !/getSupplierQuote\(\s*viewClient,\s*supplierQuoteId\s*\)/.test(
      newLineRoute
    ) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(newLineRoute) ||
    !/upsertSupplierQuoteLine\(\s*client,\s*\{/.test(newLineRoute)
  ) {
    missing.push(
      "Supplier-quote new-line route must verify quote company scope and insert through the request-scoped purchasing client."
    );
  }

  const convertRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/supplier-quote+/$id.convert.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"purchasing"/.test(
      convertRoute
    ) ||
    !/getSupplierQuote\(\s*client,\s*id\s*\)/.test(convertRoute) ||
    !/isApprovalRequired\(\s*client,\s*"supplier",\s*companyId\s*\)/.test(
      convertRoute
    ) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(convertRoute) ||
    !/getSupplier\(\s*client,\s*quote\.data\.supplierId\s*\)/.test(
      convertRoute
    ) ||
    !/convertSupplierQuoteToOrder\(\s*client,\s*\{/.test(convertRoute)
  ) {
    missing.push(
      "Supplier-quote conversion route must verify quote company scope and dispatch supplier approval/conversion through the request-scoped purchasing client."
    );
  }

  return missing;
}

function quoteCoreRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/quote+/$quoteId.new.tsx",
    "apps/erp/app/routes/x+/quote+/$quoteId.convert.tsx",
    "apps/erp/app/routes/x+/quote+/$quoteId.drag.tsx",
    "apps/erp/app/routes/x+/quote+/$quoteId.duplicate.tsx",
    "apps/erp/app/routes/x+/quote+/$quoteId.$lineId.details.tsx",
    "apps/erp/app/routes/x+/quote+/$quoteId.$lineId.configure.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for protected quote work.`
      );
    }
  }

  const newRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      newRoute
    ) ||
    !/getQuote\(\s*viewClient,\s*quoteId\s*\)/.test(newRoute) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(newRoute) ||
    !/upsertQuoteLine\(\s*client,\s*\{/.test(newRoute) ||
    !/resolvePurchaseToOrderPrices\(\s*client,/.test(newRoute) ||
    !/resolveQuoteLinePrices\(\s*client,/.test(newRoute) ||
    !/upsertQuoteLineMethod\(\s*client,\s*\{/.test(newRoute) ||
    !/recalculateQuoteLinePrices\(\s*client,/.test(newRoute)
  ) {
    missing.push(
      "Quote new-line route must verify quote company scope and create lines/prices/methods through the request-scoped sales client."
    );
  }

  const convertRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.convert.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      convertRoute
    ) ||
    !/getQuote\(\s*client,\s*quoteId\s*\)/.test(convertRoute) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(convertRoute) ||
    !/convertQuoteToOrder\(\s*client,\s*\{/.test(convertRoute) ||
    !/getSalesOrder\(\s*client,\s*salesOrderId\s*\)/.test(convertRoute) ||
    !/generateAndAttachSalesOrderPdf\(\{[\s\S]*client,[\s\S]*pdfLoader/.test(
      convertRoute
    ) ||
    !/sendSalesOrderEmail\(\{[\s\S]*client,[\s\S]*locales/.test(convertRoute)
  ) {
    missing.push(
      "Quote conversion route must verify quote company scope and keep conversion follow-up document/email work on the request-scoped sales client."
    );
  }

  const dragRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.drag.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      dragRoute
    ) ||
    !/getQuote\(\s*client,\s*quoteId\s*\)/.test(dragRoute) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(dragRoute) ||
    !/upsertPart\(\s*client,\s*partData\s*\)/.test(dragRoute) ||
    !/upsertQuoteLine\(\s*client,\s*quoteLineData\s*\)/.test(dragRoute) ||
    !/upsertQuoteLineMethod\(\s*client,\s*\{/.test(dragRoute) ||
    !/\.from\("quoteLine"\)[\s\S]*\.eq\("id",\s*targetLineId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      dragRoute
    ) ||
    !/\.from\("item"\)[\s\S]*\.eq\("id",\s*partId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      dragRoute
    )
  ) {
    missing.push(
      "Quote drag route must verify quote company scope and keep part/line/method/model writes on the request-scoped sales client with company filters."
    );
  }

  const duplicateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.duplicate.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      duplicateRoute
    ) ||
    !/getQuote\(\s*client,\s*quoteId\s*\)/.test(duplicateRoute) ||
    !/quote\.data\?\.companyId\s*!==\s*companyId/.test(duplicateRoute) ||
    !/copyQuote\(\s*client,\s*\{/.test(duplicateRoute)
  ) {
    missing.push(
      "Quote duplicate route must verify source quote company scope and dispatch quote copy through the request-scoped sales client."
    );
  }

  const lineRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.$lineId.details.tsx"),
    "utf8"
  );
  const quoteLinesRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/sales.quotes.$id.lines.ts"),
    "utf8"
  );
  const quoteMakeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.$lineId.make.$methodId.tsx"),
    "utf8"
  );
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const mcpSalesTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/sales.ts"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"sales"/.test(
      lineRoute
    ) ||
    !/getQuoteLine\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/getQuoteOperationsByLine\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/getQuoteLinePrices\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/line\.data\.companyId\s*!==\s*companyId/.test(lineRoute) ||
    !/getRootQuoteMakeMethod\(\s*client,\s*lineId,\s*companyId\s*\)/.test(lineRoute) ||
    !/getQuoteMaterialsByMethodId\(\s*client,\s*methodId,\s*companyId\s*\)/.test(lineRoute) ||
    !/getQuoteOperationsByMethodId\(\s*client,\s*methodId\s*\)/.test(lineRoute) ||
    !/getConfigurationParametersByQuoteLineId\(\s*client,\s*lineId,\s*companyId\s*\)/.test(
      lineRoute
    ) ||
    !/getModelByQuoteLineId\(\s*client,\s*lineId\s*\)/.test(lineRoute) ||
    !/getOpportunityLineDocuments\(\s*client,\s*companyId,\s*lineId,\s*itemId\s*\)/.test(
      lineRoute
    ) ||
    !/getRelatedPricesForQuoteLine\(\s*client,\s*itemId,\s*quoteId,\s*companyId\s*\)/.test(
      lineRoute
    ) ||
    !/getQuote\(\s*viewClient,\s*quoteId\s*\)/.test(lineRoute) ||
    !/quote\.data\.companyId\s*!==\s*companyId/.test(lineRoute) ||
    !/upsertQuoteLine\(\s*client,\s*\{/.test(lineRoute) ||
    !/calculatePricesForQuantities\(\s*client,/.test(lineRoute) ||
    !/resolveQuoteLinePrices\(\s*client,/.test(lineRoute) ||
    !/resolvePurchaseToOrderPrices\(\s*client,/.test(lineRoute)
  ) {
    missing.push(
      "Quote line detail/action route must keep line/method/pricing/document reads and writes on the request-scoped sales client with company checks."
    );
  }

  if (
    /id,\s*description,\s*\.\.\.item\(readableIdWithRevision\)|\*,\s*\.\.\.item\(itemType:type\)|\*,\s*item\(name,\s*itemTrackingType,\s*replenishmentSystem\)/.test(
      salesService
    ) ||
    !/function\s+getQuoteLinesList\([\s\S]*companyId:\s*string[\s\S]*\.from\("quoteLine"\)[\s\S]*\.select\("id, description, itemId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, readableIdWithRevision"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesService
    ) ||
    !/function\s+getQuoteMakeMethod\([\s\S]*companyId:\s*string[\s\S]*\.from\("quoteMakeMethod"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("type"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesService
    ) ||
    !/function\s+getRootQuoteMakeMethod\([\s\S]*companyId:\s*string[\s\S]*\.from\("quoteMakeMethod"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("type"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesService
    ) ||
    !/function\s+getQuoteMaterialsByMethodId\([\s\S]*companyId:\s*string[\s\S]*\.from\("quoteMaterial"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, name, itemTrackingType, replenishmentSystem"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      salesService
    ) ||
    !/getQuoteLinesList\(\s*client,\s*id,\s*companyId\s*\)/.test(
      quoteLinesRoute
    ) ||
    !/getQuoteMakeMethod\(\s*client,\s*methodId,\s*companyId\s*\)/.test(
      quoteMakeRoute
    ) ||
    !/getQuoteMaterialsByMethodId\(\s*client,\s*methodId,\s*companyId\s*\)/.test(
      quoteMakeRoute
    ) ||
    !/getQuoteLinesList\([\s\S]*ctx\.client,[\s\S]*params\.quoteId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    ) ||
    !/getQuoteMakeMethod\([\s\S]*ctx\.client,[\s\S]*params\.quoteMakeMethodId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    ) ||
    !/getRootQuoteMakeMethod\([\s\S]*ctx\.client,[\s\S]*params\.quoteLineId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    ) ||
    !/getQuoteMaterialsByMethodId\([\s\S]*ctx\.client,[\s\S]*params\.quoteMakeMethodId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    )
  ) {
    missing.push(
      "Quote line and quote method helpers must resolve item metadata through explicit request-company-scoped item queries."
    );
  }

  const configureRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.$lineId.configure.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{[\s\S]*update:\s*"production"/.test(
      configureRoute
    ) ||
    occurrences(configureRoute, '.eq("companyId", companyId)') < 4 ||
    !/upsertQuoteLineMethod\(\s*client,\s*\{/.test(configureRoute) ||
    !/getSupplierPriceBreaksForItems\(\s*client,\s*buyItemIds\s*\)/.test(
      configureRoute
    )
  ) {
    missing.push(
      "Quote line configure route must company-scope line/material updates and dispatch method/pricing work through the request client."
    );
  }

  return missing;
}

function quoteMethodRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/quote+/methods+/save.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/get.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.material.new.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.material.$id.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.material.delete.$id.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.operation.new.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.operation.$id.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/operation.delete.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for quote method work.`
      );
    }
  }

  const saveRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/methods+/save.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"sales"/.test(
      saveRoute
    ) ||
    !/upsertMakeMethodFromQuoteLine\(\s*client,\s*\{/.test(saveRoute) ||
    !/upsertMakeMethodFromQuoteMethod\(\s*client,\s*\{/.test(saveRoute)
  ) {
    missing.push(
      "Quote method save route must save quote methods through the request-scoped sales client."
    );
  }

  const getRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/methods+/get.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"sales"/.test(
      getRoute
    ) ||
    !/upsertQuoteLineMethod\(\s*client,\s*lineMethodPayload\s*\)/.test(
      getRoute
    ) ||
    !/copyQuoteLine\(\s*client,\s*\{/.test(getRoute) ||
    !/upsertQuoteMaterialMakeMethod\(\s*client,\s*makeMethodPayload\s*\)/.test(
      getRoute
    )
  ) {
    missing.push(
      "Quote method get/copy route must dispatch method copy helpers through the request-scoped sales client."
    );
  }

  const materialNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.material.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      materialNewRoute
    ) ||
    !/upsertQuoteMaterial\(\s*client,\s*\{/.test(materialNewRoute) ||
    !/\.from\("quoteMaterialWithMakeMethodId"\)/.test(materialNewRoute) ||
    !/upsertQuoteMaterialMakeMethod\(\s*client,\s*\{/.test(materialNewRoute) ||
    !/recalculateQuoteLinePrices\(\s*client,\s*quoteId,\s*lineId,\s*userId\s*\)/.test(
      materialNewRoute
    )
  ) {
    missing.push(
      "Quote material creation route must create materials, method copies, and price recalculation through the request client."
    );
  }

  const materialUpdateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.material.$id.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
      materialUpdateRoute
    ) ||
    !/upsertQuoteMaterial\(\s*client,\s*\{/.test(materialUpdateRoute) ||
    !/recalculateQuoteLinePrices\(\s*client,\s*quoteId,\s*lineId,\s*userId\s*\)/.test(
      materialUpdateRoute
    )
  ) {
    missing.push(
      "Quote material update route must update materials and recalculate prices through the request client."
    );
  }

  const materialDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.material.delete.$id.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"sales"/.test(
      materialDeleteRoute
    ) ||
    !/\.from\("quoteMaterial"\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      materialDeleteRoute
    ) ||
    !/recalculateQuoteLinePrices\(\s*client,\s*quoteId,\s*lineId,\s*userId\s*\)/.test(
      materialDeleteRoute
    )
  ) {
    missing.push(
      "Quote material delete route must company-scope material deletion and recalculate prices through the request client."
    );
  }

  for (const file of [
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.operation.new.tsx",
    "apps/erp/app/routes/x+/quote+/methods+/$quoteId.$lineId.operation.$id.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (
      !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"sales"/.test(
        source
      ) ||
      !/upsertQuoteOperation\(\s*client,\s*\{/.test(source) ||
      !/recalculateQuoteLinePrices\(\s*client,\s*quoteId,\s*lineId,\s*userId\s*\)/.test(
        source
      )
    ) {
      missing.push(
        `${file} must upsert quote operations and recalculate prices through the request-scoped sales client.`
      );
    }
  }

  const operationDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/methods+/operation.delete.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"sales"/.test(
      operationDeleteRoute
    ) ||
    occurrences(operationDeleteRoute, '.eq("companyId", companyId)') < 2 ||
    !/recalculateQuoteLinePrices\(\s*client,\s*op\.data\.quoteId,\s*op\.data\.quoteLineId,\s*userId\s*\)/.test(
      operationDeleteRoute
    )
  ) {
    missing.push(
      "Quote operation delete route must company-scope operation lookup/delete and recalculate prices through the request client."
    );
  }

  return missing;
}

function jobMethodRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/job+/methods+/save.tsx",
    "apps/erp/app/routes/x+/job+/methods+/get.tsx",
    "apps/erp/app/routes/x+/job+/methods+/$jobId.operation.order.tsx",
    "apps/erp/app/routes/x+/job+/methods+/operation.procedure.sync.tsx",
    "apps/erp/app/routes/x+/job+/methods+/$jobId.material.delete.$id.tsx",
    "apps/erp/app/routes/x+/job+/methods+/$jobId.operation.delete.tsx",
    "apps/erp/app/routes/x+/job+/methods+/$jobId.operation.new.tsx",
    "apps/erp/app/routes/x+/job+/methods+/$jobId.material.new.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for job method work.`
      );
    }
  }

  const saveRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/save.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"production"/.test(
      saveRoute
    ) ||
    occurrences(saveRoute, '.eq("companyId", companyId)') < 3 ||
    !/\.from\("job"\)/.test(saveRoute) ||
    !/\.from\("jobMakeMethod"\)/.test(saveRoute) ||
    occurrences(saveRoute, '.from("makeMethod")') < 2 ||
    !/upsertMakeMethodFromJob\(\s*client,\s*\{/.test(saveRoute) ||
    !/upsertMakeMethodFromJobMethod\(\s*client,\s*\{/.test(saveRoute)
  ) {
    missing.push(
      "Job method save route must verify job/method company scope and save methods through the request-scoped production client."
    );
  }

  const getRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/get.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"production"/.test(
      getRoute
    ) ||
    occurrences(getRoute, '.eq("companyId", companyId)') < 4 ||
    !/upsertJobMethod\(\s*client,\s*/.test(getRoute) ||
    !/recalculateJobRequirements\(\s*client,\s*\{/.test(getRoute) ||
    !/recalculateJobOperationDependencies\(\s*client,\s*\{/.test(getRoute) ||
    !/upsertJobMaterialMakeMethod\(\s*client,/.test(getRoute)
  ) {
    missing.push(
      "Job method get route must verify source/target company scope and dispatch copy/recalculate helpers through the request client."
    );
  }

  const orderRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/$jobId.operation.order.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"production"/.test(
      orderRoute
    ) ||
    !/\.from\("jobOperation"\)[\s\S]*\.update\(\{ order, updatedBy \}\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("jobId",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      orderRoute
    ) ||
    !/recalculateJobOperationDependencies\(\s*client,\s*\{/.test(orderRoute)
  ) {
    missing.push(
      "Job operation order route must company/job-scope operation ordering and recalculate dependencies through the request client."
    );
  }

  const procedureRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/operation.procedure.sync.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"production"/.test(
      procedureRoute
    ) ||
    !/\.from\("jobOperation"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      procedureRoute
    ) ||
    !/\.from\("procedure"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      procedureRoute
    ) ||
    !/invokeFunction\("get-method"/.test(procedureRoute)
  ) {
    missing.push(
      "Job operation procedure sync route must verify operation/procedure company scope before invoking method sync."
    );
  }

  const materialDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/$jobId.material.delete.$id.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"production"/.test(
      materialDeleteRoute
    ) ||
    !/\.from\("jobMaterial"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("jobId",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      materialDeleteRoute
    ) ||
    !/recalculateJobOperationDependencies\(\s*client,\s*\{/.test(
      materialDeleteRoute
    )
  ) {
    missing.push(
      "Job material delete route must company/job-scope material deletion and recalculate through the request client."
    );
  }

  const operationDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/$jobId.operation.delete.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"production"/.test(
      operationDeleteRoute
    ) ||
    !/\.from\("jobOperation"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("jobId",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationDeleteRoute
    ) ||
    !/recalculateJobOperationDependencies\(\s*client,\s*\{/.test(
      operationDeleteRoute
    )
  ) {
    missing.push(
      "Job operation delete route must company/job-scope operation deletion and recalculate through the request client."
    );
  }

  const operationNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/$jobId.operation.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"production"/.test(
      operationNewRoute
    ) ||
    !/\.from\("job"\)[\s\S]*\.eq\("id",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationNewRoute
    ) ||
    !/upsertJobOperation\(\s*client,\s*\{/.test(operationNewRoute) ||
    !/recalculateJobMakeMethodRequirements\(\s*client,\s*\{/.test(
      operationNewRoute
    ) ||
    !/recalculateJobOperationDependencies\(\s*client,\s*\{/.test(
      operationNewRoute
    )
  ) {
    missing.push(
      "Job operation creation route must company-scope the job and use the request client for operation/recalculate work."
    );
  }

  const materialNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/methods+/$jobId.material.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"production"/.test(
      materialNewRoute
    ) ||
    !/\.from\("job"\)[\s\S]*\.eq\("id",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      materialNewRoute
    ) ||
    !/upsertJobMaterial\(\s*client,\s*\{/.test(materialNewRoute) ||
    !/\.from\("jobMaterialWithMakeMethodId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      materialNewRoute
    ) ||
    !/upsertJobMaterialMakeMethod\(\s*client,\s*\{/.test(materialNewRoute) ||
    !/recalculateJobMakeMethodRequirements\(\s*client,\s*\{/.test(
      materialNewRoute
    ) ||
    !/recalculateJobOperationDependencies\(\s*client,\s*\{/.test(
      materialNewRoute
    )
  ) {
    missing.push(
      "Job material creation route must company-scope the job/material method and use the request client for material/recalculate work."
    );
  }

  return missing;
}

function resourceSubmissionRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/feedback.tsx",
    "apps/erp/app/routes/x+/resources+/suggestions.new.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the authenticated request-scoped Better Auth client.`
      );
    }
  }

  const feedbackRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/feedback.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      feedbackRoute
    ) ||
    !/client[\s\S]*\.from\("company"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      feedbackRoute
    ) ||
    !/client[\s\S]*\.from\("user"\)[\s\S]*\.eq\("id",\s*userId\)/.test(
      feedbackRoute
    ) ||
    !/client\.from\("feedback"\)\.insert/.test(feedbackRoute)
  ) {
    missing.push(
      "Feedback route must read company/user context and insert feedback through the request-scoped client."
    );
  }

  const suggestionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/resources+/suggestions.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      suggestionRoute
    ) ||
    !/client[\s\S]*\.from\("suggestion"\)[\s\S]*companyId/.test(
      suggestionRoute
    ) ||
    !/getCompany\(\s*client,\s*companyId\s*\)/.test(suggestionRoute)
  ) {
    missing.push(
      "Suggestion route must insert suggestions and read notification settings through the request-scoped client."
    );
  }

  return missing;
}

function maintenanceIssueRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/maintenance+/$dispatchId.item.$itemId.delete.tsx",
    "apps/erp/app/routes/x+/maintenance+/$dispatchId.add-and-issue.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must not construct a carbon_service database client for maintenance issue work.`
      );
    }
  }

  const deleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/maintenance+/$dispatchId.item.$itemId.delete.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"resources"/.test(
      deleteRoute
    ) ||
    !/getMaintenanceDispatch\(\s*viewClient,\s*dispatchId\s*\)/.test(
      deleteRoute
    ) ||
    !/dispatch\.data\?\.companyId\s*!==\s*companyId/.test(deleteRoute) ||
    !/invokeFunction\("issue"[\s\S]*maintenanceDispatchUnissue[\s\S]*companyId[\s\S]*userId/.test(
      deleteRoute
    )
  ) {
    missing.push(
      "Maintenance dispatch item delete route must verify dispatch company scope before unissuing inventory."
    );
  }

  const addRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/maintenance+/$dispatchId.add-and-issue.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"resources"/.test(
      addRoute
    ) ||
    !/getMaintenanceDispatch\(\s*client,\s*dispatchId\s*\)/.test(addRoute) ||
    !/dispatch\.data\?\.companyId\s*!==\s*companyId/.test(addRoute) ||
    !/invokeFunction\("issue"[\s\S]*maintenanceDispatchTrackedEntities[\s\S]*companyId[\s\S]*userId/.test(
      addRoute
    ) ||
    !/invokeFunction\("issue"[\s\S]*maintenanceDispatchInventory[\s\S]*companyId[\s\S]*userId/.test(
      addRoute
    )
  ) {
    missing.push(
      "Maintenance add-and-issue route must authorize update resources, verify dispatch company scope, and invoke issue with request user/company."
    );
  }

  return missing;
}

function maintenanceDispatchJobScopeFailures() {
  const missing = [];
  const dispatchJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/scheduled/dispatch.ts"),
    "utf8"
  );

  if (
    !/\.from\("companySettings"\)[\s\S]*\.select\(\s*"id,\s*maintenanceGenerateInAdvance,\s*maintenanceAdvanceDays,\s*maintenanceDispatchNotificationGroup"\s*\)[\s\S]*\.eq\("maintenanceGenerateInAdvance",\s*true\)/.test(
      dispatchJob
    ) ||
    !/\.from\("company"\)[\s\S]*\.select\("id, name, active"\)[\s\S]*\.in\("id",\s*companyIds\)/.test(
      dispatchJob
    ) ||
    !/company\?\.active\s*!==\s*true[\s\S]*Skipping inactive company/.test(
      dispatchJob
    )
  ) {
    missing.push(
      "Scheduled maintenance dispatch job must scan maintenance-enabled settings, explicitly load company rows, and skip inactive companies before service-client dispatch work."
    );
  }

  if (
    !/\.from\("workCenter"\)[\s\S]*\.eq\("id",\s*typedSchedule\.workCenterId\)[\s\S]*\.eq\("companyId",\s*settings\.id\)[\s\S]*Skipping schedule/.test(
      dispatchJob
    )
  ) {
    missing.push(
      "Scheduled maintenance dispatch job must verify schedule work centers belong to the company before service-client dispatch creation."
    );
  }

  if (
    !/\.from\("maintenanceScheduleItem"\)[\s\S]*\.eq\("maintenanceScheduleId",\s*schedule\.id\)[\s\S]*\.eq\("companyId",\s*settings\.id\)/.test(
      dispatchJob
    ) ||
    !/maintenanceDispatchNotificationGroup/.test(dispatchJob) ||
    !/recipient:\s*\{[\s\S]*type:\s*"group"\s+as\s+const,[\s\S]*groupIds:\s*notificationGroup/.test(
      dispatchJob
    ) ||
    !/\.from\("maintenanceSchedule"\)[\s\S]*\.update\(\{[\s\S]*nextDueAt:[\s\S]*\.eq\("id",\s*schedule\.id\)[\s\S]*\.eq\("companyId",\s*settings\.id\)/.test(
      dispatchJob
    )
  ) {
    missing.push(
      "Scheduled maintenance dispatch job must carry company scope through schedule items, configured notification groups, and schedule updates."
    );
  }

  return missing;
}

function notificationJobServiceClientScopeFailures() {
  const missing = [];
  const notifyJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/notifications/notify.ts"),
    "utf8"
  );
  const descriptionStart = notifyJob.indexOf("async function getDescription");
  const descriptionEnd = notifyJob.indexOf("export const notifyFunction");
  const description =
    descriptionStart >= 0 && descriptionEnd > descriptionStart
      ? notifyJob.slice(descriptionStart, descriptionEnd)
      : "";
  const relationSelectorPattern =
    /\.select\(\s*["'`][^"'`]*(?:\.\.\.|[A-Za-z_][\w!]*\([^"'`]*\))/;

  if (
    !/async function getDescription\([\s\S]*documentId:\s*string,\s*companyId:\s*string/.test(
      notifyJob
    ) ||
    !/getDescription\(\s*client,\s*payload\.event,\s*payload\.documentId,\s*payload\.companyId/.test(
      notifyJob
    )
  ) {
    missing.push(
      "Notification job description lookup must receive the event company scope before using the service client."
    );
  }

  if (relationSelectorPattern.test(description)) {
    missing.push(
      "Notification job description reads must use explicit direct-query lookups instead of Supabase/PostgREST relation selectors."
    );
  }

  if (
    !/async function getWorkCenterName\([\s\S]*\.from\("workCenter"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("id",\s*workCenterId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      notifyJob
    ) ||
    !/async function getJobReadableId\([\s\S]*\.from\("job"\)[\s\S]*\.select\("jobId"\)[\s\S]*\.eq\("id",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      notifyJob
    ) ||
    !/async function getTrainingName\([\s\S]*\.from\("training"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("id",\s*trainingId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      notifyJob
    ) ||
    !/async function getCompanyUserFullName\([\s\S]*\.from\("userToCompany"\)[\s\S]*\.eq\("userId",\s*userId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("user"\)[\s\S]*\.select\("fullName"\)/.test(
      notifyJob
    )
  ) {
    missing.push(
      "Notification job relation metadata must be loaded through explicit company-scoped follow-up reads."
    );
  }

  const descriptionTables = [
    "salesRfq",
    "quote",
    "salesOrder",
    "maintenanceDispatch",
    "nonConformance",
    "job",
    "jobOperation",
    "procedure",
    "gaugeCalibrationRecord",
    "stockTransfer",
    "trainingAssignment",
    "suggestion",
    "riskRegister",
    "supplierQuote",
    "purchaseOrder",
    "qualityDocument",
  ];

  for (const table of descriptionTables) {
    const lookupPattern = new RegExp(
      `\\.from\\("${table}"\\)[\\s\\S]*?\\.single\\(\\)`,
      "g"
    );
    const lookups = description.match(lookupPattern) ?? [];
    if (lookups.length === 0) {
      missing.push(
        `Notification job description lookup must keep an audited ${table} read.`
      );
      continue;
    }

    if (
      lookups.some(
        (lookup) => !/\.eq\("companyId",\s*companyId\)/.test(lookup)
      )
    ) {
      missing.push(
        `Notification job ${table} description reads must be scoped by the event company.`
      );
    }
  }

  if (
    !/\.from\("userToCompany"\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)[\s\S]*\.in\("userId",\s*filteredUserIds\)/.test(
      notifyJob
    ) ||
    !/new Set\(scopedUserIds\)/.test(notifyJob)
  ) {
    missing.push(
      "Notification job bulk recipients must be filtered to users in the event company before Novu subscriber IDs are generated."
    );
  }

  return missing;
}

function sendEmailJobServiceClientScopeFailures() {
  const missing = [];
  const sendEmailJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/notifications/send-email.ts"),
    "utf8"
  );

  if (
    !/\.from\("company"\)[\s\S]*\.select\("name,\s*active"\)[\s\S]*\.eq\("id",\s*payload\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      sendEmailJob
    ) ||
    !/companyActive:\s*companyResult\.data\?\.active\s*===\s*true/.test(
      sendEmailJob
    )
  ) {
    missing.push(
      "Send-email job must verify the payload company is active before using service-client email settings."
    );
  }

  if (
    !/\.from\("companyIntegration"\)[\s\S]*\.select\("active,\s*metadata"\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)[\s\S]*\.eq\("id",\s*"email"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.maybeSingle\(\)/.test(
      sendEmailJob
    ) ||
    !/!companyActive\s*\|\|\s*!parsedMetadata\.success\s*\|\|\s*!integrationActive/.test(
      sendEmailJob
    )
  ) {
    missing.push(
      "Send-email job must fetch only the active email integration inside the payload company and fail closed before sending."
    );
  }

  return missing;
}

function auditEventWorkerScopeFailures() {
  const missing = [];
  const auditWorker = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/events/audit.ts"),
    "utf8"
  );

  if (
    !/const\s+byCompany\s*=\s*groupBy\(payload\.records,\s*\(r\)\s*=>\s*r\.companyId\)/.test(
      auditWorker
    )
  ) {
    missing.push(
      "Audit event worker must batch service-client work by event companyId."
    );
  }

  if (
    !/\.from\("company"\)[\s\S]*\.select\("auditLogEnabled,\s*active"\)[\s\S]*\.eq\("id",\s*companyId\)[\s\S]*const\s+companySettings[\s\S]*!companySettings\?\.active\s*\|\|\s*!companySettings\.auditLogEnabled/.test(
      auditWorker
    )
  ) {
    missing.push(
      "Audit event worker must skip inactive companies and companies without audit logging enabled."
    );
  }

  if (
    !/\.from\(junction as any\)[\s\S]*\.select\(entityIdColumn\)[\s\S]*\.eq\(fk,\s*record\.event\.recordId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      auditWorker
    )
  ) {
    missing.push(
      "Audit event worker indirect entity resolution must bind junction lookups to the event company."
    );
  }

  if (
    !/applyFkSnapshots\(client,\s*companyId,\s*entries\)/.test(auditWorker) ||
    !/\.from\(table\)[\s\S]*\.select\(selectClause\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.in\("id",\s*Array\.from\(ids\)\)/.test(
      auditWorker
    )
  ) {
    missing.push(
      "Audit event worker snapshot lookups must stay scoped to the event company."
    );
  }

  if (
    !/\.rpc\("insert_audit_log_batch",\s*\{[\s\S]*p_company_id:\s*companyId[\s\S]*p_entries:\s*entries/.test(
      auditWorker
    )
  ) {
    missing.push(
      "Audit event worker must insert audit rows through the company-scoped batch RPC."
    );
  }

  return missing;
}

function scheduledCleanupJobScopeFailures() {
  const missing = [];
  const cleanupJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/scheduled/cleanup.ts"),
    "utf8"
  );

  if (
    !/async function filterRowsToActiveCompanies[\s\S]*\.from\("company"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.in\("id",\s*companyIds\)[\s\S]*activeCompanyIds\.has\(row\.companyId\)/.test(
      cleanupJob
    )
  ) {
    missing.push(
      "Scheduled cleanup must filter global service-client scan rows to active companies before status updates or notifications."
    );
  }

  if (
    !/activeExpiredSupplierQuotes[\s\S]*filterRowsToActiveCompanies\(\s*serviceClient,\s*expiredSupplierQuotes\.data\s*\)[\s\S]*activeExpiredSupplierQuotes\.map\(\(quote\)\s*=>\s*quote\.companyId\)[\s\S]*\.from\("supplierQuote"\)[\s\S]*\.update\(\{\s*status:\s*"Expired"\s*\}\)[\s\S]*activeExpiredSupplierQuotes\.map\(\(quote\)\s*=>\s*quote\.id\)[\s\S]*\.in\("companyId",\s*companyIds\)/.test(
      cleanupJob
    )
  ) {
    missing.push(
      "Scheduled cleanup must company-scope expired supplier quote status updates."
    );
  }

  if (
    !/activeExpiredRfqs[\s\S]*filterRowsToActiveCompanies\(\s*serviceClient,\s*expiredRfqs\.data\s*\)[\s\S]*activeExpiredRfqs\.map\(\(rfq\)\s*=>\s*rfq\.companyId\)[\s\S]*\.from\("purchasingRfq"\)[\s\S]*\.update\(\{\s*status:\s*"Closed"\s*\}\)[\s\S]*activeExpiredRfqs\.map\(\(rfq\)\s*=>\s*rfq\.id\)[\s\S]*\.in\("companyId",\s*companyIds\)/.test(
      cleanupJob
    )
  ) {
    missing.push(
      "Scheduled cleanup must company-scope expired RFQ status updates."
    );
  }

  if (
    !/activeExpiredQuotes[\s\S]*filterRowsToActiveCompanies\(\s*serviceClient,\s*expiredQuotes\.data\s*\)[\s\S]*activeExpiredQuotes\.map\(\(quote\)\s*=>\s*quote\.companyId\)[\s\S]*\.from\("quote"\)[\s\S]*\.update\(\{\s*status:\s*"Expired"\s*\}\)[\s\S]*activeExpiredQuotes\.map\(\(quote\)\s*=>\s*quote\.id\)[\s\S]*\.in\("companyId",\s*companyIds\)[\s\S]*const notificationPayloads:[\s\S]*activeExpiredQuotes/.test(
      cleanupJob
    )
  ) {
    missing.push(
      "Scheduled cleanup must company-scope expired quote status updates."
    );
  }

  if (
    !/activeOutOfCalibrationGauges[\s\S]*filterRowsToActiveCompanies\(\s*serviceClient,\s*outOfCalibrationGauges\.data\s*\)[\s\S]*for\s*\(const gauge of activeOutOfCalibrationGauges\)[\s\S]*const\s+gaugeCompanyIdsToUpdate\s*=\s*\[[\s\S]*activeOutOfCalibrationGauges[\s\S]*\.filter\(\(gauge\)\s*=>\s*gaugeIdsToUpdate\.includes\(gauge\.id\)\)[\s\S]*\.map\(\(gauge\)\s*=>\s*gauge\.companyId\)[\s\S]*\.from\("gauge"\)[\s\S]*\.update\(\{\s*lastCalibrationStatus:\s*"Out-of-Calibration"\s*\}\)[\s\S]*\.in\("id",\s*gaugeIdsToUpdate\)[\s\S]*\.in\("companyId",\s*gaugeCompanyIdsToUpdate\)/.test(
      cleanupJob
    )
  ) {
    missing.push(
      "Scheduled cleanup must company-scope gauge calibration status updates."
    );
  }

  return missing;
}

function scheduledAuditArchiveJobScopeFailures() {
  const missing = [];
  const auditArchiveJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/scheduled/audit-archive.ts"),
    "utf8"
  );

  if (
    !/\.from\("company"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("auditLogEnabled",\s*true\)[\s\S]*\.eq\("active",\s*true\)/.test(
      auditArchiveJob
    )
  ) {
    missing.push(
      "Scheduled audit archive must only scan active companies with audit logging enabled."
    );
  }

  if (
    !/client\.rpc\(\s*"get_audit_logs_for_archive",\s*\{[\s\S]*p_company_id:\s*companyId[\s\S]*p_before_date:\s*cutoffDate\.toISOString\(\)/.test(
      auditArchiveJob
    ) ||
    !/client\.rpc\(\s*"delete_old_audit_logs",\s*\{[\s\S]*p_company_id:\s*companyId[\s\S]*p_cutoff_date:\s*cutoffDate\.toISOString\(\)/.test(
      auditArchiveJob
    )
  ) {
    missing.push(
      "Scheduled audit archive RPCs must receive the company being archived."
    );
  }

  if (
    !/const\s+archivePath\s*=\s*`\$\{companyId\}\/audit-logs\//.test(
      auditArchiveJob
    ) ||
    !/uploadObject\(\{[\s\S]*companyId,[\s\S]*key:\s*archivePath/.test(
      auditArchiveJob
    ) ||
    !/removeObject\(\{\s*companyId,\s*key:\s*archivePath\s*\}\)/.test(
      auditArchiveJob
    )
  ) {
    missing.push(
      "Scheduled audit archive must write and clean up direct S3 objects with company-scoped keys."
    );
  }

  if (
    !/\.from\("auditLogArchive"\)\.insert\(\{[\s\S]*companyId,[\s\S]*archivePath,[\s\S]*rowCount:\s*records\.length/.test(
      auditArchiveJob
    )
  ) {
    missing.push(
      "Scheduled audit archive metadata insert must retain the archived companyId."
    );
  }

  return missing;
}

function scheduledMrpJobScopeFailures() {
  const missing = [];
  const mrpJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/scheduled/mrp.ts"),
    "utf8"
  );

  if (
    !/\.from\("companyPlan"\)[\s\S]*\.select\("id"\)/.test(
      mrpJob
    ) ||
    !/\.from\("company"\)[\s\S]*\.select\("id, name, active"\)[\s\S]*\.in\("id",\s*companyIds\)/.test(
      mrpJob
    )
  ) {
    missing.push(
      "Scheduled MRP must explicitly load active company rows before service-client dispatch."
    );
  }

  if (!/if\s*\(\s*company\?\.active\s*!==\s*true\s*\)[\s\S]*continue;/.test(mrpJob)) {
    missing.push("Scheduled MRP must skip inactive companies.");
  }

  if (
    !/invokeFunction\(\s*"mrp",\s*\{[\s\S]*body:\s*\{[\s\S]*type:\s*"company"[\s\S]*id:\s*plan\.id[\s\S]*companyId:\s*plan\.id[\s\S]*userId:\s*"system"/.test(
      mrpJob
    )
  ) {
    missing.push(
      "Scheduled MRP must dispatch with companyId derived from the companyPlan/company row being processed."
    );
  }

  return missing;
}

function timecardAutoCloseJobScopeFailures() {
  const missing = [];
  const timecardJob = readFileSync(
    resolve(
      repoRoot,
      "packages/jobs/src/inngest/functions/integrations/timecard-auto-close.ts"
    ),
    "utf8"
  );

  if (
    !/\.from\("companySettings"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("timeCardEnabled",\s*true\)/.test(
      timecardJob
    ) ||
    !/\.from\("company"\)[\s\S]*\.select\("id, name, active"\)[\s\S]*\.in\("id",\s*companyIds\)/.test(
      timecardJob
    ) ||
    !/if\s*\(\s*company\?\.active\s*!==\s*true\s*\)[\s\S]*continue;/.test(
      timecardJob
    )
  ) {
    missing.push(
      "Timecard auto-close job must scan only time-clock-enabled settings, explicitly load companies, and skip inactive companies before service-client timecard work."
    );
  }

  if (
    !/\.from\("timeCardEntry"\)[\s\S]*\.select\("id, employeeId, clockIn"\)[\s\S]*\.eq\("companyId",\s*company\.id\)[\s\S]*\.is\("clockOut",\s*null\)/.test(
      timecardJob
    )
  ) {
    missing.push(
      "Timecard auto-close job must select open entries under the company being processed."
    );
  }

  if (
    !/\.from\("employeeJob"\)[\s\S]*\.select\("shiftId"\)[\s\S]*\.eq\("id",\s*entry\.employeeId\)[\s\S]*\.eq\("companyId",\s*company\.id\)/.test(
      timecardJob
    )
  ) {
    missing.push(
      "Timecard auto-close job must scope employee job reads by the company being processed."
    );
  }

  if (
    !/\.from\("shift"\)[\s\S]*\.select\("startTime, endTime"\)[\s\S]*\.eq\("id",\s*employeeJob\.shiftId\)[\s\S]*\.eq\("companyId",\s*company\.id\)/.test(
      timecardJob
    )
  ) {
    missing.push(
      "Timecard auto-close job must scope shift reads by the company being processed."
    );
  }

  if (
    !/\.from\("timeCardEntry"\)[\s\S]*\.update\(\{[\s\S]*clockOut:[\s\S]*autoCloseShiftId:[\s\S]*updatedAt:[\s\S]*note:[\s\S]*\}\)[\s\S]*\.eq\("id",\s*entry\.id\)[\s\S]*\.eq\("companyId",\s*company\.id\)/.test(
      timecardJob
    )
  ) {
    missing.push(
      "Timecard auto-close job must company-scope the service-client timeCardEntry update."
    );
  }

  return missing;
}

function weeklyTrainingReminderJobScopeFailures() {
  const missing = [];
  const weeklyJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/scheduled/weekly.ts"),
    "utf8"
  );

  if (
    !/\.from\("trainingAssignment"\)[\s\S]*\.select\("companyId"\)[\s\S]*const\s+uniqueCompanyIds\s*=\s*\[[\s\S]*new Set\(companiesWithTrainings\?\.map\(\(c\)\s*=>\s*c\.companyId\)/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly training reminder job must derive work batches from trainingAssignment company IDs."
    );
  }

  if (
    !/\.from\("company"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.in\("id",\s*uniqueCompanyIds\)/.test(
      weeklyJob
    ) ||
    !/const\s+activeCompanyIds\s*=[\s\S]*activeCompanies\?\.map\(\(company\)\s*=>\s*company\.id\)/.test(
      weeklyJob
    ) ||
    !/for\s*\(const companyId of activeCompanyIds\)/.test(weeklyJob)
  ) {
    missing.push(
      "Weekly training reminder job must filter training-assignment companies to active companies before RPC and notification work."
    );
  }

  if (
    !/serviceClient\.rpc\("get_training_assignment_status",\s*\{\s*p_company_id:\s*companyId\s*\}\)/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly training reminder job must call the training status RPC with the company being processed."
    );
  }

  if (
    !/const\s+outstandingTrainings\s*=\s*\(trainingStatus\s*\?\?\s*\[\]\)\.filter\(\s*\(t:\s*any\)\s*=>[\s\S]*t\.companyId\s*===\s*companyId[\s\S]*t\.status\s*===\s*"Pending"[\s\S]*t\.status\s*===\s*"Overdue"/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly training reminder job must filter returned training rows back to the company being processed before sending notifications."
    );
  }

  if (
    !/name:\s*"carbon\/notify"[\s\S]*data:\s*\{[\s\S]*companyId:\s*assignment\.companyId[\s\S]*documentId:\s*assignment\.trainingAssignmentId[\s\S]*recipient:\s*\{[\s\S]*type:\s*"user"\s+as\s+const,[\s\S]*userId:\s*assignment\.employeeId/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly training reminder notifications must use the scoped assignment company and employee recipient."
    );
  }

  return missing;
}

function weeklyCloudCleanupJobScopeFailures() {
  const missing = [];
  const weeklyJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/scheduled/weekly.ts"),
    "utf8"
  );

  if (
    !/\.from\("company"\)[\s\S]*\.select\("id,\s*name,\s*createdAt"\)[\s\S]*\.eq\("active",\s*true\)/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly cloud cleanup must derive deletion candidates from active company rows."
    );
  }

  if (
    !/if\s*\(\s*companiesToDelete\.length\s*===\s*0\s*\)[\s\S]*return;/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly cloud cleanup must skip service-client deletes when there are no candidate companies."
    );
  }

  if (
    !/\.from\("company"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.in\(\s*"id",[\s\S]*companiesToDelete\.map\(\(company\)\s*=>\s*company\.id\)/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly cloud cleanup must bind destructive company deletes to active row-derived company IDs."
    );
  }

  if (
    !/drop_company_search_index[\s\S]*p_company_id:\s*company\.id/.test(
      weeklyJob
    )
  ) {
    missing.push(
      "Weekly cloud cleanup must drop search indexes with the deleted company ID."
    );
  }

  return missing;
}

function scheduledExchangeRateJobScopeFailures() {
  const missing = [];
  const exchangeRateJob = readFileSync(
    resolve(
      repoRoot,
      "packages/jobs/src/inngest/functions/scheduled/update-exchange-rates.ts"
    ),
    "utf8"
  );

  if (
    !/\.from\("companyIntegration"\)[\s\S]*\.select\("active, companyId"\)[\s\S]*\.eq\("id",\s*"exchange-rates-v1"\)[\s\S]*\.eq\("active",\s*true\)/.test(
      exchangeRateJob
    )
  ) {
    missing.push(
      "Scheduled exchange-rate job must derive work from active exchange-rate integrations with company IDs."
    );
  }

  if (
    !/\.from\("company"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("id",\s*integration\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      exchangeRateJob
    ) ||
    !/if\s*\(!company\.data\.companyGroupId\)/.test(exchangeRateJob)
  ) {
    missing.push(
      "Scheduled exchange-rate job must resolve an active integration company and fail closed without companyGroupId."
    );
  }

  if (
    !/\.from\("currency"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyGroupId",\s*company\.data\.companyGroupId\)/.test(
      exchangeRateJob
    )
  ) {
    missing.push(
      "Scheduled exchange-rate job must read currencies by the resolved company group."
    );
  }

  if (
    /from\("currency"\)[\s\S]*\.upsert\(/.test(exchangeRateJob) ||
    !/\.from\("currency"\)[\s\S]*\.update\(\{[\s\S]*exchangeRate:\s*currency\.exchangeRate[\s\S]*updatedAt[\s\S]*\}\)[\s\S]*\.eq\("id",\s*currency\.id\)[\s\S]*\.eq\("companyGroupId",\s*company\.data\.companyGroupId\)/.test(
      exchangeRateJob
    )
  ) {
    missing.push(
      "Scheduled exchange-rate currency writes must update by currency ID plus companyGroupId instead of privileged upsert."
    );
  }

  return missing;
}

function onboardJobServiceClientScopeFailures() {
  const missing = [];
  const onboardJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/tasks/onboard.ts"),
    "utf8"
  );

  if (
    !/\.from\("company"\)[\s\S]*\.eq\("id",\s*companyId\)[\s\S]*\.from\("user"\)[\s\S]*\.eq\("id",\s*userId\)[\s\S]*\.from\("userToCompany"\)[\s\S]*\.select\("userId"\)[\s\S]*\.eq\("userId",\s*userId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.maybeSingle\(\)/.test(
      onboardJob
    )
  ) {
    missing.push(
      "Onboard job must verify the event user belongs to the event company before service-client side effects."
    );
  }

  if (
    !/if\s*\(membership\.error\s*\|\|\s*!membership\.data\)[\s\S]*throw new Error\("User does not belong to company"\)/.test(
      onboardJob
    )
  ) {
    missing.push(
      "Onboard job must fail closed when the event user/company membership is missing."
    );
  }

  if (
    !/\.from\("user"\)[\s\S]*\.update\(\{[\s\S]*externalId:[\s\S]*twentyPersonId[\s\S]*\}\s*as any\)[\s\S]*\.eq\("id",\s*userId\)/.test(
      onboardJob
    )
  ) {
    missing.push(
      "Onboard job CRM user update shape changed; review the membership preflight audit before accepting it."
    );
  }

  return missing;
}

function postTransactionJobScopeFailures() {
  const missing = [];
  const postTransactionJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/tasks/post-transaction.ts"),
    "utf8"
  );

  if (
    !/const\s+postTransactionDocumentTables\s*=\s*\{[\s\S]*receipt:\s*"receipt"[\s\S]*"purchase-invoice":\s*"purchaseInvoice"[\s\S]*shipment:\s*"shipment"/.test(
      postTransactionJob
    ) ||
    !/const\s+scope\s*=\s*await\s+verifyPostTransactionScope\(serviceClient,\s*payload\)[\s\S]*if\s*\(!scope\.success\)[\s\S]*return\s+scope/.test(
      postTransactionJob
    )
  ) {
    missing.push(
      "Post-transaction job must preflight event document type/company scope before invoking direct posting functions."
    );
  }

  if (
    !/async function verifyPostTransactionScope[\s\S]*\.from\("company"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("id",\s*payload\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      postTransactionJob
    ) ||
    !/async function verifyPostTransactionScope[\s\S]*\.from\(table\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("id",\s*payload\.documentId\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)[\s\S]*\.single\(\)/.test(
      postTransactionJob
    )
  ) {
    missing.push(
      "Post-transaction job must verify the company is active and the event document belongs to that company before service-client dispatch."
    );
  }

  if (
    !/invokeFunction\("post-receipt"[\s\S]*receiptId:\s*payload\.documentId[\s\S]*companyId:\s*payload\.companyId/.test(
      postTransactionJob
    ) ||
    !/invokeFunction\(\s*"post-purchase-invoice"[\s\S]*invoiceId:\s*payload\.documentId[\s\S]*companyId:\s*payload\.companyId/.test(
      postTransactionJob
    ) ||
    !/invokeFunction\("post-shipment"[\s\S]*shipmentId:\s*payload\.documentId[\s\S]*companyId:\s*payload\.companyId/.test(
      postTransactionJob
    )
  ) {
    missing.push(
      "Post-transaction direct function dispatches must carry the verified event companyId."
    );
  }

  return missing;
}

function paperlessPartsJobServiceClientScopeFailures() {
  const missing = [];
  const paperlessJob = readFileSync(
    resolve(
      repoRoot,
      "packages/jobs/src/inngest/functions/integrations/paperless-parts.ts"
    ),
    "utf8"
  );
  const paperlessLib = readFileSync(
    resolve(repoRoot, "packages/ee/src/paperless-parts/lib/lib.ts"),
    "utf8"
  );

  if (
    !/\.from\("company"\)[\s\S]*\.select\("id,\s*active"\)[\s\S]*\.eq\("id",\s*payload\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      paperlessJob
    ) ||
    !/\.from\("companyIntegration"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)[\s\S]*\.eq\("id",\s*"paperless-parts"\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      paperlessJob
    )
  ) {
    missing.push(
      "Paperless Parts job must re-check active company and active integration before service-client tenant work."
    );
  }

  if (
    /deleteQuote\(carbon,\s*quoteId\)/.test(paperlessJob) ||
    /deleteSalesOrder\(carbon,\s*salesOrderId\)/.test(paperlessJob)
  ) {
    missing.push(
      "Paperless Parts rollback deletes must pass the event company ID."
    );
  }

  if (
    !/async function getCustomerPayment\([\s\S]*customerId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("customerPayment"\)[\s\S]*\.eq\("customerId",\s*customerId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessJob
    ) ||
    !/async function getCustomerShipping\([\s\S]*customerId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("customerShipping"\)[\s\S]*\.eq\("customerId",\s*customerId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessJob
    )
  ) {
    missing.push(
      "Paperless Parts customer payment/shipping helper reads must be scoped by company."
    );
  }

  if (
    !/getCustomerPayment\(carbon,\s*quote\.customerId,\s*payload\.companyId\)/.test(
      paperlessJob
    ) ||
    !/getCustomerShipping\(carbon,\s*quote\.customerId,\s*payload\.companyId\)/.test(
      paperlessJob
    ) ||
    !/getCustomerPayment\(carbon,\s*orderCustomerId,\s*payload\.companyId\)/.test(
      paperlessJob
    ) ||
    !/getCustomerShipping\(carbon,\s*orderCustomerId,\s*payload\.companyId\)/.test(
      paperlessJob
    )
  ) {
    missing.push(
      "Paperless Parts quote/order customer default lookups must pass the event company ID."
    );
  }

  if (
    !/\.from\("quote"\)[\s\S]*\.update\(\{\s*externalLinkId:\s*quoteExternalLink\.data\.id\s*\}\)[\s\S]*\.eq\("id",\s*quoteId\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)/.test(
      paperlessJob
    )
  ) {
    missing.push(
      "Paperless Parts quote external-link writes must be scoped by company."
    );
  }

  if (
    !/\.from\("salesOrder"\)[\s\S]*\.update\(\{\s*status\s*\}\)[\s\S]*\.eq\("id",\s*existingOrderMapping\.data\.entityId\)[\s\S]*\.eq\("companyId",\s*payload\.companyId\)/.test(
      paperlessJob
    )
  ) {
    missing.push(
      "Paperless Parts existing sales-order status updates must be scoped by company."
    );
  }

  if (
    !/async function deleteQuote\([\s\S]*quoteId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("quote"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*quoteId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessJob
    ) ||
    !/async function deleteSalesOrder\([\s\S]*salesOrderId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("salesOrder"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*salesOrderId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessJob
    )
  ) {
    missing.push(
      "Paperless Parts rollback delete helpers must include company predicates."
    );
  }

  if (
    !/async function createPaperlessMapping\([\s\S]*companyId:\s*string[\s\S]*getCarbonServiceClient\(\)[\s\S]*\.from\("externalIntegrationMapping"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("entityType",\s*entityType\)[\s\S]*\.eq\("entityId",\s*entityId\)[\s\S]*\.eq\("integration",\s*integration\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessLib
    )
  ) {
    missing.push(
      "Paperless Parts external mapping cleanup must include companyId before inserting replacement mappings."
    );
  }

  if (
    !/async function uploadModelFile\([\s\S]*\.from\("item"\)[\s\S]*\.select\("modelUploadId"\)[\s\S]*\.eq\("id",\s*itemId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessLib
    ) ||
    !/\.from\("salesOrderLine"\)[\s\S]*\.update\(\{\s*modelUploadId:\s*existingItem\.data\.modelUploadId\s*\}\)[\s\S]*\.eq\("id",\s*salesOrderLineId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessLib
    ) ||
    !/\.from\("salesOrderLine"\)[\s\S]*\.update\(\{\s*modelUploadId:\s*modelId\s*\}\)[\s\S]*\.eq\("id",\s*salesOrderLineId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessLib
    ) ||
    !/\.from\("item"\)[\s\S]*\.update\(\{\s*modelUploadId:\s*modelId\s*\}\)[\s\S]*\.eq\("id",\s*itemId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      paperlessLib
    )
  ) {
    missing.push(
      "Paperless Parts model upload item and line side effects must bind companyId."
    );
  }

  return missing;
}

function searchIndexJobServiceClientScopeFailures() {
  const missing = [];
  const searchJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/events/search.ts"),
    "utf8"
  );

  if (
    !/enrichRecord\?:\s*\([\s\S]*record:\s*Record<string,\s*any>,[\s\S]*client:\s*ReturnType<typeof getCarbonServiceClient>,[\s\S]*companyId:\s*string/.test(
      searchJob
    ) ||
    !/config\.enrichRecord\(record,\s*client,\s*companyId\)/.test(searchJob)
  ) {
    missing.push(
      "Search-index job enrichment must receive the company being processed."
    );
  }

  const enrichSignatureCount = (
    searchJob.match(/enrichRecord:\s*async\s*\(record,\s*client,\s*companyId\)/g) ??
    []
  ).length;
  const companyScopedLookupCount = (
    searchJob.match(/\.eq\("companyId",\s*companyId\)/g) ?? []
  ).length;

  if (enrichSignatureCount < 13 || companyScopedLookupCount < 13) {
    missing.push(
      "Search-index job related-record enrichment reads must stay company-scoped."
    );
  }

  if (
    !/delete_from_search_index[\s\S]*p_company_id:\s*companyId/.test(
      searchJob
    ) ||
    !/upsert_to_search_index[\s\S]*p_company_id:\s*companyId/.test(searchJob)
  ) {
    missing.push(
      "Search-index job RPC writes must keep using the grouped company ID."
    );
  }

  return missing;
}

function approvalRuleRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/settings+/approval-rules.tsx",
    "apps/erp/app/routes/x+/settings+/approval-rules.new.tsx",
    "apps/erp/app/routes/x+/settings+/approval-rules.$id.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the request-scoped Better Auth settings client for approval rules.`
      );
    }
  }

  const listRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/approval-rules.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"settings"[\s\S]*role:\s*"employee"/.test(
      listRoute
    ) ||
    !/getApprovalRules\(\s*client,\s*companyId\s*\)/.test(listRoute) ||
    !/\.from\("group"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      listRoute
    )
  ) {
    missing.push(
      "Approval-rules list route must load rules and groups through the request-scoped settings client."
    );
  }

  const newRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/approval-rules.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"settings"[\s\S]*role:\s*"employee"/.test(
      newRoute
    ) ||
    !/getApprovalRules\(\s*client,\s*companyId\s*\)/.test(newRoute) ||
    !/upsertApprovalRule\(\s*client,\s*\{[\s\S]*companyId/.test(newRoute)
  ) {
    missing.push(
      "Approval-rule creation route must check duplicates and create through the request-scoped settings client."
    );
  }

  const editRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/approval-rules.$id.tsx"),
    "utf8"
  );
  if (
    !/getApprovalRuleById\(\s*client,\s*id,\s*companyId\s*\)/.test(
      editRoute
    ) ||
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"settings"[\s\S]*role:\s*"employee"/.test(
      editRoute
    ) ||
    !/getApprovalRules\(\s*client,\s*companyId\s*\)/.test(editRoute) ||
    !/upsertApprovalRule\(\s*client,\s*\{/.test(editRoute)
  ) {
    missing.push(
      "Approval-rule edit route must read and update rules through the request-scoped settings client."
    );
  }

  return missing;
}

function sharedImportRouteRequestScopeFailures() {
  const missing = [];
  const importRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/shared+/import.$tableId.tsx"),
    "utf8"
  );

  if (/getCarbonService(Client|Role)\s*\(/.test(importRoute)) {
    missing.push(
      "Shared import route must not construct a carbon_service database client."
    );
  }

  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*importPermissions\[table\]/.test(
      importRoute
    ) ||
    !/importCsv\(\s*client,\s*\{[\s\S]*companyId[\s\S]*userId/.test(importRoute)
  ) {
    missing.push(
      "Shared import route must authorize the table-specific import permission and call importCsv with the request client/company/user context."
    );
  }

  return missing;
}

function auditLogRouteRequestScopeFailures() {
  const missing = [];
  const auditLogRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/audit-logs.tsx"),
    "utf8"
  );
  const auditModule = readFileSync(
    resolve(repoRoot, "packages/database/src/audit.ts"),
    "utf8"
  );

  if (/getCarbonService(Client|Role)\s*\(/.test(auditLogRoute)) {
    missing.push(
      "Audit-log settings route must not construct a carbon_service database client."
    );
  }

  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"settings"/.test(
      auditLogRoute
    ) ||
    !/getAuditLogArchives\(\s*client,\s*companyId\s*\)/.test(auditLogRoute) ||
    !/getArchiveDownloadUrl\(\s*[\s\S]*client,\s*[\s\S]*archiveId,\s*[\s\S]*companyId/.test(
      auditLogRoute
    )
  ) {
    missing.push(
      "Audit-log settings route must list archives and generate downloads through the request-scoped settings client/company."
    );
  }

  if (
    !/export\s+async\s+function\s+getArchiveDownloadUrl\([\s\S]*companyId\?:\s*string/.test(
      auditModule
    ) ||
    !/query\s*=\s*query\.eq\("companyId",\s*companyId\)/.test(auditModule)
  ) {
    missing.push(
      "Audit archive download helper must support company-scoped archive lookup."
    );
  }

  return missing;
}

function jobCoreRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/job+/update.tsx",
    "apps/erp/app/routes/x+/job+/bulk.new.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.status.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.complete.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.recalculate.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.details.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.configure.tsx",
    "apps/erp/app/routes/x+/job+/new.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients for job work.`
      );
    }
  }

  const updateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/update.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"production"/.test(
      updateRoute
    ) ||
    !/upsertJobMethod\(\s*client,\s*"itemToJob"/.test(updateRoute) ||
    !/recalculateJobRequirements\(\s*client,\s*\{/.test(updateRoute) ||
    occurrences(updateRoute, '.eq("companyId", companyId)') < 6
  ) {
    missing.push(
      "Job bulk update route must company-scope job updates and dispatch method/recalculate helpers through the request client."
    );
  }

  const bulkRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/bulk.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"production",\s*bypassRls:\s*true/.test(
      bulkRoute
    ) ||
    !/getItemReplenishment\(\s*client,\s*jobData\.itemId,\s*companyId\s*\)/.test(
      bulkRoute
    ) ||
    !/getDefaultStorageUnitForJob\(\s*client,/.test(bulkRoute) ||
    !/getNextSequence\(\s*client,\s*"job",\s*companyId\s*\)/.test(
      bulkRoute
    ) ||
    !/upsertJob\(\s*client,\s*\{/.test(bulkRoute) ||
    !/upsertJobMethod\(\s*client,\s*"itemToJob"/.test(bulkRoute)
  ) {
    missing.push(
      "Bulk job creation must use the permission-returned bypass client, not direct carbon_service construction."
    );
  }

  const statusRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.status.tsx"),
    "utf8"
  );
  if (
    /item\(itemReplenishment\(manufacturingBlocked\)\)/.test(statusRoute) ||
    !/\.from\("job"\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      statusRoute
    ) ||
    !/\.from\("itemReplenishment"\)[\s\S]*\.select\("manufacturingBlocked"\)[\s\S]*\.eq\("itemId",\s*job\.itemId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      statusRoute
    ) ||
    !/recalculateJobRequirements\(\s*client,\s*\{/.test(statusRoute) ||
    !/runMRP\(\s*client,\s*\{/.test(statusRoute) ||
    !/updateJobStatus\(\s*client,\s*\{[\s\S]*companyId/.test(statusRoute)
  ) {
    missing.push(
      "Job status route must company-scope job status work and use the request client for recalculate/MRP/status updates."
    );
  }

  const completeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.complete.tsx"),
    "utf8"
  );
  if (
    occurrences(completeRoute, '.eq("companyId", companyId)') < 2 ||
    !/client\.rpc\("complete_job_to_inventory"/.test(completeRoute) ||
    !/invokeFunction\("issue"[\s\S]*companyId[\s\S]*userId/.test(
      completeRoute
    )
  ) {
    missing.push(
      "Job completion route must company-scope job reads/updates and carry request company/user into inventory issue work."
    );
  }

  const recalculateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.recalculate.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{[\s\S]*update:\s*"production"/.test(
      recalculateRoute
    ) ||
    !/\.from\("job"\)[\s\S]*\.eq\("id",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      recalculateRoute
    ) ||
    !/recalculateJobRequirements\(\s*client,\s*\{/.test(recalculateRoute)
  ) {
    missing.push(
      "Job recalculate route must verify selected-company job scope before recalculating through the request client."
    );
  }

  const detailsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.details.tsx"),
    "utf8"
  );
  if (!/recalculateJobRequirements\(\s*client,\s*\{/.test(detailsRoute)) {
    missing.push(
      "Job details action must recalculate through the request-scoped production client."
    );
  }

  const configureRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.configure.tsx"),
    "utf8"
  );
  if (
    occurrences(configureRoute, '.eq("companyId", companyId)') < 2 ||
    !/upsertJobMethod\(\s*client,\s*"itemToJob"/.test(configureRoute)
  ) {
    missing.push(
      "Job configure route must company-scope the job and update its method through the request client."
    );
  }

  const newRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/new.tsx"),
    "utf8"
  );
  if (!/upsertJobMethod\(\s*client,\s*"itemToJob"/.test(newRoute)) {
    missing.push(
      "Job creation route must create the copied job method through the request client."
    );
  }

  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const makeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.make.$methodId.tsx"),
    "utf8"
  );
  const procedureRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/procedure+/$id.tsx"),
    "utf8"
  );
  const productionEventRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.events.$id.tsx"),
    "utf8"
  );
  const productionQuantityRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.quantities.$id.tsx"),
    "utf8"
  );
  const customerPortalRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/share+/customer.$id.tsx"),
    "utf8"
  );
  const mcpProductionTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/production.ts"),
    "utf8"
  );
  const productionFunctionSlice = (start, end) => {
    const startIndex = productionService.indexOf(start);
    const endIndex = productionService.indexOf(end);
    return startIndex >= 0 && endIndex > startIndex
      ? productionService.slice(startIndex, endIndex)
      : "";
  };
  const getJobByOperationId = productionFunctionSlice(
    "export async function getJobByOperationId",
    "export async function getJobPurchaseOrderLines"
  );
  const getJobMakeMethodById = productionFunctionSlice(
    "export async function getJobMakeMethodById",
    "export async function getRootMakeMethod"
  );
  const getRootMakeMethod = productionFunctionSlice(
    "export async function getRootMakeMethod",
    "export async function getJobMaterialsWithQuantityOnHand"
  );
  const getJobMaterialsByMethodId = productionFunctionSlice(
    "export async function getJobMaterialsByMethodId",
    "export async function getJobOperation"
  );
  const getJobOperationAttachments = productionFunctionSlice(
    "export async function getJobOperationAttachments",
    "export async function getJobOperationsList"
  );
  const getProcedure = productionFunctionSlice(
    "export async function getProcedure",
    "export async function getProcedureSteps"
  );
  const getProductionEvent = productionFunctionSlice(
    "export async function getProductionEvent",
    "export async function getProductionEvents"
  );
  const getProductionQuantity = productionFunctionSlice(
    "export async function getProductionQuantity",
    "export async function getProductionQuantities"
  );
  const upsertProcedureCopy = productionFunctionSlice(
    "export async function upsertProcedure",
    "export async function upsertProcedureStep"
  );

  if (
    /select\("\.\.\.job/.test(getJobByOperationId) ||
    !/\.from\("jobOperation"\)[\s\S]*\.select\("jobId"\)[\s\S]*\.eq\("companyId",\s*scope\.companyId\)[\s\S]*\.from\("job"\)[\s\S]*\.select\("id, companyId, customerId"\)[\s\S]*\.eq\("companyId",\s*scope\.companyId\)/.test(
      getJobByOperationId
    ) ||
    /select\("\*, \.\.\.item\(itemType:type, methodRevision:revision\)"\)/.test(
      getJobMakeMethodById + getRootMakeMethod
    ) ||
    !/\.from\("item"\)[\s\S]*\.select\("type, revision"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getJobMakeMethodById
    ) ||
    !/\.from\("item"\)[\s\S]*\.select\("type, revision"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getRootMakeMethod
    ) ||
    /item\(replenishmentSystem\)/.test(getJobMaterialsByMethodId) ||
    !/jobMakeMethodId:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("jobMaterial"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("id, replenishmentSystem"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getJobMaterialsByMethodId
    ) ||
    /jobOperationStepRecord\(\*\)/.test(getJobOperationAttachments) ||
    !/jobOperationIds:\s*string\[\],[\s\S]*companyId\?:\s*string[\s\S]*\.from\("jobOperationStep"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("jobOperationStepRecord"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getJobOperationAttachments
    )
  ) {
    missing.push(
      "Production job helper reads must resolve job, item, material, and step-record metadata with explicit company-scoped queries."
    );
  }

  if (
    /procedureStep\(\*\)|procedureParameter\(\*\)/.test(
      getProcedure + upsertProcedureCopy
    ) ||
    !/id:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("procedure"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("procedureStep"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("procedureParameter"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getProcedure
    ) ||
    !/copyFromId[\s\S]*\.from\("procedure"\)[\s\S]*\.eq\("companyId",\s*rest\.companyId\)[\s\S]*\.from\("procedureStep"\)[\s\S]*\.eq\("companyId",\s*rest\.companyId\)[\s\S]*\.from\("procedureParameter"\)[\s\S]*\.eq\("companyId",\s*rest\.companyId\)/.test(
      upsertProcedureCopy
    ) ||
    /jobOperation\(description\)/.test(
      getProductionEvent + getProductionQuantity
    ) ||
    !/id:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("productionEvent"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("jobOperation"\)[\s\S]*\.select\("description"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getProductionEvent
    ) ||
    !/id:\s*string,[\s\S]*companyId:\s*string[\s\S]*\.from\("productionQuantity"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("jobOperation"\)[\s\S]*\.select\("description"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      getProductionQuantity
    )
  ) {
    missing.push(
      "Production procedure, event, and quantity reads must replace embedded procedure/jobOperation selectors with explicit company-scoped reads."
    );
  }

  if (
    !/getJobMaterialsByMethodId\(\s*client,\s*methodId,\s*companyId\s*\)/.test(
      detailsRoute
    ) ||
    !/getJobMaterialsByMethodId\(\s*client,\s*methodId,\s*companyId\s*\)/.test(
      makeRoute
    ) ||
    !/getProcedure\(\s*client,\s*id,\s*companyId\s*\)/.test(procedureRoute) ||
    !/getProductionEvent\(\s*client,\s*id,\s*companyId\s*\)/.test(
      productionEventRoute
    ) ||
    !/getProductionQuantity\(\s*client,\s*id,\s*companyId\s*\)/.test(
      productionQuantityRoute
    ) ||
    !/getJobOperationAttachments\([\s\S]*serviceClient,[\s\S]*jobOperationIds \?\? \[\],[\s\S]*customer\.data\.companyId/.test(
      customerPortalRoute
    ) ||
    !/getJobByOperationId\([\s\S]*ctx\.client,[\s\S]*params\.operationId,[\s\S]*companyId:\s*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getJobMaterialsByMethodId\([\s\S]*ctx\.client,[\s\S]*params\.jobMakeMethodId,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getJobOperationAttachments\([\s\S]*ctx\.client,[\s\S]*params\.jobOperationIds,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getProcedure\([\s\S]*ctx\.client,[\s\S]*params\.id,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getProductionEvent\([\s\S]*ctx\.client,[\s\S]*params\.id,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getProductionQuantity\([\s\S]*ctx\.client,[\s\S]*params\.id,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    )
  ) {
    missing.push(
      "Production routes and MCP tools must pass Better Auth company scope into explicit helper reads."
    );
  }

  if (
    !/companyId\?:\s*string/.test(productionService) ||
    !/query\s*=\s*query\.eq\("companyId",\s*companyId\)/.test(
      productionService
    )
  ) {
    missing.push(
      "updateJobStatus must support optional companyId scoping for protected route callers."
    );
  }

  return missing;
}

function maintenanceLocationRpcScopeFailures() {
  const missing = [];
  const maintenanceRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0011_maintenance_location_rpcs.sql"),
    "utf8"
  );
  const resourcesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/resources/resources.service.ts"),
    "utf8"
  );
  const maintenanceRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/resources+/maintenance.tsx"),
    "utf8"
  );
  const scheduledMaintenanceRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/resources+/scheduled-maintenance.tsx"),
    "utf8"
  );
  const mcpResourcesTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/resources.ts"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_maintenance_dispatches_by_location\(\s*p_company_id\s+text,\s*p_location_id\s+text/.test(
      maintenanceRpcs
    ) ||
    !/"content"\s+jsonb/.test(maintenanceRpcs) ||
    !/"plannedStartTime"\s+text/.test(maintenanceRpcs) ||
    !/"duration"\s+numeric/.test(maintenanceRpcs) ||
    !/JOIN\s+"location"\s+l[\s\S]*l\."companyId"\s*=\s*p_company_id[\s\S]*l\."id"\s*=\s*p_location_id/.test(
      maintenanceRpcs
    ) ||
    !/LEFT\s+JOIN\s+"workCenter"\s+wc[\s\S]*wc\."companyId"\s*=\s*p_company_id[\s\S]*wc\."locationId"\s*=\s*p_location_id/.test(
      maintenanceRpcs
    ) ||
    !/WHERE\s+md\."companyId"\s*=\s*p_company_id[\s\S]*AND\s+md\."locationId"\s*=\s*p_location_id/.test(
      maintenanceRpcs
    )
  ) {
    missing.push(
      "Maintenance dispatch-by-location RPC must require company/location scope, return real table types, and scope location/work-center joins."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_maintenance_schedules_by_location\(\s*p_company_id\s+text,\s*p_location_id\s+text/.test(
      maintenanceRpcs
    ) ||
    !/"estimatedDuration"\s+numeric/.test(maintenanceRpcs) ||
    !/JOIN\s+"workCenter"\s+wc[\s\S]*wc\."companyId"\s*=\s*p_company_id[\s\S]*wc\."locationId"\s*=\s*p_location_id/.test(
      maintenanceRpcs
    ) ||
    !/JOIN\s+"location"\s+l[\s\S]*l\."companyId"\s*=\s*p_company_id[\s\S]*l\."id"\s*=\s*p_location_id/.test(
      maintenanceRpcs
    ) ||
    !/WHERE\s+ms\."companyId"\s*=\s*p_company_id[\s\S]*AND\s+wc\."locationId"\s*=\s*p_location_id/.test(
      maintenanceRpcs
    )
  ) {
    missing.push(
      "Maintenance schedule-by-location RPC must require company/location scope, return real table types, and scope work-center/location joins."
    );
  }

  if (
    !/getMaintenanceDispatchesByLocation\([\s\S]*companyId:\s*string,[\s\S]*locationId:\s*string[\s\S]*rpc\(\s*"get_maintenance_dispatches_by_location",\s*\{[\s\S]*p_company_id:\s*companyId,[\s\S]*p_location_id:\s*locationId/.test(
      resourcesService
    ) ||
    !/getMaintenanceSchedulesByLocation\([\s\S]*companyId:\s*string,[\s\S]*locationId:\s*string[\s\S]*rpc\(\s*"get_maintenance_schedules_by_location",\s*\{[\s\S]*p_company_id:\s*companyId,[\s\S]*p_location_id:\s*locationId/.test(
      resourcesService
    )
  ) {
    missing.push(
      "Maintenance resource service helpers must pass Better Auth company scope into location RPCs."
    );
  }

  if (
    !/requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"resources",\s*role:\s*"employee"\s*\}\s*\)/.test(
      maintenanceRoute
    ) ||
    !/getMaintenanceDispatchesByLocation\(\s*client,\s*companyId,\s*selectedLocationId/.test(
      maintenanceRoute
    ) ||
    !/requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"resources",\s*role:\s*"employee"\s*\}\s*\)/.test(
      scheduledMaintenanceRoute
    ) ||
    !/getMaintenanceSchedulesByLocation\(\s*client,\s*companyId,\s*selectedLocationId/.test(
      scheduledMaintenanceRoute
    ) ||
    !/getMaintenanceDispatchesByLocation\(ctx\.client,\s*ctx\.companyId,\s*params\.locationId/.test(
      mcpResourcesTools
    ) ||
    !/getMaintenanceSchedulesByLocation\(ctx\.client,\s*ctx\.companyId,\s*params\.locationId/.test(
      mcpResourcesTools
    )
  ) {
    missing.push(
      "Maintenance location routes and MCP tools must derive company scope from Better Auth request/MCP context."
    );
  }

  return missing;
}

function productionScheduleRpcScopeFailures() {
  const missing = [];
  const scheduleRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0012_production_schedule_rpcs.sql"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const scheduleRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/schedule+/dates.tsx"),
    "utf8"
  );
  const mcpProductionTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/production.ts"),
    "utf8"
  );

  if (
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_jobs_by_date_range\(text,\s*date,\s*date\)/.test(
      scheduleRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_jobs_by_date_range\([\s\S]*location_id\s+text,[\s\S]*company_id\s+text,[\s\S]*start_date\s+date,[\s\S]*end_date\s+date/.test(
      scheduleRpcs
    ) ||
    !/WHERE\s+j\."locationId"\s*=\s*location_id[\s\S]*AND\s+j\."companyId"\s*=\s*company_id/.test(
      scheduleRpcs
    ) ||
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_unscheduled_jobs\(text\)/.test(
      scheduleRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_unscheduled_jobs\(location_id\s+text,\s*company_id\s+text\)/.test(
      scheduleRpcs
    ) ||
    !/WHERE\s+j\."locationId"\s*=\s*location_id[\s\S]*AND\s+j\."companyId"\s*=\s*company_id/.test(
      scheduleRpcs
    )
  ) {
    missing.push(
      "Production schedule RPCs must drop legacy unscoped signatures, require company_id, and filter jobs by request company."
    );
  }

  if (
    !/function\s+getJobsByDateRange\([\s\S]*locationId:\s*string,[\s\S]*companyId:\s*string,[\s\S]*startDate:\s*string,[\s\S]*endDate:\s*string[\s\S]*rpc\("get_jobs_by_date_range",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId/.test(
      productionService
    ) ||
    !/function\s+getUnscheduledJobs\([\s\S]*locationId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_unscheduled_jobs",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId/.test(
      productionService
    ) ||
    !/getJobsByDateRange\(\s*client,\s*locationId\s*\?\?\s*"",\s*companyId,\s*startDate,\s*endDate\s*\)/.test(
      scheduleRoute
    ) ||
    !/getUnscheduledJobs\(\s*client,\s*locationId\s*\?\?\s*"",\s*companyId\s*\)/.test(
      scheduleRoute
    ) ||
    !/getJobsByDateRange\([\s\S]*ctx\.client,[\s\S]*params\.locationId,[\s\S]*ctx\.companyId,[\s\S]*params\.startDate,[\s\S]*params\.endDate/.test(
      mcpProductionTools
    ) ||
    !/getUnscheduledJobs\([\s\S]*ctx\.client,[\s\S]*params\.locationId,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    )
  ) {
    missing.push(
      "Production schedule route and MCP tools must pass Better Auth request company scope into schedule RPC helpers."
    );
  }

  return missing;
}

function productionStepRecordRpcScopeFailures() {
  const missing = [];
  const helperRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0013_operational_helper_rpcs.sql"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const lineageService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/inventory/lineage.server.ts"),
    "utf8"
  );
  const stepRecordsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.steps.tsx"),
    "utf8"
  );
  const mcpProductionTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/production.ts"),
    "utf8"
  );

  if (
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_job_operation_step_records\(text\)/.test(
      helperRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_job_operation_step_records\([\s\S]*p_job_id\s+text,[\s\S]*p_company_id\s+text/.test(
      helperRpcs
    ) ||
    !/WHERE\s+jo\."jobId"\s*=\s*p_job_id[\s\S]*AND\s+jo\."companyId"\s*=\s*p_company_id/.test(
      helperRpcs
    ) ||
    !/WHERE\s+josr\."companyId"\s*=\s*p_company_id/.test(helperRpcs)
  ) {
    missing.push(
      "Job operation step-record RPC must drop the legacy job-only signature and filter operation, step, and record rows by company."
    );
  }

  if (
    !/function\s+getJobOperationStepRecords\([\s\S]*jobId:\s*string,[\s\S]*companyId:\s*string,[\s\S]*rpc\("get_job_operation_step_records",\s*\{[\s\S]*p_job_id:\s*jobId,[\s\S]*p_company_id:\s*companyId/.test(
      productionService
    ) ||
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions/.test(
      stepRecordsRoute
    ) ||
    !/getJobOperationStepRecords\([\s\S]*client,[\s\S]*jobId,[\s\S]*companyId/.test(
      stepRecordsRoute
    ) ||
    !/getJobOperationStepRecords\([\s\S]*ctx\.client,[\s\S]*params\.jobId,[\s\S]*ctx\.companyId,[\s\S]*params\.args/.test(
      mcpProductionTools
    ) ||
    !/function\s+fetchJobStepRecords\([\s\S]*jobId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_job_operation_step_records",\s*\{[\s\S]*p_job_id:\s*jobId,[\s\S]*p_company_id:\s*companyId/.test(
      lineageService
    )
  ) {
    missing.push(
      "Job operation step-record route, MCP tool, and traceability sidebar helper must pass Better Auth request company scope into the RPC."
    );
  }

  return missing;
}

function itemDetailRpcScopeFailures() {
  const missing = [];
  const itemRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0008_item_detail_rpcs.sql"),
    "utf8"
  );
  const itemsService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/items/items.service.ts"),
    "utf8"
  );
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const quoteLineRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.$lineId.details.tsx"),
    "utf8"
  );
  const itemsUpdateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/items+/update.tsx"),
    "utf8"
  );
  const mcpSalesTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/sales.ts"),
    "utf8"
  );
  const paperlessParts = readFileSync(
    resolve(repoRoot, "packages/ee/src/paperless-parts/lib/lib.ts"),
    "utf8"
  );

  const itemDetailFunctions = [
    { name: "get_part_details", type: "Part", alias: "p" },
    { name: "get_tool_details", type: "Tool", alias: "t" },
    { name: "get_material_details", type: "Material", alias: "m" },
    { name: "get_consumable_details", type: "Consumable", alias: "c" },
  ];

  for (const { name, type, alias } of itemDetailFunctions) {
    if (
      !new RegExp(`DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+${name}\\(text\\)`).test(
        itemRpcs
      ) ||
      !new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${name}\\(item_id\\s+text,\\s*company_id\\s+text\\)`
      ).test(itemRpcs) ||
      !new RegExp(
        `WHERE\\s+i\\.id\\s*=\\s*item_id[\\s\\S]*AND\\s+i\\."companyId"\\s*=\\s*company_id[\\s\\S]*AND\\s+i\\."type"\\s*=\\s*'${type}'`
      ).test(itemRpcs) ||
      !new RegExp(
        `LEFT\\s+JOIN\\s+"item"\\s+i[\\s\\S]*i\\."companyId"\\s*=\\s*company_id`
      ).test(itemRpcs) ||
      !new RegExp(
        `LEFT\\s+JOIN\\s+"modelUpload"\\s+mu[\\s\\S]*mu\\."companyId"\\s*=\\s*company_id`
      ).test(itemRpcs) ||
      !new RegExp(
        `LEFT\\s+JOIN\\s+"itemCost"\\s+ic[\\s\\S]*ic\\."companyId"\\s*=\\s*company_id`
      ).test(itemRpcs) ||
      !new RegExp(
        `WHERE\\s+i\\."id"\\s*=\\s*item_id[\\s\\S]*AND\\s+${alias}\\."companyId"\\s*=\\s*company_id`
      ).test(itemRpcs)
    ) {
      missing.push(
        `${name} must drop the legacy item-only signature, require company_id, and filter item/detail/model/cost rows by company.`
      );
    }
  }

  if (
    !/FROM\s+"supplierPart"\s+ps[\s\S]*WHERE\s+ps\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialForm"\s+mf[\s\S]*mf\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialSubstance"\s+ms[\s\S]*ms\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialDimension"\s+md[\s\S]*md\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialFinish"\s+mfin[\s\S]*mfin\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialGrade"\s+mg[\s\S]*mg\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialType"\s+mt[\s\S]*mt\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    )
  ) {
    missing.push(
      "Material detail RPC must filter supplier-part and material taxonomy joins by request company."
    );
  }

  if (
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_material_naming_details\(text\)/.test(
      itemRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_material_naming_details\(readable_id\s+text,\s*company_id\s+text\)/.test(
      itemRpcs
    ) ||
    !/WHERE\s+"material"\."id"\s*=\s*readable_id[\s\S]*AND\s+"material"\."companyId"\s*=\s*company_id/.test(
      itemRpcs
    )
  ) {
    missing.push(
      "Material naming RPC must drop the legacy readable-id-only signature, require company_id, and filter material rows by company."
    );
  }

  for (const rpcName of [
    "get_consumable_details",
    "get_material_details",
    "get_part_details",
    "get_tool_details",
  ]) {
    if (
      !new RegExp(
        `rpc\\("${rpcName}",\\s*\\{[\\s\\S]*item_id:\\s*itemId,[\\s\\S]*company_id:\\s*companyId`
      ).test(itemsService)
    ) {
      missing.push(
        `Items service must pass Better Auth request company scope into ${rpcName}.`
      );
    }
  }

  if (
    !/function\s+getRelatedPricesForQuoteLine\([\s\S]*itemId:\s*string,[\s\S]*quoteId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_part_details",\s*\{[\s\S]*item_id:\s*itemId,[\s\S]*company_id:\s*companyId/.test(
      salesService
    ) ||
    !/getRelatedPricesForQuoteLine\([\s\S]*client,[\s\S]*itemId,[\s\S]*quoteId,[\s\S]*companyId/.test(
      quoteLineRoute
    ) ||
    !/getRelatedPricesForQuoteLine\([\s\S]*ctx\.client,[\s\S]*params\.itemId,[\s\S]*params\.quoteId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    )
  ) {
    missing.push(
      "Sales quote-line route and MCP tool must pass Better Auth request company scope into the part-detail RPC helper."
    );
  }

  if (
    !/rpc\("get_material_naming_details",\s*\{[\s\S]*readable_id:\s*readableId,[\s\S]*company_id:\s*companyId/.test(
      itemsUpdateRoute
    ) ||
    !/rpc\("get_material_naming_details",\s*\{[\s\S]*readable_id:\s*materialId,[\s\S]*company_id:\s*companyId/.test(
      paperlessParts
    )
  ) {
    missing.push(
      "Material naming callers must pass Better Auth request company scope into the RPC."
    );
  }

  return missing;
}

function relatedRecordLookupRpcScopeFailures() {
  const missing = [];
  const relatedRecordRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0015_related_record_lookup_rpcs.sql"),
    "utf8"
  );
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const purchasingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/purchasing/purchasing.service.ts"),
    "utf8"
  );
  const appSource = files
    .map((file) => readFileSync(resolve(repoRoot, file), "utf8"))
    .join("\n");

  if (
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_opportunity_with_related_records\(text\)/.test(
      relatedRecordRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_opportunity_with_related_records\(opportunity_id\s+text,\s*company_id\s+text\)/.test(
      relatedRecordRpcs
    ) ||
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_supplier_interaction_with_related_records\(text\)/.test(
      relatedRecordRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_supplier_interaction_with_related_records\(\s*supplier_interaction_id\s+text,\s*company_id\s+text/.test(
      relatedRecordRpcs
    )
  ) {
    missing.push(
      "Related-record lookup RPCs must drop legacy ID-only signatures and require company_id."
    );
  }

  if (
    !/FROM\s+"salesRfq"\s+rfq[\s\S]*rfq\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"quote"\s+q[\s\S]*q\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"salesOrder"\s+so[\s\S]*so\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"opportunity"\s+o[\s\S]*o\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    )
  ) {
    missing.push(
      "Opportunity related-record RPC must scope opportunity, RFQ, quote, and sales-order rows by company."
    );
  }

  if (
    !/FROM\s+"purchasingRfqToSupplierQuote"\s+link[\s\S]*link\."companyId"\s*=\s*company_id[\s\S]*sq\."companyId"\s*=\s*company_id[\s\S]*rfq\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"supplierQuote"\s+sq[\s\S]*sq\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"purchaseOrder"\s+po[\s\S]*po\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"purchaseInvoice"\s+pi[\s\S]*pi\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    ) ||
    !/FROM\s+"supplierInteraction"\s+si[\s\S]*si\."companyId"\s*=\s*company_id/.test(
      relatedRecordRpcs
    )
  ) {
    missing.push(
      "Supplier interaction related-record RPC must scope interaction, RFQ link, quote, order, and invoice rows by company."
    );
  }

  if (
    !/function\s+getOpportunity\([\s\S]*companyId:\s*string,[\s\S]*opportunityId:\s*string\s*\|\s*null[\s\S]*rpc\("get_opportunity_with_related_records",\s*\{[\s\S]*opportunity_id:\s*opportunityId,[\s\S]*company_id:\s*companyId/.test(
      salesService
    ) ||
    !/function\s+getSupplierInteraction\([\s\S]*companyId:\s*string,[\s\S]*opportunityId:\s*string\s*\|\s*null[\s\S]*rpc\([\s\S]*"get_supplier_interaction_with_related_records"[\s\S]*supplier_interaction_id:\s*opportunityId,[\s\S]*company_id:\s*companyId/.test(
      purchasingService
    )
  ) {
    missing.push(
      "Sales and purchasing related-record service helpers must pass Better Auth request company scope into RPC parameters."
    );
  }

  if (
    /getOpportunity\(\s*(?:client|ctx\.client|serviceClient)\s*,\s*(?:params\.opportunityId|quote\.data\?\.opportunityId|salesInvoice\.data\.opportunityId|rfqSummary\.data\?\.opportunityId|salesOrder\.data\?\.opportunityId)/.test(
      appSource
    ) ||
    /getSupplierInteraction\(\s*(?:client|ctx\.client)\s*,\s*(?:params\.opportunityId|quote\.data\.supplierInteractionId|purchaseInvoice\.data\.supplierInteractionId|purchaseOrder\.data\.supplierInteractionId)/.test(
      appSource
    )
  ) {
    missing.push(
      "Related-record lookup callers must pass companyId before document IDs."
    );
  }

  return missing;
}

function methodTreeRpcScopeFailures() {
  const missing = [];
  const methodRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0019_method_tree_rpcs.sql"),
    "utf8"
  );
  const itemsService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/items/items.service.ts"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const salesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/sales/sales.service.ts"),
    "utf8"
  );
  const mesOperationsService = readFileSync(
    resolve(repoRoot, "apps/mes/app/services/operations.service.ts"),
    "utf8"
  );
  const itemBomRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/items.methods.$id.bom.tsx"),
    "utf8"
  );
  const itemBomCsvRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/items.methods.$id.bom[.]csv.tsx"),
    "utf8"
  );
  const productionBomRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/production.methods.$id.bom.tsx"),
    "utf8"
  );
  const productionBomCsvRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/production.methods.$id.bom[.]csv.tsx"),
    "utf8"
  );
  const quoteBomRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/sales.quote.line.$id.bom.tsx"),
    "utf8"
  );
  const quoteBomCsvRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/sales.quote.line.$id.bom[.]csv.tsx"),
    "utf8"
  );
  const quoteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/quote+/$quoteId.tsx"),
    "utf8"
  );
  const jobRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.tsx"),
    "utf8"
  );
  const jobTravelerRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/job+/$jobId.traveler[.]pdf.tsx"),
    "utf8"
  );
  const methodTravelerRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/file+/traveler+/$id[.]pdf.tsx"),
    "utf8"
  );
  const mesOperationRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/operation.$operationId.tsx"),
    "utf8"
  );
  const mcpItemsTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/items.ts"),
    "utf8"
  );
  const mcpProductionTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/production.ts"),
    "utf8"
  );
  const mcpSalesTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/sales.ts"),
    "utf8"
  );

  const scopedSignatures = [
    ["get_method_tree", "uid"],
    ["get_job_method", "jid"],
    ["get_quote_methods_by_method_id", "mid"],
    ["get_quote_methods", "qid"],
  ];

  for (const [name, firstParam] of scopedSignatures) {
    if (
      !new RegExp(`DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+${name}\\(text\\)`).test(
        methodRpcs
      ) ||
      !new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${name}\\(${firstParam}\\s+text,\\s*company_id\\s+text\\)`
      ).test(methodRpcs)
    ) {
      missing.push(
        `${name} must drop the legacy ID-only signature and require company_id.`
      );
    }
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+VIEW\s+"activeMakeMethods"[\s\S]*PARTITION\s+BY\s+"itemId"\s*,\s*"companyId"/.test(
      methodRpcs
    )
  ) {
    missing.push(
      "activeMakeMethods must rank active methods per item and company before RPC company filters are applied."
    );
  }

  if (
    !/FROM\s+"methodMaterial"[\s\S]*WHERE\s+"makeMethodId"\s*=\s*uid[\s\S]*AND\s+"companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/FROM\s+"methodMaterial"\s+child[\s\S]*WHERE\s+child\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/FROM\s+"activeMakeMethods"\s+amm[\s\S]*amm\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/JOIN\s+"itemCost"\s+cost[\s\S]*cost\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/JOIN\s+"makeMethod"\s+mm[\s\S]*mm\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/FROM\s+"externalIntegrationMapping"\s+eim[\s\S]*eim\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    )
  ) {
    missing.push(
      "Item make-method tree RPC must scope recursive materials, active method fallback, item cost, make-method rows, and external mappings by company."
    );
  }

  if (
    !/FROM\s+"jobMakeMethod"[\s\S]*WHERE\s+"jobId"\s*=\s*jid[\s\S]*AND\s+"companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/FROM\s+"jobMaterialWithMakeMethodId"\s+child[\s\S]*child\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/JOIN\s+item[\s\S]*item\."companyId"\s*=\s*company_id/.test(methodRpcs)
  ) {
    missing.push(
      "Job method tree RPC must scope job make-method, recursive job-material, and item rows by company."
    );
  }

  if (
    !/FROM\s+"quoteMakeMethod"[\s\S]*WHERE\s+"id"\s*=\s*mid[\s\S]*AND\s+"companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/FROM\s+"quoteMakeMethod"[\s\S]*WHERE\s+"quoteId"\s*=\s*qid[\s\S]*AND\s+"companyId"\s*=\s*company_id/.test(
      methodRpcs
    ) ||
    !/FROM\s+"quoteMaterialWithMakeMethodId"\s+child[\s\S]*child\."companyId"\s*=\s*company_id/.test(
      methodRpcs
    )
  ) {
    missing.push(
      "Quote method tree RPCs must scope quote make-method and recursive quote-material rows by company."
    );
  }

  if (
    !/function\s+getMethodTree\([\s\S]*makeMethodId:\s*string,[\s\S]*companyId:\s*string[\s\S]*getMethodTreeArray\(client,\s*makeMethodId,\s*companyId\)/.test(
      itemsService
    ) ||
    !/function\s+getMethodTreeArray\([\s\S]*makeMethodId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_method_tree",\s*\{[\s\S]*uid:\s*makeMethodId,[\s\S]*company_id:\s*companyId/.test(
      itemsService
    ) ||
    !/function\s+getJobMethodTree\([\s\S]*jobId:\s*string,[\s\S]*companyId:\s*string[\s\S]*getJobMethodTreeArray\(client,\s*jobId,\s*companyId\)/.test(
      productionService
    ) ||
    !/function\s+getJobMethodTreeArray\([\s\S]*jobId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_job_method",\s*\{[\s\S]*jid:\s*jobId,[\s\S]*company_id:\s*companyId/.test(
      productionService
    ) ||
    !/function\s+getJobMethodBomIdMap\([\s\S]*jobId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_job_method",\s*\{[\s\S]*jid:\s*jobId,[\s\S]*company_id:\s*companyId/.test(
      mesOperationsService
    ) ||
    !/function\s+getQuoteMethodTrees\([\s\S]*quoteId:\s*string,[\s\S]*companyId:\s*string[\s\S]*getQuoteMethodTreeArray\(client,\s*quoteId,\s*companyId\)/.test(
      salesService
    ) ||
    !/function\s+getQuoteMethodTreeArray\([\s\S]*quoteId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_quote_methods",\s*\{[\s\S]*qid:\s*quoteId,[\s\S]*company_id:\s*companyId/.test(
      salesService
    ) ||
    !/function\s+buildCostEffects\([\s\S]*quoteLineId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("get_quote_methods_by_method_id",\s*\{[\s\S]*mid:\s*rootMethod\.data\.id,[\s\S]*company_id:\s*companyId/.test(
      salesService
    )
  ) {
    missing.push(
      "Item, job, MES, and quote method-tree service helpers must pass Better Auth request company scope into recursive method RPCs."
    );
  }

  if (
    !/getMethodTree\(client,\s*id,\s*companyId\)/.test(itemBomRoute) ||
    !/getMethodTree\(client,\s*id,\s*companyId\)/.test(itemBomCsvRoute) ||
    !/getJobMethodTree\(client,\s*id,\s*companyId\)/.test(productionBomRoute) ||
    !/getJobMethodTree\(client,\s*id,\s*companyId\)/.test(productionBomCsvRoute) ||
    !/getQuoteMethodTrees\([\s\S]*client,[\s\S]*quote\.data\?\.quoteId,[\s\S]*companyId/.test(
      quoteBomRoute
    ) ||
    !/getQuoteMethodTrees\([\s\S]*client,[\s\S]*quote\.data\?\.quoteId,[\s\S]*companyId/.test(
      quoteBomCsvRoute
    )
  ) {
    missing.push(
      "BOM API routes must pass request company scope into method-tree helpers."
    );
  }

  if (
    !/getQuoteMethodTrees\(client,\s*quoteId,\s*companyId\)/.test(quoteRoute) ||
    !/getJobMethodTree\(client,\s*jobId,\s*companyId\)/.test(jobRoute) ||
    !/getJobMethodTree\(client,\s*jobId,\s*companyId\)/.test(jobTravelerRoute) ||
    !/getJobMethodTree\(client,\s*job\.data\.id!,\s*companyId\)/.test(
      methodTravelerRoute
    ) ||
    !/getJobMethodBomIdMap\(client,\s*job\.data\.id!,\s*companyId\)/.test(
      mesOperationRoute
    )
  ) {
    missing.push(
      "Quote, job, traveler, and MES operation routes must pass request company scope into method-tree helpers."
    );
  }

  if (
    !/getMethodTree\([\s\S]*ctx\.client,[\s\S]*params\.makeMethodId,[\s\S]*ctx\.companyId/.test(
      mcpItemsTools
    ) ||
    !/getMethodTreeArray\([\s\S]*ctx\.client,[\s\S]*params\.makeMethodId,[\s\S]*ctx\.companyId/.test(
      mcpItemsTools
    ) ||
    !/getJobMethodTree\([\s\S]*ctx\.client,[\s\S]*params\.jobId,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getJobMethodTreeArray\([\s\S]*ctx\.client,[\s\S]*params\.jobId,[\s\S]*ctx\.companyId/.test(
      mcpProductionTools
    ) ||
    !/getQuoteMethodTrees\([\s\S]*ctx\.client,[\s\S]*params\.quoteId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    ) ||
    !/getQuoteMethodTreeArray\([\s\S]*ctx\.client,[\s\S]*params\.quoteId,[\s\S]*ctx\.companyId/.test(
      mcpSalesTools
    )
  ) {
    missing.push(
      "MCP item, production, and sales tools must pass Better Auth request company scope into method-tree helpers."
    );
  }

  return missing;
}

function inventoryQuantityRpcScopeFailures() {
  const missing = [];
  const inventoryRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0018_inventory_quantity_rpcs.sql"),
    "utf8"
  );
  const itemsService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/items/items.service.ts"),
    "utf8"
  );
  const inventoryService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/inventory/inventory.service.ts"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );
  const mcpItemsTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/items.ts"),
    "utf8"
  );
  const mcpInventoryTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/inventory.ts"),
    "utf8"
  );
  const mcpProductionTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/production.ts"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_item_quantities_by_tracking_id\(\s*item_id\s+text,\s*company_id\s+text,\s*location_id\s+text/.test(
      inventoryRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_job_quantity_on_hand\(\s*job_id\s+text,\s*company_id\s+text,\s*location_id\s+text/.test(
      inventoryRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_inventory_quantities\(\s*company_id\s+text,\s*location_id\s+text/.test(
      inventoryRpcs
    )
  ) {
    missing.push(
      "Inventory quantity RPCs must require company_id and location_id in their function signatures."
    );
  }

  if (
    !/LEFT\s+JOIN\s+"storageUnit"\s+s[\s\S]*s\."companyId"\s*=\s*company_id[\s\S]*s\."locationId"\s*=\s*location_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"trackedEntity"\s+te[\s\S]*te\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    )
  ) {
    missing.push(
      "Tracked-quantity RPC must scope storage-unit and tracked-entity metadata by request company."
    );
  }

  if (
    !/JOIN\s+"job"\s+source_job[\s\S]*source_job\."companyId"\s*=\s*company_id[\s\S]*source_job\."locationId"\s*=\s*location_id/.test(
      inventoryRpcs
    ) ||
    !/FROM\s+"purchaseOrder"\s+po[\s\S]*JOIN\s+"purchaseOrderLine"\s+pol[\s\S]*pol\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/FROM\s+"stockTransferLine"\s+stl[\s\S]*stl\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/FROM\s+"salesOrder"\s+so[\s\S]*JOIN\s+"salesOrderLine"\s+sol[\s\S]*sol\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/open_jobs\s+AS\s*\([\s\S]*FROM\s+"job"\s+j[\s\S]*j\."companyId"\s*=\s*company_id[\s\S]*j\."locationId"\s*=\s*location_id/.test(
      inventoryRpcs
    ) ||
    !/open_job_requirements\s+AS\s*\([\s\S]*FROM\s+"jobMaterial"\s+jm[\s\S]*jm\."companyId"\s*=\s*company_id[\s\S]*j\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/JOIN\s+"item"\s+i[\s\S]*i\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"modelUpload"\s+mu[\s\S]*mu\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    )
  ) {
    missing.push(
      "Job quantity RPC must scope source job, child supply/demand rows, open jobs, and item/model metadata by request company."
    );
  }

  if (
    !/item_storage_types\s+AS\s*\([\s\S]*JOIN\s+"storageUnit"\s+su[\s\S]*su\."companyId"\s*=\s*company_id[\s\S]*su\."locationId"\s*=\s*location_id/.test(
      inventoryRpcs
    ) ||
    !/item_storage_units\s+AS\s*\([\s\S]*JOIN\s+"storageUnit"\s+su[\s\S]*su\."companyId"\s*=\s*company_id[\s\S]*su\."locationId"\s*=\s*location_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialDimension"\s+md[\s\S]*md\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialFinish"\s+mf[\s\S]*mf\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialGrade"\s+mg[\s\S]*mg\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"materialType"\s+mt[\s\S]*mt\."companyId"\s*=\s*company_id/.test(
      inventoryRpcs
    ) ||
    !/LEFT\s+JOIN\s+"itemPlanning"\s+ip[\s\S]*ip\."companyId"\s*=\s*company_id[\s\S]*ip\."locationId"\s*=\s*location_id/.test(
      inventoryRpcs
    ) ||
    !/to_jsonb\('Rejected'::text\)/.test(inventoryRpcs)
  ) {
    missing.push(
      "Inventory quantity RPC must scope storage, taxonomy, item-planning, and JSONB tracked-status handling by request company."
    );
  }

  if (
    !/function\s+getItemQuantities\([\s\S]*companyId:\s*string,[\s\S]*locationId:\s*string[\s\S]*rpc\("get_inventory_quantities",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId/.test(
      itemsService
    ) ||
    !/function\s+getItemStorageUnitQuantities\([\s\S]*companyId:\s*string,[\s\S]*locationId:\s*string[\s\S]*rpc\("get_item_quantities_by_tracking_id",\s*\{[\s\S]*item_id:\s*itemId,[\s\S]*company_id:\s*companyId,[\s\S]*location_id:\s*locationId/.test(
      itemsService
    ) ||
    !/function\s+getInventoryItems\([\s\S]*locationId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\(\s*"get_inventory_quantities",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId/.test(
      inventoryService
    ) ||
    !/function\s+getJobMaterialsWithQuantityOnHand\([\s\S]*companyId:\s*string,[\s\S]*locationId:\s*string[\s\S]*"get_job_quantity_on_hand"[\s\S]*job_id:\s*jobId,[\s\S]*company_id:\s*companyId,[\s\S]*location_id:\s*locationId/.test(
      productionService
    )
  ) {
    missing.push(
      "Inventory, item, and production service helpers must pass Better Auth request company and location scope into quantity RPCs."
    );
  }

  if (
    !/getItemStorageUnitQuantities\(ctx\.client,\s*params\.itemId,\s*ctx\.companyId,\s*params\.locationId\)/.test(
      mcpItemsTools
    ) ||
    !/getInventoryItems\(ctx\.client,\s*params\.locationId,\s*ctx\.companyId,\s*params\.args\)/.test(
      mcpInventoryTools
    ) ||
    !/getJobMaterialsWithQuantityOnHand\(ctx\.client,\s*params\.jobId,\s*ctx\.companyId,\s*params\.locationId,\s*params\.args\)/.test(
      mcpProductionTools
    )
  ) {
    missing.push(
      "MCP item, inventory, and production tools must pass Better Auth request company scope into quantity helpers."
    );
  }

  return missing;
}

function planningRpcScopeFailures() {
  const missing = [];
  const planningRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0023_planning_rpcs.sql"),
    "utf8"
  );
  const purchasingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/purchasing/purchasing.service.ts"),
    "utf8"
  );
  const productionService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/production/production.service.ts"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+planning_projection_rows\(\s*company_id\s+text,\s*location_id\s+text,\s*periods\s+text\[\],\s*replenishment_system\s+"itemReplenishmentSystem"/.test(
      planningRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_purchasing_planning\(\s*company_id\s+text,\s*location_id\s+text,\s*periods\s+text\[\]/.test(
      planningRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_production_planning\(\s*company_id\s+text,\s*location_id\s+text,\s*periods\s+text\[\]/.test(
      planningRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_production_projections\(\s*company_id\s+text,\s*location_id\s+text,\s*periods\s+text\[\]/.test(
      planningRpcs
    )
  ) {
    missing.push(
      "Planning RPCs must require company_id and location_id in their function signatures."
    );
  }

  if (
    !/FROM\s+"supplyActual"[\s\S]*"companyId"\s*=\s*company_id[\s\S]*"locationId"\s*=\s*location_id/.test(
      planningRpcs
    ) ||
    !/FROM\s+"supplyForecast"[\s\S]*"companyId"\s*=\s*company_id[\s\S]*"locationId"\s*=\s*location_id/.test(
      planningRpcs
    ) ||
    !/FROM\s+"demandActual"[\s\S]*"companyId"\s*=\s*company_id[\s\S]*"locationId"\s*=\s*location_id/.test(
      planningRpcs
    ) ||
    !/FROM\s+"demandForecast"[\s\S]*"companyId"\s*=\s*company_id[\s\S]*"locationId"\s*=\s*location_id/.test(
      planningRpcs
    ) ||
    !/FROM\s+"supplierPart"\s+ps[\s\S]*ps\."companyId"\s*=\s*company_id/.test(
      planningRpcs
    )
  ) {
    missing.push(
      "Planning projection helper must scope supply, demand, and supplier-part rows by request company/location."
    );
  }

  if (
    !/JOIN\s+"itemReplenishment"\s+ir[\s\S]*ir\."companyId"\s*=\s*company_id/.test(
      planningRpcs
    ) ||
    !/JOIN\s+"itemPlanning"\s+ip[\s\S]*ip\."companyId"\s*=\s*company_id[\s\S]*ip\."locationId"\s*=\s*location_id/.test(
      planningRpcs
    ) ||
    !/LEFT\s+JOIN\s+"modelUpload"\s+mu[\s\S]*mu\."companyId"\s*=\s*company_id/.test(
      planningRpcs
    ) ||
    !/WHERE\s+i\."companyId"\s*=\s*company_id/.test(planningRpcs)
  ) {
    missing.push(
      "Planning projection helper must scope item, item-replenishment, item-planning, and model-upload joins by request company."
    );
  }

  if (
    !/ir\."leadTime"::integer/.test(planningRpcs) ||
    !/ir\."lotSize"::integer/.test(planningRpcs) ||
    !/ip\."demandAccumulationPeriod"::integer/.test(planningRpcs) ||
    !/ip\."reorderPoint"::integer/.test(planningRpcs) ||
    !/ip\."orderMultiple"::integer/.test(planningRpcs)
  ) {
    missing.push(
      "Planning projection helper must cast numeric planning fields to the integer return columns declared by the RPCs."
    );
  }

  if (
    !/function\s+getPurchasingPlanning\([\s\S]*locationId:\s*string,[\s\S]*companyId:\s*string,[\s\S]*periods:\s*string\[\][\s\S]*rpc\(\s*"get_purchasing_planning",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId,[\s\S]*periods/.test(
      purchasingService
    ) ||
    !/function\s+getProductionPlanning\([\s\S]*locationId:\s*string,[\s\S]*companyId:\s*string,[\s\S]*periods:\s*string\[\][\s\S]*rpc\(\s*"get_production_planning",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId,[\s\S]*periods/.test(
      productionService
    ) ||
    !/function\s+getProductionProjections\([\s\S]*locationId:\s*string,[\s\S]*periods:\s*string\[\],[\s\S]*companyId:\s*string[\s\S]*rpc\(\s*"get_production_projections",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*company_id:\s*companyId,[\s\S]*periods/.test(
      productionService
    )
  ) {
    missing.push(
      "Purchasing and production planning service helpers must pass Better Auth company and location scope into planning RPCs."
    );
  }

  return missing;
}

function accountingReportingRpcScopeFailures() {
  const missing = [];
  const accountingRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0021_accounting_reporting_rpcs.sql"),
    "utf8"
  );
  const accountingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/accounting/accounting.service.ts"),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"accountTreeBalances"\(\s*p_company_group_id\s+text/.test(
      accountingRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"accountTreeBalancesByCompany"\(\s*p_company_group_id\s+text,\s*p_company_id\s+text/.test(
      accountingRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"trialBalance"\(\s*p_company_group_id\s+text,\s*p_company_id\s+text/.test(
      accountingRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"translateTrialBalance"\(\s*p_company_group_id\s+text,\s*p_company_id\s+text,\s*p_target_currency\s+text/.test(
      accountingRpcs
    )
  ) {
    missing.push(
      "Accounting reporting RPCs must require company-group scope and company scope where applicable."
    );
  }

  if (
    !/LEFT\s+JOIN\s+"journalLine"\s+jl[\s\S]*EXISTS\s*\([\s\S]*FROM\s+"company"\s+c[\s\S]*c\."id"\s*=\s*jl\."companyId"[\s\S]*c\."companyGroupId"\s*=\s*p_company_group_id/.test(
      accountingRpcs
    ) ||
    !/LEFT\s+JOIN\s+"journal"\s+j[\s\S]*j\."id"\s*=\s*jl\."journalId"[\s\S]*j\."companyId"\s*=\s*jl\."companyId"/.test(
      accountingRpcs
    ) ||
    !/SUM\(CASE\s+WHEN\s+j\."id"\s+IS\s+NOT\s+NULL\s+THEN\s+jl\."amount"\s+ELSE\s+0\s+END\)/.test(
      accountingRpcs
    )
  ) {
    missing.push(
      "Accounting balance RPCs must scope journal lines to companies inside the requested company group and require matching journal company."
    );
  }

  if (
    !/FROM\s+"company"[\s\S]*WHERE\s+"id"\s*=\s*p_company_id[\s\S]*AND\s+"companyGroupId"\s*=\s*p_company_group_id/.test(
      accountingRpcs
    ) ||
    !/IF\s+v_source_currency\s+IS\s+NULL\s+THEN[\s\S]*RETURN;[\s\S]*END\s+IF;/.test(
      accountingRpcs
    ) ||
    !/JOIN\s+"account"\s+a\s+ON\s+a\."id"\s*=\s*b\."accountId"[\s\S]*a\."companyGroupId"\s*=\s*p_company_group_id/.test(
      accountingRpcs
    )
  ) {
    missing.push(
      "Translation RPC must verify the source company belongs to the requested company group and keep account joins company-group scoped."
    );
  }

  if (
    !/function\s+getTrialBalance\([\s\S]*companyGroupId:\s*string,[\s\S]*companyId:\s*string\s*\|\s*null[\s\S]*rpc\("trialBalance",\s*\{[\s\S]*p_company_group_id:\s*companyGroupId,[\s\S]*p_company_id:\s*companyId/.test(
      accountingService
    ) ||
    !/function\s+getFinancialStatementBalances\([\s\S]*companyGroupId:\s*string,[\s\S]*companyId:\s*string\s*\|\s*null[\s\S]*rpc\("accountTreeBalancesByCompany",\s*\{[\s\S]*p_company_group_id:\s*companyGroupId,[\s\S]*p_company_id:\s*companyId/.test(
      accountingService
    ) ||
    !/function\s+getChartOfAccounts\([\s\S]*companyGroupId:\s*string[\s\S]*rpc\("accountTreeBalances",\s*\{[\s\S]*p_company_group_id:\s*companyGroupId/.test(
      accountingService
    ) ||
    !/function\s+translateCompanyBalances\([\s\S]*companyGroupId:\s*string,[\s\S]*companyId:\s*string[\s\S]*rpc\("translateTrialBalance",\s*\{[\s\S]*p_company_group_id:\s*companyGroupId,[\s\S]*p_company_id:\s*companyId/.test(
      accountingService
    )
  ) {
    missing.push(
      "Accounting report service helpers must pass Better Auth company-group and company scope into reporting RPCs."
    );
  }

  if (
    !/function\s+getConsolidatedBalances\([\s\S]*companyGroupId:\s*string,[\s\S]*companyIds:\s*string\[\][\s\S]*const\s+companyById\s*=\s*new\s+Map\(groupCompanies\.map\(\(c\)\s*=>\s*\[c\.id,\s*c\]\)\)[\s\S]*const\s+selectedCompanyIds\s*=\s*companyIds\.filter\(\(id\)\s*=>\s*companyById\.has\(id\)\)[\s\S]*const\s+selectedSet\s*=\s*new\s+Set\(selectedCompanyIds\)[\s\S]*for\s*\(const\s+id\s+of\s+selectedCompanyIds\)[\s\S]*const\s+allIds\s*=\s*\[\.\.\.selectedCompanyIds,\s*\.\.\.eliminationIds\]/.test(
      accountingService
    )
  ) {
    missing.push(
      "Consolidated balance service must filter caller-supplied companyIds to the authenticated company group before downstream reporting RPC calls."
    );
  }

  return missing;
}

function intercompanyRpcScopeFailures() {
  const missing = [];
  const intercompanyRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0022_intercompany_rpcs.sql"),
    "utf8"
  );
  const accountingService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/accounting/accounting.service.ts"),
    "utf8"
  );
  const accountingMcpTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/accounting.ts"),
    "utf8"
  );
  const intercompanyCreate =
    accountingService.match(
      /export\s+async\s+function\s+createIntercompanyTransaction[\s\S]*?export\s+async\s+function\s+runIntercompanyMatching/
    )?.[0] ?? "";
  const intercompanyJournalLineInsert =
    intercompanyCreate.match(
      /\.from\("journalLine"\)[\s\S]*?\.select\("id"\)/
    )?.[0] ?? "";

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"matchIntercompanyTransactions"\(\s*p_company_group_id\s+text/.test(
      intercompanyRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"findLowestCommonParent"\(\s*p_company_group_id\s+text,\s*p_company_a\s+text,\s*p_company_b\s+text/.test(
      intercompanyRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"generateEliminationEntries"\(\s*p_company_group_id\s+text,\s*p_user_id\s+text/.test(
      intercompanyRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"getIntercompanyBalance"\(\s*p_company_group_id\s+text/.test(
      intercompanyRpcs
    )
  ) {
    missing.push(
      "Intercompany RPCs must require company-group scope in their public signatures."
    );
  }

  if (
    !/JOIN\s+"company"\s+src_source_company[\s\S]*src_source_company\."companyGroupId"\s*=\s*p_company_group_id/.test(
      intercompanyRpcs
    ) ||
    !/JOIN\s+"journalLine"\s+src_jl[\s\S]*src_jl\."companyId"\s*=\s*src\."sourceCompanyId"/.test(
      intercompanyRpcs
    ) ||
    !/JOIN\s+"company"\s+sc[\s\S]*sc\."companyGroupId"\s*=\s*p_company_group_id[\s\S]*JOIN\s+"company"\s+tc[\s\S]*tc\."companyGroupId"\s*=\s*p_company_group_id/.test(
      intercompanyRpcs
    )
  ) {
    missing.push(
      "Intercompany matching/balance RPCs must verify source/target companies and journal lines stay inside the requested company group."
    );
  }

  if (
    !/v_context_user_id\s+text\s*:=\s*app_uid\(\)/.test(intercompanyRpcs) ||
    !/p_user_id\s+IS\s+DISTINCT\s+FROM\s+v_context_user_id/.test(
      intercompanyRpcs
    ) ||
    !/"findLowestCommonParent"\(\s*p_company_group_id,\s*v_rec\."sourceCompanyId",\s*v_rec\."targetCompanyId"\s*\)/.test(
      intercompanyRpcs
    ) ||
    !/JOIN\s+"account"\s+a[\s\S]*a\."companyGroupId"\s*=\s*p_company_group_id/.test(
      intercompanyRpcs
    ) ||
    !/WHERE\s+"companyGroupId"\s*=\s*p_company_group_id[\s\S]*AND\s+EXISTS\s*\([\s\S]*FROM\s+"journalLine"\s+jl[\s\S]*jl\."companyId"\s*=\s*"intercompanyTransaction"\."sourceCompanyId"/.test(
      intercompanyRpcs
    )
  ) {
    missing.push(
      "Intercompany elimination RPC must bind p_user_id to app_uid and only copy/update company-group-scoped source and target lines."
    );
  }

  if (
    !/function\s+createIntercompanyTransaction\([\s\S]*companyGroupId:\s*string;[\s\S]*\.from\("company"\)[\s\S]*\.eq\("companyGroupId",\s*input\.companyGroupId\)[\s\S]*\.from\("account"\)[\s\S]*\.eq\("companyGroupId",\s*input\.companyGroupId\)/.test(
      intercompanyCreate
    ) ||
    !/\.from\("journal"\)[\s\S]*\.insert\(\{[\s\S]*status:\s*"Posted"[\s\S]*createdAt:\s*now[\s\S]*createdBy:\s*input\.userId/.test(
      intercompanyCreate
    ) ||
    !/\.from\("journalLine"\)[\s\S]*\.insert\(\[[\s\S]*accrual:\s*false[\s\S]*quantity:\s*0/.test(
      intercompanyJournalLineInsert
    ) ||
    /companyGroupId:/.test(intercompanyJournalLineInsert)
  ) {
    missing.push(
      "Intercompany service writes must use request-scoped Better Auth org context, validate companies/accounts by group, and write only real required journal columns."
    );
  }

  if (
    !/getIntercompanyTransactions\(\s*ctx\.client,\s*ctx\.companyGroupId,\s*params\.args\s*\)/.test(
      accountingMcpTools
    ) ||
    !/createIntercompanyTransaction\(ctx\.client,\s*\{[\s\S]*companyGroupId:\s*ctx\.companyGroupId[\s\S]*userId:\s*ctx\.userId/.test(
      accountingMcpTools
    ) ||
    !/runIntercompanyMatching\(\s*ctx\.client,\s*ctx\.companyGroupId\s*\)/.test(
      accountingMcpTools
    ) ||
    !/generateEliminations\(\s*ctx\.client,\s*ctx\.companyGroupId,\s*ctx\.userId\s*\)/.test(
      accountingMcpTools
    ) ||
    !/getIntercompanyBalance\(\s*ctx\.client,\s*ctx\.companyGroupId\s*\)/.test(
      accountingMcpTools
    )
  ) {
    missing.push(
      "Intercompany MCP tools must derive companyGroupId from the Better Auth MCP context instead of client-supplied org input."
    );
  }

  return missing;
}

function mcpCompanyGroupContextFailures() {
  return files
    .filter((file) => file.startsWith("apps/erp/app/routes/api+/mcp+/lib/tools/"))
    .flatMap((file) => {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      return /params\.companyGroupId/.test(source)
        ? [
            `${file} must derive companyGroupId from ctx.companyGroupId instead of MCP caller input.`,
          ]
        : [];
    });
}

function storageUnitRequirementRpcScopeFailures() {
  const missing = [];
  const storageRequirementRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0020_storage_unit_requirement_rpcs.sql"),
    "utf8"
  );
  const jobMaterialsSessionRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/job+/$jobId.materials.session.new.tsx"),
    "utf8"
  );
  const stockTransferWizard = readFileSync(
    resolve(
      repoRoot,
      "apps/erp/app/modules/inventory/ui/StockTransfers/StockTransferWizard.tsx"
    ),
    "utf8"
  );

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_item_storage_unit_requirements_by_location_and_item\(\s*company_id\s+text,\s*location_id\s+text,\s*item_id\s+text/.test(
      storageRequirementRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_item_storage_unit_requirements_by_location\(\s*company_id\s+text,\s*location_id\s+text/.test(
      storageRequirementRpcs
    )
  ) {
    missing.push(
      "Storage-unit requirement RPCs must require company_id in their function signatures."
    );
  }

  if (
    !/FROM\s+"jobMaterial"\s+jm[\s\S]*jm\."companyId"\s*=\s*company_id/.test(
      storageRequirementRpcs
    ) ||
    !/FROM\s+"stockTransferLine"\s+stl[\s\S]*stl\."companyId"\s*=\s*company_id/.test(
      storageRequirementRpcs
    ) ||
    !/FROM\s+"purchaseOrder"\s+po[\s\S]*JOIN\s+"purchaseOrderLine"\s+pol[\s\S]*pol\."companyId"\s*=\s*company_id/.test(
      storageRequirementRpcs
    )
  ) {
    missing.push(
      "Storage-unit requirement RPCs must scope child demand/supply rows by company, not only parent documents."
    );
  }

  if (
    !/JOIN\s+"item"\s+i[\s\S]*i\."companyId"\s*=\s*company_id/.test(
      storageRequirementRpcs
    ) ||
    !/LEFT\s+JOIN\s+"storageUnit"\s+s[\s\S]*s\."companyId"\s*=\s*company_id[\s\S]*s\."locationId"\s*=\s*location_id/.test(
      storageRequirementRpcs
    ) ||
    !/LEFT\s+JOIN\s+"modelUpload"\s+mu[\s\S]*mu\."companyId"\s*=\s*company_id/.test(
      storageRequirementRpcs
    ) ||
    !/LEFT\s+JOIN\s+"pickMethod"\s+pm[\s\S]*pm\."companyId"\s*=\s*company_id[\s\S]*pm\."locationId"\s*=\s*location_id/.test(
      storageRequirementRpcs
    )
  ) {
    missing.push(
      "Storage-unit requirement RPCs must scope item, storage-unit, model-upload, and pick-method metadata joins by company."
    );
  }

  if (
    !/get_item_storage_unit_requirements_by_location_and_item"[\s\S]*company_id:\s*companyId[\s\S]*location_id:\s*locationId/.test(
      jobMaterialsSessionRoute
    ) ||
    !/get_item_storage_unit_requirements_by_location"[\s\S]*company_id:\s*companyId[\s\S]*location_id:\s*locationId/.test(
      stockTransferWizard
    ) ||
    !/get_item_storage_unit_requirements_by_location_and_item"[\s\S]*company_id:\s*companyId[\s\S]*location_id:\s*locationId/.test(
      stockTransferWizard
    )
  ) {
    missing.push(
      "Storage-unit requirement callers must pass Better Auth request company scope into RPC parameters."
    );
  }

  return missing;
}

function userAdminRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/erp/app/routes/x+/users+/operators.new.tsx",
    "apps/erp/app/routes/x+/users+/operators.reset-pin.$operatorId.tsx",
    "apps/erp/app/routes/x+/users+/employees.$employeeId.tsx",
    "apps/erp/app/routes/x+/users+/resend-invite.tsx",
    "apps/erp/app/routes/x+/users+/revoke-invite.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use request-scoped Better Auth clients at the route layer.`
      );
    }
  }

  const operatorNewRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/users+/operators.new.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"users"/.test(
      operatorNewRoute
    ) ||
    !/client[\s\S]*\.from\("employeeType"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operatorNewRoute
    ) ||
    !/createConsoleOperator\(\s*client,\s*\{/.test(operatorNewRoute) ||
    !/client[\s\S]*\.from\("employee"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operatorNewRoute
    )
  ) {
    missing.push(
      "Operator creation route must find operator type, call createConsoleOperator, and set PINs through the request-scoped users client."
    );
  }

  const resetPinRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/users+/operators.reset-pin.$operatorId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"users"/.test(
      resetPinRoute
    ) ||
    !/client[\s\S]*\.from\("employee"\)[\s\S]*\.eq\("id",\s*operatorId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resetPinRoute
    )
  ) {
    missing.push(
      "Operator PIN reset route must update the employee PIN through the request-scoped users client with company scope."
    );
  }

  const employeeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/users+/employees.$employeeId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"users"/.test(
      employeeRoute
    ) ||
    !/getClaims\(\s*client,\s*employeeId,\s*companyId\s*\)/.test(
      employeeRoute
    ) ||
    !/getEmployee\(\s*client,\s*employeeId,\s*companyId\s*\)/.test(
      employeeRoute
    ) ||
    !/getEmployeeTypes\(\s*client,\s*companyId\s*\)/.test(employeeRoute)
  ) {
    missing.push(
      "Employee permissions route must load claims, employee, and employee types through the request-scoped users client."
    );
  }

  const resendRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/users+/resend-invite.tsx"),
    "utf8"
  );
  const pendingInviteLookupPattern =
    /\.from\("invite"\)[\s\S]*\.select\("createdBy"\)[\s\S]*\.eq\("email",\s*user\.data\.email\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)[\s\S]*\.maybeSingle\(\)/;
  const pendingInviteRefreshPattern =
    /\.from\("invite"\)[\s\S]*\.update\(\{\s*code:\s*newCode\s*\}\)[\s\S]*\.eq\("email",\s*user\.data\.email\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)[\s\S]*\.select\("code"\)/;
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"users"/.test(
      resendRoute
    ) ||
    !/client\.from\("company"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      resendRoute
    ) ||
    !/client[\s\S]*\.from\("invite"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      resendRoute
    ) ||
    !pendingInviteLookupPattern.test(resendRoute) ||
    !pendingInviteRefreshPattern.test(resendRoute)
  ) {
    missing.push(
      "Resend-invite route must load company/pending-invite context through the request-scoped users client without reviving accepted or revoked invites."
    );
  }

  const userAdminJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/tasks/user-admin.ts"),
    "utf8"
  );
  if (
    !/deactivateUser\(\s*serviceClient,\s*payload\.id,\s*payload\.companyId\s*\)/.test(
      userAdminJob
    ) ||
    !pendingInviteLookupPattern.test(userAdminJob) ||
    !pendingInviteRefreshPattern.test(userAdminJob)
  ) {
    missing.push(
      "User-admin background job must carry event company scope and only refresh pending invite rows."
    );
  }

  const revokeRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/users+/revoke-invite.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*create:\s*"users"/.test(
      revokeRoute
    ) ||
    !/deactivateUser\(\s*client,\s*usersToRevoke\.data\[0\]\.id,\s*companyId\s*\)/.test(
      revokeRoute
    ) ||
    !/client[\s\S]*\.from\("invite"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      revokeRoute
    ) ||
    !/client[\s\S]*\.from\("invite"\)[\s\S]*\.update\(\{\s*revokedAt:\s*new Date\(\)\.toISOString\(\)\s*\}\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)/.test(
      revokeRoute
    )
  ) {
    missing.push(
      "Revoke-invite route must deactivate users and only revoke pending invite rows through the request-scoped users client."
    );
  }

  const bulkPermissionsRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/users+/bulk-edit-permissions.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*update:\s*"users"/.test(
      bulkPermissionsRoute
    ) ||
    !/payload:\s*\{[\s\S]*id,[\s\S]*permissions,[\s\S]*addOnly,[\s\S]*companyId[\s\S]*\}/.test(
      bulkPermissionsRoute
    )
  ) {
    missing.push(
      "Bulk permission updates must derive company scope from Better Auth and pass it into the async permission update job."
    );
  }

  const usersServer = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/users/users.server.ts"),
    "utf8"
  );
  const usersService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/users/users.service.ts"),
    "utf8"
  );
  const inviteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/_public+/invite.$code.tsx"),
    "utf8"
  );
  if (
    /company\(name\)/.test(inviteRoute) ||
    !/\.from\("invite"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("code",\s*code\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)[\s\S]*\.single\(\)/.test(
      inviteRoute
    ) ||
    !/\.from\("company"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("id",\s*invite\.data\.companyId\)[\s\S]*\.eq\("active",\s*true\)[\s\S]*\.single\(\)/.test(
      inviteRoute
    ) ||
    !/export\s+async\s+function\s+acceptInvite[\s\S]*\.from\("invite"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("code",\s*code\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)[\s\S]*\.single\(\)/.test(
      usersServer
    ) ||
    !/return\s+serviceClient[\s\S]*\.from\("invite"\)[\s\S]*\.update\(\{\s*acceptedAt:\s*new Date\(\)\.toISOString\(\)\s*\}\)[\s\S]*\.eq\("code",\s*code\)[\s\S]*\.eq\("companyId",\s*invite\.data\.companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)/.test(
      usersServer
    )
  ) {
    missing.push(
      "Invite acceptance must only load pending invite rows, fetch active company display data explicitly, and mark rows in the resolved company."
    );
  }

  if (
    !/async function rollbackInvite[\s\S]*\.from\("customerAccount"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*userId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("supplierAccount"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id",\s*userId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      usersServer
    )
  ) {
    missing.push(
      "Invite rollback must delete customer/supplier account rows by id plus companyId."
    );
  }

  if (
    !/export\s+async\s+function\s+updatePermissions[\s\S]*\.from\("userToCompany"\)[\s\S]*\.eq\("userId",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.maybeSingle\(\)/.test(
      usersServer
    ) ||
    !/export\s+async\s+function\s+updatePermissions[\s\S]*getClaims\(\s*client,\s*id,\s*companyId\s*\)/.test(
      usersServer
    )
  ) {
    missing.push(
      "Synchronous user permission updates must verify the target user belongs to the Better Auth request company before privileged permission writes."
    );
  }

  if (
    !/export\s+async\s+function\s+createCustomerAccount[\s\S]*getCustomerContact\(\s*client,\s*id,\s*customerId\s*\)[\s\S]*\.from\("customerContact"\)[\s\S]*\.update\(\{\s*userId\s*\}\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("customerId",\s*customerId\)[\s\S]*insertCustomerAccount\(\s*client,\s*\{[\s\S]*customerId,[\s\S]*companyId/.test(
      usersServer
    ) ||
    !/export\s+async\s+function\s+createSupplierAccount[\s\S]*getSupplierContact\(\s*client,\s*id,\s*supplierId\s*\)[\s\S]*\.from\("supplierContact"\)[\s\S]*\.update\(\{\s*userId\s*\}\)[\s\S]*\.eq\("id",\s*id\)[\s\S]*\.eq\("supplierId",\s*supplierId\)[\s\S]*insertSupplierAccount\(\s*client,\s*\{[\s\S]*supplierId,[\s\S]*companyId/.test(
      usersServer
    )
  ) {
    missing.push(
      "Customer/supplier account invite helpers must bind contact updates to the resolved parent account before issuing invites."
    );
  }

  if (
    !/export\s+async\s+function\s+insertInvite[\s\S]*\.upsert\(\[\{\s*\.\.\.invite,\s*acceptedAt:\s*null,\s*revokedAt:\s*null\s*\}\]/.test(
      usersServer
    ) ||
    !/export\s+async\s+function\s+getUnrevokedInviteEmails[\s\S]*\.from\("invite"\)[\s\S]*\.select\("email"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.is\("acceptedAt",\s*null\)[\s\S]*\.is\("revokedAt",\s*null\)/.test(
      usersService
    )
  ) {
    missing.push(
      "Invite insert/list helpers must keep pending-invite semantics aligned with acceptedAt and revokedAt both null."
    );
  }

  const updatePermissionsJob = readFileSync(
    resolve(repoRoot, "packages/jobs/src/inngest/functions/tasks/update-permissions.ts"),
    "utf8"
  );
  if (
    !/export\s+async\s+function\s+updatePermissions[\s\S]*\.from\("userToCompany"\)[\s\S]*\.eq\("userId",\s*id\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.maybeSingle\(\)/.test(
      updatePermissionsJob
    ) ||
    !/export\s+async\s+function\s+updatePermissions[\s\S]*getClaims\(\s*client,\s*id,\s*companyId\s*\)/.test(
      updatePermissionsJob
    ) ||
    /getCarbonServiceClient\(\)\s*\.from\("userPermission"\)/.test(
      updatePermissionsJob
    )
  ) {
    missing.push(
      "Async permission update job must verify event company membership and avoid a fresh service-client permission write inside the helper."
    );
  }

  return missing;
}

function onboardingRouteRequestScopeFailures() {
  const missing = [];
  const userRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/onboarding+/user.tsx"),
    "utf8"
  );
  const companyRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/onboarding+/company.tsx"),
    "utf8"
  );
  const resourcesService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/resources/resources.service.ts"),
    "utf8"
  );

  if (
    /getCarbonServiceClient\s*\(/.test(userRoute) ||
    !/const\s+\{\s*client,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      userRoute
    ) ||
    !/getUser\(\s*client,\s*userId\s*\)/.test(userRoute) ||
    !/updatePublicAccount\(\s*client,\s*\{[\s\S]*id:\s*userId/.test(
      userRoute
    )
  ) {
    missing.push(
      "Onboarding user profile reads/writes must use the request-scoped Better Auth client, not carbon_service."
    );
  }

  if (
    !/let\s+companyLookupClient\s*=\s*client/.test(companyRoute) ||
    !/if\s*\(\s*company\s*&&\s*location\s*\)\s*\{[\s\S]*const\s+existingCompanyId\s*=\s*company\.id[\s\S]*companyId\s*=\s*existingCompanyId[\s\S]*updateCompany\(\s*client,\s*existingCompanyId[\s\S]*upsertLocation\(\s*client,\s*\{[\s\S]*companyId:\s*existingCompanyId,[\s\S]*updatedBy:\s*userId/.test(
      companyRoute
    ) ||
    !/\}\s*else\s*\{[\s\S]*const\s+serviceClient\s*=\s*getCarbonServiceClient\(\)[\s\S]*companyLookupClient\s*=\s*serviceClient[\s\S]*insertCompany\(\s*serviceClient[\s\S]*seedCompany\(\s*serviceClient,\s*companyId,\s*userId[\s\S]*upsertLocation\(\s*serviceClient[\s\S]*insertEmployeeJob\(\s*serviceClient/.test(
      companyRoute
    ) ||
    !/await\s+companyLookupClient[\s\S]*\.from\("company"\)[\s\S]*\.eq\("id",\s*companyId!\)/.test(
      companyRoute
    )
  ) {
    missing.push(
      "Onboarding company route must use carbon_service only for new-company bootstrap and keep existing company/location updates on the request-scoped client."
    );
  }

  if (
    !/companyId\?:\s*string/.test(resourcesService) ||
    !/\.from\("location"\)[\s\S]*\.update\(sanitize\(data\)\)[\s\S]*\.eq\("id",\s*location\.id\)[\s\S]*if\s*\(\s*companyId\s*\)\s*\{[\s\S]*query\s*=\s*query\.eq\("companyId",\s*companyId\)/.test(
      resourcesService
    )
  ) {
    missing.push(
      "Location updates that carry companyId must retain the company predicate before updating through shared resource helpers."
    );
  }

  return missing;
}

function companySettingsRouteRequestScopeFailures() {
  const missing = [];
  const settingsService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/settings/settings.service.ts"),
    "utf8"
  );

  const companiesRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/companies.tsx"),
    "utf8"
  );
  if (
    /companyGroup\(name\)/.test(settingsService) ||
    !/\.from\("companies"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("userId",\s*userId\)/.test(
      settingsService
    )
  ) {
    missing.push(
      "Settings company list helper must use the greenfield companies view fields directly instead of embedding companyGroup(name)."
    );
  }

  if (
    /getCarbonServiceClient\s*\(/.test(companiesRoute) ||
    !/const\s+\{\s*client,\s*companyGroupId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*view:\s*"settings"/.test(
      companiesRoute
    ) ||
    !/getSubsidiaries\(\s*client,\s*companyGroupId\s*\)/.test(companiesRoute)
  ) {
    missing.push(
      "Company list route must load subsidiaries through the request-scoped settings client."
    );
  }

  const companyDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/companies.delete.$id.tsx"),
    "utf8"
  );
  if (
    /getCarbonServiceClient\s*\(/.test(companyDeleteRoute) ||
    !/const\s+\{\s*client,\s*companyGroupId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*delete:\s*"settings"/.test(
      companyDeleteRoute
    ) ||
    !/getSubsidiary\(\s*client,\s*id\s*\)/.test(companyDeleteRoute) ||
    !/subsidiary\.data\?\.companyGroupId\s*!==\s*companyGroupId/.test(
      companyDeleteRoute
    ) ||
    !/deleteSubsidiary\(\s*client,\s*id\s*\)/.test(companyDeleteRoute)
  ) {
    missing.push(
      "Company delete route must verify company-group scope and delete through the request-scoped settings client."
    );
  }

  for (const file of [
    "apps/erp/app/routes/x+/settings+/company.new.tsx",
    "apps/erp/app/routes/x+/settings+/companies.new.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (!isAllowedCompanyBootstrapServiceRoute(file, source)) {
      missing.push(
        `${file} must keep service-client use constrained to the audited company bootstrap boundary.`
      );
    }
  }

  const apiKeyDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/api-keys.delete.$id.tsx"),
    "utf8"
  );
  const apiKeyEditRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/settings+/api-keys.$id.tsx"),
    "utf8"
  );
  const mcpSettingsTools = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/api+/mcp+/lib/tools/settings.ts"),
    "utf8"
  );

  if (
    !/deleteApiKey\(\s*client,\s*id,\s*companyId\s*\)/.test(
      apiKeyDeleteRoute
    ) ||
    !/deleteApiKey\(\s*ctx\.client,\s*params\.id,\s*ctx\.companyId\s*\)/.test(
      mcpSettingsTools
    ) ||
    !/export\s+async\s+function\s+deleteApiKey\([\s\S]*companyId:\s*string[\s\S]*\.from\("apiKey"\)\.delete\(\)\.eq\("id",\s*id\)\.eq\("companyId",\s*companyId\)/.test(
      settingsService
    )
  ) {
    missing.push(
      "API key delete paths must bind both API key id and request companyId."
    );
  }

  if (
    !/upsertApiKey\(client,\s*\{[\s\S]*id,[\s\S]*companyId,[\s\S]*scopes/.test(
      apiKeyEditRoute
    ) ||
    !/companyId:\s*string;[\s\S]*scopes:\s*Record<string,\s*string\[\]>;[\s\S]*\.from\("apiKey"\)[\s\S]*\.update\([\s\S]*\.eq\("id",\s*apiKey\.id\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      settingsService
    )
  ) {
    missing.push(
      "API key update paths must bind both API key id and request companyId."
    );
  }

  return missing;
}

function mesSubmissionRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/mes/app/routes/x+/feedback.tsx",
    "apps/mes/app/routes/x+/suggestion.tsx",
    "apps/mes/app/routes/x+/record.tsx",
    "apps/mes/app/routes/x+/record.$id.delete.tsx",
    "apps/mes/app/routes/x+/steps.inspection.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the MES request-scoped Better Auth client.`
      );
    }
  }

  const feedbackRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/feedback.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      feedbackRoute
    ) ||
    !/client[\s\S]*\.from\("company"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      feedbackRoute
    ) ||
    !/client[\s\S]*\.from\("user"\)[\s\S]*\.eq\("id",\s*userId\)/.test(
      feedbackRoute
    ) ||
    !/client\.from\("feedback"\)\.insert/.test(feedbackRoute)
  ) {
    missing.push(
      "MES feedback route must read company/user context and insert feedback through the request client."
    );
  }

  const suggestionRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/suggestion.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      suggestionRoute
    ) ||
    !/client[\s\S]*\.from\("suggestion"\)[\s\S]*companyId/.test(
      suggestionRoute
    ) ||
    !/client[\s\S]*\.from\("company"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      suggestionRoute
    )
  ) {
    missing.push(
      "MES suggestion route must insert suggestions and read notification settings through the request client."
    );
  }

  const recordRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/record.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      recordRoute
    ) ||
    !/insertAttributeRecord\(\s*client,\s*\{/.test(recordRoute)
  ) {
    missing.push(
      "MES attribute record route must insert through the request client with company/user context."
    );
  }

  const recordDeleteRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/record.$id.delete.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      recordDeleteRoute
    ) ||
    !/deleteAttributeRecord\(\s*client,\s*\{/.test(recordDeleteRoute)
  ) {
    missing.push(
      "MES attribute record delete route must delete through the request client with company/user context."
    );
  }

  const inspectionRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/steps.inspection.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      inspectionRoute
    ) ||
    !/insertedSteps\s*=\s*payload\.filter\(\(step\)\s*=>\s*step\.companyId\s*===\s*companyId\)/.test(
      inspectionRoute
    ) ||
    !/client[\s\S]*\.from\("jobOperationStep"\)[\s\S]*\.insert\(insertedSteps\)/.test(
      inspectionRoute
    )
  ) {
    missing.push(
      "MES inspection-step route must filter payload rows by request company and insert through the request client."
    );
  }

  return missing;
}

function mesJobOperationRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/mes/app/routes/x+/jobs.tsx",
    "apps/mes/app/routes/x+/assigned.tsx",
    "apps/mes/app/routes/x+/job.$jobId.tsx",
    "apps/mes/app/routes/x+/operations.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the MES request-scoped Better Auth client.`
      );
    }
  }

  const jobsRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/jobs.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      jobsRoute
    ) ||
    !/getOpenJobs\(\s*client,\s*\{\s*companyId,\s*locationId\s*\}\s*\)/.test(
      jobsRoute
    ) ||
    !/getTrackedEntitiesByJobMakeMethodIds\(\s*client,\s*jobMakeMethodIds,\s*companyId\s*\)/.test(
      jobsRoute
    )
  ) {
    missing.push(
      "MES jobs route must load open jobs and tracked entities through the request client."
    );
  }

  const assignedRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/assigned.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      assignedRoute
    ) ||
    !/getJobOperationsAssignedToEmployee\(\s*client,\s*userId,\s*companyId\s*\)/.test(
      assignedRoute
    ) ||
    !/getWorkCentersByLocation\(\s*client,\s*locationId,\s*companyId\s*\)/.test(
      assignedRoute
    )
  ) {
    missing.push(
      "MES assigned route must load employee operations and work centers through the request client."
    );
  }

  const jobDagRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/job.$jobId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      jobDagRoute
    ) ||
    !/client[\s\S]*\.from\("jobs"\)[\s\S]*\.eq\("id",\s*jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      jobDagRoute
    ) ||
    !/getJobOperations\(\s*client,\s*jobId,\s*companyId\s*\)/.test(
      jobDagRoute
    ) ||
    !/getJobOperationDependencies\(\s*client,\s*jobId,\s*companyId\s*\)/.test(
      jobDagRoute
    )
  ) {
    missing.push(
      "MES job DAG route must company-scope the job lookup and load graph data through the request client."
    );
  }

  const operationsRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/operations.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      operationsRoute
    ) ||
    !/getWorkCentersByLocation\(\s*client,\s*locationId,\s*companyId\s*\)/.test(
      operationsRoute
    ) ||
    !/getProcessesList\(\s*client,\s*companyId\s*\)/.test(operationsRoute) ||
    !/getActiveJobOperationsByLocation\(\s*client,\s*\{[\s\S]*locationId,[\s\S]*companyId[\s\S]*\},\s*selectedWorkCenterIds\s*\)/.test(
      operationsRoute
    ) ||
    !/getCustomers\(\s*client,\s*companyId,\s*customerIds\s*\)/.test(
      operationsRoute
    )
  ) {
    missing.push(
      "MES operations route must load schedule data and customer context through the request client."
    );
  }

  return missing;
}

function mesMaintenanceInventoryActionRouteRequestScopeFailures() {
  const missing = [];
  const routeFiles = [
    "apps/mes/app/routes/x+/adjustment.tsx",
    "apps/mes/app/routes/x+/dispatch.$dispatchId.item.tsx",
    "apps/mes/app/routes/x+/end-shift.tsx",
    "apps/mes/app/routes/x+/maintenance-event.tsx",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (/getCarbonService(Client|Role)\s*\(/.test(source)) {
      missing.push(
        `${file} must use the MES request-scoped Better Auth client.`
      );
    }
  }

  const adjustmentRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/adjustment.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      adjustmentRoute
    ) ||
    !/insertManualInventoryAdjustment\(\s*client,\s*\{/.test(adjustmentRoute)
  ) {
    missing.push(
      "MES inventory adjustment route must insert item-ledger adjustments through the request client."
    );
  }

  const dispatchItemRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/dispatch.$dispatchId.item.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      dispatchItemRoute
    ) ||
    !/addMaintenanceDispatchItem\(\s*client,\s*\{/.test(dispatchItemRoute) ||
    !/invokeFunction\("issue",[\s\S]*maintenanceDispatchUnissue[\s\S]*companyId[\s\S]*userId/.test(
      dispatchItemRoute
    )
  ) {
    missing.push(
      "MES maintenance dispatch item route must add items through the request client and keep unissue calls company/user-scoped."
    );
  }

  const endShiftRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/end-shift.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{[\s\S]*client,[\s\S]*companyId,[\s\S]*userId,[\s\S]*consoleMode[\s\S]*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      endShiftRoute
    ) ||
    !/endProductionEvents\(\s*client,\s*\{/.test(endShiftRoute) ||
    !/client[\s\S]*\.from\("companySettings"\)[\s\S]*\.eq\("id",\s*companyId\)/.test(
      endShiftRoute
    ) ||
    !/client[\s\S]*\.from\("timeCardEntry"\)[\s\S]*\.eq\("employeeId",\s*userId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      endShiftRoute
    )
  ) {
    missing.push(
      "MES end-shift route must end production, read settings, and clock out through the request client."
    );
  }

  const maintenanceEventRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/maintenance-event.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*companyId,\s*userId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      maintenanceEventRoute
    ) ||
    !/startMaintenanceEvent\(\s*client,\s*\{/.test(maintenanceEventRoute) ||
    !/endMaintenanceEvent\(\s*client,\s*\{/.test(maintenanceEventRoute) ||
    !/updateMaintenanceDispatchStatus\(\s*client,\s*\{/.test(
      maintenanceEventRoute
    )
  ) {
    missing.push(
      "MES maintenance-event route must start/end events and update dispatch status through the request client."
    );
  }

  return missing;
}

function mesProductionCompanyScopeFailures() {
  const missing = [];
  const operationsService = readFileSync(
    resolve(repoRoot, "apps/mes/app/services/operations.service.ts"),
    "utf8"
  );
  const endRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/end.$operationId.tsx"),
    "utf8"
  );
  const mesOperationRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0009_mes_job_operation_rpcs.sql"),
    "utf8"
  );
  const traceabilityRpcs = readFileSync(
    resolve(repoRoot, "packages/database/drizzle/0010_traceability_lineage_rpcs.sql"),
    "utf8"
  );

  if (
    /jobOperationStepRecord\(\*\)|customer\(name\)/.test(operationsService) ||
    /\.\.\.process\(completeAllOnScan\)/.test(endRoute) ||
    !/function\s+attachJobOperationStepRecords[\s\S]*\.from\("jobOperationStepRecord"\)[\s\S]*\.select\("\*"\)[\s\S]*\.in\("jobOperationStepId",\s*stepIds\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationsService
    ) ||
    !/\.from\("customer"\)[\s\S]*\.select\("name"\)[\s\S]*\.eq\("id",\s*job\.data\.customerId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationsService
    ) ||
    !/\.from\("process"\)[\s\S]*\.select\("completeAllOnScan"\)[\s\S]*\.eq\("id",\s*jobOperation\.data\.processId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      endRoute
    )
  ) {
    missing.push(
      "MES operation helpers must use explicit company-scoped reads for step records, customer metadata, and process completion flags instead of embedded selectors."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_active_job_operations_by_location\([\s\S]*location_id\s+text,[\s\S]*company_id\s+text,[\s\S]*work_center_ids\s+text\[\]/.test(
      mesOperationRpcs
    ) ||
    !/FROM\s+"job"[\s\S]*WHERE\s+"locationId"\s*=\s*location_id[\s\S]*AND\s+"companyId"\s*=\s*company_id/.test(
      mesOperationRpcs
    ) ||
    !/WHERE\s+jo\."companyId"\s*=\s*company_id[\s\S]*array_length\(work_center_ids,\s*1\)/.test(
      mesOperationRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_job_operation_by_id\([\s\S]*operation_id\s+text,[\s\S]*company_id\s+text[\s\S]*"companyId"\s+text/.test(
      mesOperationRpcs
    ) ||
    !/SELECT[\s\S]*jo\."id",[\s\S]*jo\."companyId",[\s\S]*jo\."jobId"[\s\S]*WHERE\s+jo\.id\s*=\s*operation_id[\s\S]*AND\s+jo\."companyId"\s*=\s*company_id/.test(
      mesOperationRpcs
    )
  ) {
    missing.push(
      "MES operation RPCs must accept request company scope, return operation companyId, and filter location/detail reads by company_id."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_active_job_operations_by_employee\([\s\S]*employee_id\s+text,[\s\S]*company_id\s+text/.test(
      mesOperationRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_recent_job_operations_by_employee\([\s\S]*employee_id\s+text,[\s\S]*company_id\s+text/.test(
      mesOperationRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_assigned_job_operations\([\s\S]*user_id\s+text,[\s\S]*company_id\s+text/.test(
      mesOperationRpcs
    ) ||
    !/JOIN\s+"job"\s+j\s+ON\s+j\.id\s*=\s*jo\."jobId"\s+AND\s+j\."companyId"\s*=\s*company_id/.test(
      mesOperationRpcs
    ) ||
    !/WHERE\s+jo\."assignee"\s*=\s*user_id[\s\S]*AND\s+jo\."companyId"\s*=\s*company_id/.test(
      mesOperationRpcs
    )
  ) {
    missing.push(
      "MES employee and assigned operation RPCs must require company_id and company-scope operation/job joins."
    );
  }

  if (
    !/DROP\s+FUNCTION\s+IF\s+EXISTS\s+get_job_operations_by_work_center\(text,\s*text\)/.test(
      mesOperationRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_job_operations_by_work_center\([\s\S]*work_center_id\s+text,[\s\S]*location_id\s+text,[\s\S]*company_id\s+text/.test(
      mesOperationRpcs
    ) ||
    !/WHERE\s+"locationId"\s*=\s*location_id[\s\S]*AND\s+"companyId"\s*=\s*company_id/.test(
      mesOperationRpcs
    ) ||
    !/WHERE\s+jo\."workCenterId"\s*=\s*work_center_id[\s\S]*AND\s+jo\."companyId"\s*=\s*company_id/.test(
      mesOperationRpcs
    ) ||
    !/function\s+getJobOperationsByWorkCenter\([\s\S]*companyId:\s*string[\s\S]*rpc\("get_job_operations_by_work_center",\s*\{[\s\S]*location_id:\s*locationId,[\s\S]*work_center_id:\s*workCenterId,[\s\S]*company_id:\s*companyId/.test(
      operationsService
    )
  ) {
    missing.push(
      "MES work-center operation RPC/helper must drop the legacy unscoped overload and require request company scope."
    );
  }

  if (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_direct_descendants_of_tracked_entity_strict\([\s\S]*p_tracked_entity_id\s+text,[\s\S]*p_company_id\s+text/.test(
      traceabilityRpcs
    ) ||
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_direct_ancestors_of_tracked_entity_strict\([\s\S]*p_tracked_entity_id\s+text,[\s\S]*p_company_id\s+text/.test(
      traceabilityRpcs
    ) ||
    !/source_te\."id"\s*=\s*p_tracked_entity_id[\s\S]*source_te\."companyId"\s*=\s*p_company_id/.test(
      traceabilityRpcs
    ) ||
    !/tai\."companyId"\s*=\s*p_company_id[\s\S]*te\."companyId"\s*=\s*p_company_id[\s\S]*ta\."companyId"\s*=\s*p_company_id/.test(
      traceabilityRpcs
    ) ||
    !/tao\."companyId"\s*=\s*p_company_id[\s\S]*te\."companyId"\s*=\s*p_company_id[\s\S]*ta\."companyId"\s*=\s*p_company_id/.test(
      traceabilityRpcs
    )
  ) {
    missing.push(
      "MES traceability lineage RPCs must require p_company_id and filter source, activity, and entity rows by company."
    );
  }

  if (
    !/function\s+getTrackedEntitiesByMakeMethodId\([\s\S]*jobMakeMethodId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("trackedEntity"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.eq\("attributes->>Job Make Method",\s*jobMakeMethodId\)/.test(
      operationsService
    ) ||
    !/function\s+getTrackedEntitiesByOperationId\([\s\S]*operationId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationsService
    )
  ) {
    missing.push(
      "MES tracked-entity helpers must carry request company scope through operation and make-method lookups."
    );
  }

  if (
    !/function\s+getJobByOperationId\([\s\S]*operationId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("jobs"\)[\s\S]*\.eq\("id",\s*operation\.data\.jobId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationsService
    ) ||
    !/function\s+getJobOperationById\([\s\S]*operationId:\s*string,\s*companyId:\s*string[\s\S]*rpc\("get_job_operation_by_id",\s*\{[\s\S]*operation_id:\s*operationId,[\s\S]*company_id:\s*companyId/.test(
      operationsService
    ) ||
    !/function\s+getJobOperationProcedure\([\s\S]*operationId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("jobOperationStep"\)[\s\S]*\.eq\("operationId",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("jobOperationParameter"\)[\s\S]*\.eq\("operationId",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationsService
    ) ||
    !/function\s+getJobMaterialsByOperationId\([\s\S]*companyId:\s*string[\s\S]*\.from\("jobMaterialWithMakeMethodId"\)[\s\S]*\.eq\("jobMakeMethodId",\s*operation\.jobMakeMethodId\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*getTrackedInputs\(client,\s*trackedEntityId,\s*companyId\)/.test(
      operationsService
    ) ||
    !/function\s+getTrackedInputs\([\s\S]*trackedEntityId:\s*string\s*\|\s*undefined,[\s\S]*companyId:\s*string[\s\S]*p_tracked_entity_id:\s*trackedEntityId,[\s\S]*p_company_id:\s*companyId[\s\S]*p_tracked_entity_id:\s*trackedEntityId,[\s\S]*p_company_id:\s*companyId/.test(
      operationsService
    ) ||
    !/function\s+getProductionEventsForJobOperation\([\s\S]*companyId:\s*string[\s\S]*\.from\("productionEvent"\)[\s\S]*\.eq\("jobOperationId",\s*args\.operationId\)[\s\S]*\.eq\("companyId",\s*args\.companyId\)/.test(
      operationsService
    ) ||
    !/function\s+getProductionQuantitiesForJobOperation\([\s\S]*operationId:\s*string,\s*companyId:\s*string[\s\S]*\.from\("productionQuantity"\)[\s\S]*\.eq\("jobOperationId",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      operationsService
    ) ||
    !/function\s+finishJobOperation\([\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*args\.jobOperationId\)[\s\S]*\.eq\("companyId",\s*args\.companyId\)[\s\S]*\.from\("productionEvent"\)[\s\S]*\.eq\("postedToGL",\s*false\)[\s\S]*\.eq\("companyId",\s*args\.companyId\)/.test(
      operationsService
    ) ||
    !/function\s+startProductionEvent\([\s\S]*companyId:\s*string[\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*data\.jobOperationId\)[\s\S]*\.eq\("companyId",\s*data\.companyId\)/.test(
      operationsService
    )
  ) {
    missing.push(
      "MES production operation helpers must include company scope on job, detail, procedure, material, lineage, event, quantity, and finish/start-operation paths."
    );
  }

  const startRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/start.$operationId.tsx"),
    "utf8"
  );
  if (
    !/const\s+\{\s*client,\s*userId,\s*companyId\s*\}\s*=\s*await\s+requirePermissions\s*\(\s*request,\s*\{\s*\}\s*\)/.test(
      startRoute
    ) ||
    !/client[\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      startRoute
    ) ||
    !/client[\s\S]*\.from\("productionEvent"\)[\s\S]*\.eq\("jobOperationId",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      startRoute
    ) ||
    !/getTrackedEntitiesByMakeMethodId\(\s*client,\s*jobOperation\.data\.jobMakeMethodId,\s*companyId\s*\)/.test(
      startRoute
    ) ||
    !/startProductionEvent\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*createdBy:\s*userId/.test(
      startRoute
    )
  ) {
    missing.push(
      "MES start-operation route must load/update/start production through request client paths scoped to the request company."
    );
  }

  const completeRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/complete.tsx"),
    "utf8"
  );
  if (
    !/client[\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*validation\.data\.jobOperationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      completeRoute
    ) ||
    !/client[\s\S]*\.from\("productionQuantity"\)[\s\S]*\.eq\("jobOperationId",\s*validation\.data\.jobOperationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      completeRoute
    ) ||
    !/insertProductionQuantity\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*createdBy:\s*userId/.test(
      completeRoute
    ) ||
    !/finishJobOperation\(\s*client,\s*\{[\s\S]*companyId/.test(
      completeRoute
    ) ||
    !/invokeFunction\("issue",[\s\S]*companyId[\s\S]*userId/.test(
      completeRoute
    )
  ) {
    missing.push(
      "MES complete route must read quantities, insert production, finish operations, and dispatch issue calls with request company/user scope."
    );
  }

  if (
    !/client[\s\S]*\.from\("jobOperation"\)[\s\S]*\.eq\("id",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      endRoute
    ) ||
    !/client[\s\S]*\.from\("productionQuantity"\)[\s\S]*\.eq\("jobOperationId",\s*operationId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      endRoute
    ) ||
    !/client[\s\S]*\.from\("jobMakeMethod"\)[\s\S]*\.eq\("id",\s*jobOperation\.data\.jobMakeMethodId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      endRoute
    ) ||
    !/getTrackedEntitiesByMakeMethodId\(\s*client,\s*jobOperation\.data\.jobMakeMethodId,\s*companyId\s*\)/.test(
      endRoute
    ) ||
    !/insertProductionQuantity\(\s*client,\s*\{[\s\S]*companyId,[\s\S]*createdBy:\s*userId/.test(
      endRoute
    ) ||
    !/finishJobOperation\(\s*client,\s*\{[\s\S]*companyId/.test(endRoute)
  ) {
    missing.push(
      "MES end-operation route must company-scope operation, quantity, method, tracked-entity, production, and finish paths."
    );
  }

  const operationRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/operation.$operationId.tsx"),
    "utf8"
  );
  if (
    !/getProductionEventsForJobOperation\(\s*client,\s*\{[\s\S]*operationId,[\s\S]*userId,[\s\S]*companyId[\s\S]*\}\s*\)/.test(
      operationRoute
    ) ||
    !/getProductionQuantitiesForJobOperation\(\s*client,\s*operationId,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/getJobByOperationId\(\s*client,\s*operationId,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/getJobOperationById\(\s*client,\s*operationId,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/job\.data\.companyId\s*!==\s*companyId[\s\S]*operation\.data\?\.\[0\]\?\.companyId\s*!==\s*companyId/.test(
      operationRoute
    ) ||
    !/getThumbnailPathByItemId\(\s*client,\s*operation\.data\?\.\[0\]\.itemId,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/getJobMakeMethod\(\s*client,\s*operation\.data\?\.\[0\]\.jobMakeMethodId,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/getTrackedEntitiesByMakeMethodId\(\s*client,\s*operation\.data\?\.\[0\]\.jobMakeMethodId,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/getJobMaterialsByOperationId\(\s*client,\s*\{[\s\S]*companyId[\s\S]*\}\s*\)/.test(
      operationRoute
    ) ||
    !/getJobOperationProcedure\(\s*client,\s*operation\.data\?\.\[0\]\.id,\s*companyId\s*\)/.test(
      operationRoute
    ) ||
    !/getWorkCenter\(\s*client,\s*operation\.data\?\.\[0\]\.workCenterId,\s*companyId\s*\)/.test(
      operationRoute
    )
  ) {
    missing.push(
      "MES operation detail route must pass request company scope into production helper reads and reject mismatched operation data."
    );
  }

  const operationsRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/operations.tsx"),
    "utf8"
  );
  if (
    !/getWorkCentersByLocation\(\s*client,\s*locationId,\s*companyId\s*\)/.test(
      operationsRoute
    ) ||
    !/getActiveJobOperationsByLocation\(\s*client,\s*\{[\s\S]*locationId,[\s\S]*companyId[\s\S]*\},\s*selectedWorkCenterIds\s*\)/.test(
      operationsRoute
    )
  ) {
    missing.push(
      "MES operations board route must pass request company scope into work-center and active-operation RPC reads."
    );
  }

  const dispatchNewRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/x+/dispatch.new.tsx"),
    "utf8"
  );
  if (
    !/client[\s\S]*\.from\("workCenter"\)[\s\S]*\.eq\("id",\s*validation\.data\.workCenterId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      dispatchNewRoute
    ) ||
    !/endProductionEventsByWorkCenter\(\s*client,\s*\{[\s\S]*companyId/.test(
      dispatchNewRoute
    ) ||
    !/client[\s\S]*\.from\("maintenanceFailureMode"\)[\s\S]*\.eq\("id",\s*validation\.data\.suspectedFailureModeId\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      dispatchNewRoute
    )
  ) {
    missing.push(
      "MES maintenance dispatch creation must company-scope work-center, failure-mode, and production-event side effects."
    );
  }

  const labelPdfRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/file+/operation+/$id.labels[.]pdf.tsx"),
    "utf8"
  );
  const labelZplRoute = readFileSync(
    resolve(repoRoot, "apps/mes/app/routes/file+/operation+/$id.labels[.]zpl.tsx"),
    "utf8"
  );
  if (
    !/getTrackedEntitiesByOperationId\(\s*client,\s*id,\s*companyId\s*\)/.test(
      labelPdfRoute
    ) ||
    !/getTrackedEntitiesByMakeMethodId\(\s*client,\s*id,\s*companyId\s*\)/.test(
      labelZplRoute
    )
  ) {
    missing.push(
      "MES operation label routes must pass request company scope into tracked-entity label lookups."
    );
  }

  return missing;
}

function scopedRouteHelperFailures({ routePrefix, routeParamSegment, helper }) {
  return files
    .filter(
      (file) =>
        file.startsWith(routePrefix) &&
        file.includes(routeParamSegment) &&
        file.endsWith(".tsx")
    )
    .flatMap((file) => {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      if (!/requirePermissions\s*\(\s*request/.test(source)) {
        return [];
      }

      if (new RegExp(`${helper}\\s*\\(`).test(source)) {
        return [];
      }

      return [`${file} uses requirePermissions without ${helper}.`];
    });
}

function customerJobScopeFailures() {
  const scopeFailures = [];
  const productionDashboard = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/production+/_index.tsx"),
    "utf8"
  );
  const scopedJobRoutes = [
    "apps/erp/app/routes/x+/job+/$jobId.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.details.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.make.$methodId.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.events.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.quantities.tsx",
    "apps/erp/app/routes/x+/job+/$jobId.quantities.$id.tsx",
  ];

  if (
    !/role\s*===\s*"customer"[\s\S]*activeJobsQuery\s*=\s*activeJobsQuery\.eq\(\s*"customerId"/.test(
      productionDashboard
    )
  ) {
    scopeFailures.push(
      "Production dashboard does not filter active jobs by scoped customerId for customer users."
    );
  }

  if (
    !/events:\s*[\s\S]*role\s*===\s*"customer"\s*\?[\s\S]*Promise\.resolve\(\{\s*data:\s*\[\]/.test(
      productionDashboard
    )
  ) {
    scopeFailures.push(
      "Production dashboard does not suppress active production events for customer users."
    );
  }

  for (const file of scopedJobRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (!/assertCustomerAccountScope\s*\(\s*auth,\s*job\.data\?\.customerId\s*\)/.test(source)) {
      scopeFailures.push(
        `${file} does not verify job.customerId with assertCustomerAccountScope.`
      );
    }
  }

  return scopeFailures;
}

function supplierItemScopeFailures() {
  const scopeFailures = [];
  const itemsService = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/items/items.service.ts"),
    "utf8"
  );
  const listRoutes = [
    "apps/erp/app/routes/x+/items+/parts.tsx",
    "apps/erp/app/routes/x+/items+/materials.tsx",
    "apps/erp/app/routes/x+/items+/tools.tsx",
    "apps/erp/app/routes/x+/items+/consumables.tsx",
  ];
  const detailRoutes = [
    "apps/erp/app/routes/x+/part+/$itemId.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.tsx",
  ];
  const purchasingRoutes = [
    "apps/erp/app/routes/x+/part+/$itemId.purchasing.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.purchasing.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.purchasing.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.purchasing.tsx",
  ];
  const costingRoutes = [
    "apps/erp/app/routes/x+/part+/$itemId.costing.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.costing.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.costing.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.costing.tsx",
  ];
  const supplierPartEditRoutes = [
    "apps/erp/app/routes/x+/part+/$itemId.purchasing.$supplierPartId.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.purchasing.$supplierPartId.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.purchasing.$supplierPartId.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.purchasing.$supplierPartId.tsx",
  ];
  const supplierPartNewRoutes = [
    "apps/erp/app/routes/x+/part+/$itemId.purchasing.new.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.purchasing.new.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.purchasing.new.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.purchasing.new.tsx",
  ];

  if (
    !/export\s+async\s+function\s+assertSupplierItemScope\b[\s\S]*role\s*!==\s*"supplier"[\s\S]*\.from\("supplierPart"\)[\s\S]*\.eq\("supplierId",\s*args\.supplierId\)/.test(
      itemsService
    )
  ) {
    scopeFailures.push(
      "Could not verify assertSupplierItemScope checks supplierPart ownership for supplier users."
    );
  }

  if (
    !/export\s+async\s+function\s+assertSupplierPartScope\b[\s\S]*role\s*!==\s*"supplier"[\s\S]*supplierPart\.data\.supplierId\s*!==\s*args\.supplierId/.test(
      itemsService
    )
  ) {
    scopeFailures.push(
      "Could not verify assertSupplierPartScope rejects out-of-scope supplierPart rows."
    );
  }

  if (
    /getItemCost[\s\S]*\.\.\.item\(readableIdWithRevision\)/.test(
      itemsService
    ) ||
    !/getItemCost[\s\S]*\.from\("itemCost"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("item"\)[\s\S]*\.select\("readableIdWithRevision"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    )
  ) {
    scopeFailures.push(
      "Item cost reads must load item metadata with an explicit request-company-scoped item query."
    );
  }

  if (
    /getItemCustomerPart[\s\S]*customer\(id,\s*name\)/.test(itemsService) ||
    !/getItemCustomerPart[\s\S]*\.from\("customerPartToItem"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("customer"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    ) ||
    !/getItemCustomerParts[\s\S]*\.from\("customerPartToItem"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("customer"\)[\s\S]*\.select\("id, name"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    )
  ) {
    scopeFailures.push(
      "Customer part reads must resolve customers through explicit request-company-scoped customer queries."
    );
  }

  if (
    /\.select\("id, methodType, \.\.\.job\(documentReadableId:jobId, documentId:id\)"\)|\.select\("id, \.\.\.receipt\(documentReadableId:receiptId, documentId:id\)"\)|\.select\("id, \.\.\.shipment\(documentReadableId:shipmentId, documentId:id\)"\)/.test(
      itemsService
    ) ||
    !/async\s+function\s+getJobMaterialReferences\([\s\S]*\.from\("jobMaterial"\)[\s\S]*\.select\("id, methodType, jobId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("job"\)[\s\S]*\.select\("id, jobId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    ) ||
    !/async\s+function\s+getReceiptLineReferences\([\s\S]*\.from\("receiptLine"\)[\s\S]*\.select\("id, receiptId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("receipt"\)[\s\S]*\.select\("id, receiptId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    ) ||
    !/async\s+function\s+getShipmentLineReferences\([\s\S]*\.from\("shipmentLine"\)[\s\S]*\.select\("id, shipmentId"\)[\s\S]*\.eq\("companyId",\s*companyId\)[\s\S]*\.from\("shipment"\)[\s\S]*\.select\("id, shipmentId"\)[\s\S]*\.eq\("companyId",\s*companyId\)/.test(
      itemsService
    )
  ) {
    scopeFailures.push(
      "Item used-in job, receipt, and shipment references must resolve document ids through explicit request-company-scoped reads."
    );
  }

  for (const file of listRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (
      !/supplierId:\s*scopedSupplierId/.test(source) ||
      !/role\s*===\s*"supplier"\s*\?\s*scopedSupplierId\s*:\s*searchParams\.get\("supplierId"\)/.test(
        source
      )
    ) {
      scopeFailures.push(
        `${file} does not force list supplierId filtering to the scoped supplier account.`
      );
    }
  }

  for (const file of detailRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (!/assertSupplierItemScope\s*\(/.test(source)) {
      scopeFailures.push(`${file} does not verify supplier item scope.`);
    }
    if (
      !/getSupplierParts\([\s\S]*role\s*===\s*"supplier"\s*\?\s*supplierId\s*:\s*undefined/.test(
        source
      )
    ) {
      scopeFailures.push(
        `${file} does not filter supplier parts to the scoped supplier account.`
      );
    }
  }

  for (const file of purchasingRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (occurrences(source, "assertSupplierItemScope(") < 2) {
      scopeFailures.push(
        `${file} does not verify supplier item scope in loader and action.`
      );
    }
  }

  for (const file of costingRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (
      occurrences(source, "assertSupplierItemScope(") < 2 ||
      occurrences(source, "allowCreatedBy: false") < 2
    ) {
      scopeFailures.push(
        `${file} does not require supplier ownership through supplierPart before itemCost access.`
      );
    }
  }

  for (const file of supplierPartEditRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (occurrences(source, "assertSupplierPartScope(") < 2) {
      scopeFailures.push(
        `${file} does not verify supplierPart scope in loader and action.`
      );
    }
    if (
      !/validation\.data\.itemId\s*!==\s*itemId/.test(source) ||
      !/validation\.data\.supplierId\s*!==\s*supplierId/.test(source)
    ) {
      scopeFailures.push(
        `${file} does not verify submitted supplierPart item/supplier IDs.`
      );
    }
  }

  for (const file of supplierPartNewRoutes) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (!/assertSupplierItemScope\s*\(/.test(source)) {
      scopeFailures.push(
        `${file} does not verify supplier item scope before creating supplierPart.`
      );
    }
    if (
      !/validation\.data\.itemId\s*!==\s*itemId/.test(source) ||
      !/validation\.data\.supplierId\s*!==\s*supplierId/.test(source)
    ) {
      scopeFailures.push(
        `${file} does not verify submitted supplierPart item/supplier IDs.`
      );
    }
  }

  const deleteRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/items+/delete.$itemId.tsx"),
    "utf8"
  );
  if (!/assertSupplierItemScope\s*\(/.test(deleteRoute)) {
    scopeFailures.push("Item delete route does not verify supplier item scope.");
  }

  const quickCostRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/items+/cost.$itemId.tsx"),
    "utf8"
  );
  if (
    !/assertSupplierItemScope\s*\(/.test(quickCostRoute) ||
    !/allowCreatedBy:\s*false/.test(quickCostRoute)
  ) {
    scopeFailures.push(
      "Quick item-cost update route does not require supplier ownership through supplierPart."
    );
  }

  const bulkUpdateRoute = readFileSync(
    resolve(repoRoot, "apps/erp/app/routes/x+/items+/update.tsx"),
    "utf8"
  );
  if (
    !/assertSupplierItemScope\s*\(/.test(bulkUpdateRoute) ||
    !/field\s*===\s*"itemPostingGroupId"\s*\?\s*false\s*:\s*undefined/.test(
      bulkUpdateRoute
    )
  ) {
    scopeFailures.push(
      "Bulk item update route does not scope supplier item and itemCost updates separately."
    );
  }

  return scopeFailures;
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function parseImportPermissionModules() {
  const source = readFileSync(
    resolve(repoRoot, "apps/erp/app/modules/shared/imports.models.ts"),
    "utf8"
  );
  const start = source.indexOf("export const importPermissions");
  if (start === -1) {
    failures.push("Could not find importPermissions map for import route audit.");
    return [];
  }

  const open = source.indexOf("{", start);
  const end = source.indexOf("\n};", open);
  if (open === -1 || end === -1) {
    failures.push("Could not parse importPermissions map for import route audit.");
    return [];
  }

  return [
    ...new Set(
      [...source.slice(open, end).matchAll(/:\s*"([^"]+)"/g)].map(
        (match) => match[1]
      )
    ),
  ].sort();
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}
