CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
DO $$ BEGIN
  CREATE ROLE carbon_app;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE ROLE carbon_service BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO carbon_app, carbon_service', current_database());
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO carbon_app, carbon_service;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carbon_app, carbon_service;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO carbon_app, carbon_service;--> statement-breakpoint
CREATE TYPE "public"."accountType" AS ENUM('Bank', 'Cash', 'Accounts Receivable', 'Accounts Payable', 'Inventory', 'Fixed Asset', 'Accumulated Depreciation', 'Other Current Asset', 'Other Asset', 'Other Current Liability', 'Long Term Liability', 'Equity - No Close', 'Equity - Close', 'Retained Earnings', 'Income', 'Cost of Goods Sold', 'Expense', 'Other Income', 'Other Expense', 'Tax', 'Investments');--> statement-breakpoint
CREATE TYPE "public"."accountingPeriodStatus" AS ENUM('Inactive', 'Active');--> statement-breakpoint
CREATE TYPE "public"."approvalDocumentType" AS ENUM('purchaseOrder', 'qualityDocument', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."approvalStatus" AS ENUM('Pending', 'Approved', 'Rejected', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."configurationParameterDataType" AS ENUM('text', 'numeric', 'boolean', 'list', 'date', 'material');--> statement-breakpoint
CREATE TYPE "public"."costLedgerType" AS ENUM('Direct Cost', 'Revaluation', 'Rounding', 'Indirect Cost', 'Variance', 'Total');--> statement-breakpoint
CREATE TYPE "public"."deadlineType" AS ENUM('No Deadline', 'ASAP', 'Soft Deadline', 'Hard Deadline');--> statement-breakpoint
CREATE TYPE "public"."demandSourceType" AS ENUM('Sales Order', 'Job Material');--> statement-breakpoint
CREATE TYPE "public"."dimensionEntityType" AS ENUM('Custom', 'Location', 'ItemPostingGroup', 'SupplierType', 'CustomerType', 'Department', 'Employee', 'CostCenter');--> statement-breakpoint
CREATE TYPE "public"."disposition" AS ENUM('Conditional Acceptance', 'Deviation Accepted', 'Hold', 'No Action Required', 'Pending', 'Quarantine', 'Repair', 'Return to Supplier', 'Rework', 'Scrap', 'Use As Is');--> statement-breakpoint
CREATE TYPE "public"."documentSourceType" AS ENUM('Job', 'Part', 'Purchase Order', 'Purchase Invoice', 'Purchase Return Order', 'Quote', 'Receipt', 'Request for Quote', 'Sales Order', 'Sales Invoice', 'Sales Return Order', 'Service', 'Shipment', 'Material', 'Tool', 'Fixture', 'Consumable', 'Issue', 'Gauge Calibration Record', 'Purchasing Request for Quote', 'Supplier Quote');--> statement-breakpoint
CREATE TYPE "public"."documentTransactionType" AS ENUM('Download', 'Edit', 'Favorite', 'Label', 'Unfavorite', 'Upload');--> statement-breakpoint
CREATE TYPE "public"."documentType" AS ENUM('Archive', 'Document', 'Presentation', 'PDF', 'Spreadsheet', 'Text', 'Image', 'Video', 'Audio', 'Other', 'Model');--> statement-breakpoint
CREATE TYPE "public"."documentthreadtype" AS ENUM('nonConformance', 'quote', 'salesOrder', 'job', 'purchaseOrder', 'invoice', 'receipt', 'shipment');--> statement-breakpoint
CREATE TYPE "public"."employeeTypeSystemType" AS ENUM('Admin', 'Console Operator');--> statement-breakpoint
CREATE TYPE "public"."externalLinkDocumentType" AS ENUM('Quote', 'SupplierQuote', 'Customer', 'Non-Conformance Supplier');--> statement-breakpoint
CREATE TYPE "public"."factor" AS ENUM('Hours/Piece', 'Hours/100 Pieces', 'Hours/1000 Pieces', 'Minutes/Piece', 'Minutes/100 Pieces', 'Minutes/1000 Pieces', 'Pieces/Hour', 'Pieces/Minute', 'Seconds/Piece', 'Total Hours', 'Total Minutes');--> statement-breakpoint
CREATE TYPE "public"."fulfillmentType" AS ENUM('Inventory', 'Job');--> statement-breakpoint
CREATE TYPE "public"."gaugeCalibrationStatus" AS ENUM('Pending', 'In-Calibration', 'Out-of-Calibration');--> statement-breakpoint
CREATE TYPE "public"."gaugeRole" AS ENUM('Master', 'Standard');--> statement-breakpoint
CREATE TYPE "public"."gaugeStatus" AS ENUM('Active', 'Inactive');--> statement-breakpoint
CREATE TYPE "public"."glAccountClass" AS ENUM('Asset', 'Liability', 'Equity', 'Revenue', 'Expense');--> statement-breakpoint
CREATE TYPE "public"."glConsolidatedRate" AS ENUM('Average', 'Current', 'Historical');--> statement-breakpoint
CREATE TYPE "public"."glIncomeBalance" AS ENUM('Balance Sheet', 'Income Statement');--> statement-breakpoint
CREATE TYPE "public"."inboundInspectionSampleStatus" AS ENUM('Pending', 'Passed', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."inboundInspectionStatus" AS ENUM('Pending', 'In Progress', 'Passed', 'Failed', 'Partial');--> statement-breakpoint
CREATE TYPE "public"."incoterm" AS ENUM('EXW', 'FCA', 'FAS', 'FOB', 'CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP');--> statement-breakpoint
CREATE TYPE "public"."inspectionLevel" AS ENUM('I', 'II', 'III', 'S1', 'S2', 'S3', 'S4');--> statement-breakpoint
CREATE TYPE "public"."inspectionSeverity" AS ENUM('Normal', 'Tightened', 'Reduced');--> statement-breakpoint
CREATE TYPE "public"."inspectionStatus" AS ENUM('Pass', 'Fail');--> statement-breakpoint
CREATE TYPE "public"."itemCostingMethod" AS ENUM('Standard', 'Average', 'LIFO', 'FIFO');--> statement-breakpoint
CREATE TYPE "public"."itemLedgerDocumentType" AS ENUM('Sales Shipment', 'Sales Invoice', 'Sales Return Receipt', 'Sales Credit Memo', 'Purchase Receipt', 'Purchase Invoice', 'Purchase Return Shipment', 'Purchase Credit Memo', 'Transfer Shipment', 'Transfer Receipt', 'Service Shipment', 'Service Invoice', 'Service Credit Memo', 'Posted Assembly', 'Inventory Receipt', 'Inventory Shipment', 'Direct Transfer', 'Job Consumption', 'Job Receipt', 'Batch Split', 'Purchase Order', 'Maintenance Consumption', 'Non-Conformance');--> statement-breakpoint
CREATE TYPE "public"."itemLedgerType" AS ENUM('Purchase', 'Sale', 'Positive Adjmt.', 'Negative Adjmt.', 'Transfer', 'Consumption', 'Output', 'Assembly Consumption', 'Assembly Output');--> statement-breakpoint
CREATE TYPE "public"."itemReorderingPolicy" AS ENUM('Manual Reorder', 'Demand-Based Reorder', 'Fixed Reorder Quantity', 'Maximum Quantity');--> statement-breakpoint
CREATE TYPE "public"."itemReplenishmentSystem" AS ENUM('Buy', 'Make', 'Buy and Make');--> statement-breakpoint
CREATE TYPE "public"."itemTrackingSourceDocument" AS ENUM('Receipt', 'Job Production', 'Job Material', 'Shipment');--> statement-breakpoint
CREATE TYPE "public"."itemTrackingType" AS ENUM('Inventory', 'Non-Inventory', 'Serial', 'Batch');--> statement-breakpoint
CREATE TYPE "public"."itemType" AS ENUM('Part', 'Material', 'Tool', 'Service', 'Consumable', 'Fixture');--> statement-breakpoint
CREATE TYPE "public"."jobOperationStatus" AS ENUM('Canceled', 'Done', 'In Progress', 'Paused', 'Ready', 'Todo', 'Waiting');--> statement-breakpoint
CREATE TYPE "public"."jobStatus" AS ENUM('Draft', 'Ready', 'In Progress', 'Paused', 'Completed', 'Cancelled', 'Overdue', 'Due Today', 'Planned', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."journalEntrySourceType" AS ENUM('Manual', 'Purchase Receipt', 'Purchase Invoice', 'Purchase Return', 'Sales Invoice', 'Sales Shipment', 'Sales Return', 'Transfer Receipt', 'Inventory Adjustment', 'Production Order', 'Job Consumption', 'Job Receipt', 'Production Event', 'Job Close');--> statement-breakpoint
CREATE TYPE "public"."journalEntryStatus" AS ENUM('Draft', 'Posted', 'Reversed');--> statement-breakpoint
CREATE TYPE "public"."journalLineDocumentType" AS ENUM('Receipt', 'Invoice', 'Credit Memo', 'Blanket Order', 'Return Order', 'Sales Shipment', 'Transfer Shipment', 'Purchase Receipt', 'Purchase Invoice', 'Job Consumption', 'Job Receipt', 'Batch Split', 'Maintenance Consumption', 'Production Event', 'Job Close');--> statement-breakpoint
CREATE TYPE "public"."kanbanOutput" AS ENUM('label', 'qrcode', 'url');--> statement-breakpoint
CREATE TYPE "public"."maintenanceDispatchPriority" AS ENUM('Low', 'Medium', 'High', 'Critical');--> statement-breakpoint
CREATE TYPE "public"."maintenanceDispatchStatus" AS ENUM('Open', 'Assigned', 'In Progress', 'Completed', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."maintenanceFailureModeType" AS ENUM('Maintenance', 'Quality', 'Operations', 'Other');--> statement-breakpoint
CREATE TYPE "public"."maintenanceFrequency" AS ENUM('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual');--> statement-breakpoint
CREATE TYPE "public"."maintenanceSeverity" AS ENUM('Preventive', 'Operator Performed', 'Support Required', 'OEM Required');--> statement-breakpoint
CREATE TYPE "public"."maintenanceSource" AS ENUM('Scheduled', 'Reactive', 'Non-Conformance');--> statement-breakpoint
CREATE TYPE "public"."makeMethodStatus" AS ENUM('Draft', 'Active', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."methodOperationOrder" AS ENUM('After Previous', 'With Previous');--> statement-breakpoint
CREATE TYPE "public"."methodType" AS ENUM('Purchase to Order', 'Pull from Inventory', 'Make to Order');--> statement-breakpoint
CREATE TYPE "public"."module" AS ENUM('Accounting', 'Documents', 'Invoicing', 'Inventory', 'Items', 'Messaging', 'Parts', 'People', 'Production', 'Purchasing', 'Resources', 'Sales', 'Settings', 'Users', 'Quality');--> statement-breakpoint
CREATE TYPE "public"."month" AS ENUM('January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December');--> statement-breakpoint
CREATE TYPE "public"."nonConformanceApproval" AS ENUM('MRB');--> statement-breakpoint
CREATE TYPE "public"."nonConformancePriority" AS ENUM('Low', 'Medium', 'High', 'Critical');--> statement-breakpoint
CREATE TYPE "public"."nonConformanceSource" AS ENUM('Internal', 'External');--> statement-breakpoint
CREATE TYPE "public"."nonConformanceStatus" AS ENUM('Registered', 'In Progress', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."nonConformanceSystemActionType" AS ENUM('Containment', 'Corrective', 'Preventive', 'Verification', 'Communication');--> statement-breakpoint
CREATE TYPE "public"."nonConformanceTaskStatus" AS ENUM('Pending', 'In Progress', 'Completed', 'Skipped');--> statement-breakpoint
CREATE TYPE "public"."oeeImpact" AS ENUM('Down', 'Planned', 'Impact', 'No Impact');--> statement-breakpoint
CREATE TYPE "public"."operationType" AS ENUM('Inside', 'Outside');--> statement-breakpoint
CREATE TYPE "public"."payableLineType" AS ENUM('Comment', 'G/L Account', 'Fixed Asset', 'Part', 'Material', 'Tool', 'Service', 'Consumable', 'Fixture');--> statement-breakpoint
CREATE TYPE "public"."paymentTermCalculationMethod" AS ENUM('Net', 'End of Month', 'Day of Month');--> statement-breakpoint
CREATE TYPE "public"."periodType" AS ENUM('Week', 'Day', 'Month');--> statement-breakpoint
CREATE TYPE "public"."pricingRuleAmountType" AS ENUM('Percentage', 'Fixed');--> statement-breakpoint
CREATE TYPE "public"."pricingRuleType" AS ENUM('Discount', 'Markup');--> statement-breakpoint
CREATE TYPE "public"."procedureStatus" AS ENUM('Draft', 'Active', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."procedureStepType" AS ENUM('Value', 'Measurement', 'Checkbox', 'Timestamp', 'Person', 'List', 'File', 'Task', 'Inspection');--> statement-breakpoint
CREATE TYPE "public"."processType" AS ENUM('Inside', 'Outside', 'Inside and Outside');--> statement-breakpoint
CREATE TYPE "public"."productionEventType" AS ENUM('Setup', 'Labor', 'Machine');--> statement-breakpoint
CREATE TYPE "public"."productionQuantityType" AS ENUM('Rework', 'Scrap', 'Production');--> statement-breakpoint
CREATE TYPE "public"."purchaseInvoiceStatus" AS ENUM('Draft', 'Pending', 'Open', 'Return', 'Debit Note Issued', 'Paid', 'Partially Paid', 'Overdue', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."purchaseOrderLineType" AS ENUM('Comment', 'G/L Account', 'Fixed Asset', 'Part', 'Material', 'Tool', 'Service', 'Consumable', 'Fixture');--> statement-breakpoint
CREATE TYPE "public"."purchaseOrderStatus" AS ENUM('Draft', 'To Review', 'Rejected', 'To Receive', 'To Receive and Invoice', 'To Invoice', 'Completed', 'Closed', 'Planned', 'Needs Approval');--> statement-breakpoint
CREATE TYPE "public"."purchaseOrderTransactionType" AS ENUM('Edit', 'Favorite', 'Unfavorite', 'Approved', 'Reject', 'Request Approval');--> statement-breakpoint
CREATE TYPE "public"."purchaseOrderType" AS ENUM('Purchase', 'Return', 'Outside Processing');--> statement-breakpoint
CREATE TYPE "public"."purchasePriceUpdateTiming" AS ENUM('Purchase Invoice Post', 'Purchase Order Finalize');--> statement-breakpoint
CREATE TYPE "public"."purchasingRfqStatus" AS ENUM('Draft', 'Requested', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."qualityDocumentStatus" AS ENUM('Draft', 'Active', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."quoteLineStatus" AS ENUM('Not Started', 'In Progress', 'Complete', 'No Quote');--> statement-breakpoint
CREATE TYPE "public"."quoteStatus" AS ENUM('Draft', 'Sent', 'Ordered', 'Partial', 'Lost', 'Cancelled', 'Expired');--> statement-breakpoint
CREATE TYPE "public"."receiptSourceDocument" AS ENUM('Sales Order', 'Sales Invoice', 'Sales Return Order', 'Purchase Order', 'Purchase Invoice', 'Purchase Return Order', 'Inbound Transfer', 'Outbound Transfer', 'Manufacturing Consumption', 'Manufacturing Output');--> statement-breakpoint
CREATE TYPE "public"."receiptStatus" AS ENUM('Draft', 'Pending', 'Posted', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."riskRegisterType" AS ENUM('Risk', 'Opportunity');--> statement-breakpoint
CREATE TYPE "public"."riskSource" AS ENUM('Customer', 'General', 'Item', 'Job', 'Quote Line', 'Supplier', 'Work Center');--> statement-breakpoint
CREATE TYPE "public"."riskStatus" AS ENUM('Open', 'In Review', 'Mitigating', 'Closed', 'Accepted');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('customer', 'employee', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."salesInvoiceLineType" AS ENUM('Comment', 'Part', 'Material', 'Tool', 'Service', 'Consumable', 'Fixture', 'Fixed Asset');--> statement-breakpoint
CREATE TYPE "public"."salesInvoiceStatus" AS ENUM('Draft', 'Pending', 'Submitted', 'Return', 'Credit Note Issued', 'Paid', 'Partially Paid', 'Overdue', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."salesOrderLineStatus" AS ENUM('Ordered', 'In Progress', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."salesOrderLineType" AS ENUM('Comment', 'Part', 'Material', 'Tool', 'Service', 'Consumable', 'Fixture', 'Fixed Asset');--> statement-breakpoint
CREATE TYPE "public"."salesOrderStatus" AS ENUM('Draft', 'Needs Approval', 'Confirmed', 'In Progress', 'Completed', 'Invoiced', 'Cancelled', 'Closed', 'To Ship and Invoice', 'To Ship', 'To Invoice');--> statement-breakpoint
CREATE TYPE "public"."salesOrderTransactionType" AS ENUM('Edit', 'Favorite', 'Unfavorite', 'Approved', 'Reject', 'Request Approval');--> statement-breakpoint
CREATE TYPE "public"."salesRfqStatus" AS ENUM('Draft', 'Ready for Quote', 'Closed', 'Quoted');--> statement-breakpoint
CREATE TYPE "public"."samplingPlanType" AS ENUM('All', 'First', 'Percentage', 'AQL');--> statement-breakpoint
CREATE TYPE "public"."samplingStandard" AS ENUM('ANSI_Z1_4', 'ISO_2859_1');--> statement-breakpoint
CREATE TYPE "public"."serviceType" AS ENUM('Internal', 'External');--> statement-breakpoint
CREATE TYPE "public"."shelfLifeMode" AS ENUM('Fixed Duration', 'Calculated', 'Set on Receipt');--> statement-breakpoint
CREATE TYPE "public"."shelfLifeTriggerTiming" AS ENUM('Before', 'After');--> statement-breakpoint
CREATE TYPE "public"."shipmentSourceDocument" AS ENUM('Sales Order', 'Sales Invoice', 'Sales Return Order', 'Purchase Order', 'Purchase Invoice', 'Purchase Return Order', 'Inbound Transfer', 'Outbound Transfer');--> statement-breakpoint
CREATE TYPE "public"."shipmentStatus" AS ENUM('Draft', 'Pending', 'Posted', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."shippingCarrier" AS ENUM('UPS', 'FedEx', 'USPS', 'DHL', 'Other');--> statement-breakpoint
CREATE TYPE "public"."sourcingType" AS ENUM('Specified', 'Drop Ship', 'Ship from Inventory');--> statement-breakpoint
CREATE TYPE "public"."stockTransferStatus" AS ENUM('Draft', 'Released', 'In Progress', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."supplierLedgerDocumentType" AS ENUM('Payment', 'Invoice', 'Credit Memo', 'Finance Charge Memo', 'Reminder', 'Refund');--> statement-breakpoint
CREATE TYPE "public"."supplierPartPriceSourceType" AS ENUM('Quote', 'Purchase Order', 'Manual Entry');--> statement-breakpoint
CREATE TYPE "public"."supplierQuoteStatus" AS ENUM('Active', 'Expired', 'Draft', 'Declined', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."supplierStatusType" AS ENUM('Active', 'Inactive', 'Pending', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."supplySourceType" AS ENUM('Purchase Order', 'Production Order');--> statement-breakpoint
CREATE TYPE "public"."tableViewType" AS ENUM('Public', 'Private');--> statement-breakpoint
CREATE TYPE "public"."taxExemptionReason" AS ENUM('Resale', 'Government', 'Nonprofit', 'Agriculture', 'Industrial', 'Export', 'Medical', 'Educational', 'Religious', 'Other');--> statement-breakpoint
CREATE TYPE "public"."trackedEntityStatus" AS ENUM('Available', 'Reserved', 'On Hold', 'Consumed', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."trackingSource" AS ENUM('Purchased', 'Manufactured');--> statement-breakpoint
CREATE TYPE "public"."trainingFrequency" AS ENUM('Once', 'Quarterly', 'Annual');--> statement-breakpoint
CREATE TYPE "public"."trainingQuestionType" AS ENUM('MultipleChoice', 'TrueFalse', 'MultipleAnswers', 'MatchingPairs', 'Numerical');--> statement-breakpoint
CREATE TYPE "public"."trainingStatus" AS ENUM('Draft', 'Active', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."trainingType" AS ENUM('Mandatory', 'Optional');--> statement-breakpoint
CREATE TYPE "public"."transactionSurface" AS ENUM('receipt', 'shipment', 'stockTransfer', 'warehouseTransfer', 'inventoryAdjustment');--> statement-breakpoint
CREATE TYPE "public"."warehouseTransferStatus" AS ENUM('Draft', 'To Ship and Receive', 'To Ship', 'To Receive', 'Completed', 'Cancelled');--> statement-breakpoint
CREATE TABLE "ability" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"curve" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shadowWeeks" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "ability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accountDefault" (
	"accumulatedDepreciationAccount" text NOT NULL,
	"accumulatedDepreciationOnDisposalAccount" text NOT NULL,
	"assetAquisitionCostAccount" text NOT NULL,
	"assetAquisitionCostOnDisposalAccount" text NOT NULL,
	"assetDepreciationExpenseAccount" text NOT NULL,
	"assetGainsAndLossesAccount" text NOT NULL,
	"bankCashAccount" text NOT NULL,
	"bankForeignCurrencyAccount" text NOT NULL,
	"bankLocalCurrencyAccount" text NOT NULL,
	"companyId" text NOT NULL,
	"costOfGoodsSoldAccount" text NOT NULL,
	"currencyTranslationAccount" text NOT NULL,
	"customerPaymentDiscountAccount" text NOT NULL,
	"goodsReceivedNotInvoicedAccount" text NOT NULL,
	"indirectCostAccount" text NOT NULL,
	"interestAccount" text NOT NULL,
	"inventoryAccount" text NOT NULL,
	"inventoryAdjustmentVarianceAccount" text NOT NULL,
	"inventoryShippedNotInvoicedAccount" text NOT NULL,
	"laborAbsorptionAccount" text,
	"laborAndMachineVarianceAccount" text NOT NULL,
	"lotSizeVarianceAccount" text NOT NULL,
	"maintenanceAccount" text NOT NULL,
	"materialVarianceAccount" text NOT NULL,
	"overheadVarianceAccount" text NOT NULL,
	"payablesAccount" text NOT NULL,
	"prepaymentAccount" text NOT NULL,
	"purchaseTaxPayableAccount" text NOT NULL,
	"purchaseVarianceAccount" text NOT NULL,
	"receivablesAccount" text NOT NULL,
	"retainedEarningsAccount" text NOT NULL,
	"reverseChargeSalesTaxPayableAccount" text NOT NULL,
	"roundingAccount" text NOT NULL,
	"salesAccount" text NOT NULL,
	"salesDiscountAccount" text NOT NULL,
	"salesTaxPayableAccount" text NOT NULL,
	"serviceChargeAccount" text NOT NULL,
	"subcontractingVarianceAccount" text NOT NULL,
	"supplierPaymentDiscountAccount" text NOT NULL,
	"updatedBy" text,
	"workInProgressAccount" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accountDefault" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account" (
	"accountType" "accountType",
	"active" boolean NOT NULL,
	"class" "glAccountClass",
	"companyGroupId" text NOT NULL,
	"consolidatedRate" "glConsolidatedRate" NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"incomeBalance" "glIncomeBalance" NOT NULL,
	"isGroup" boolean NOT NULL,
	"isSystem" boolean NOT NULL,
	"name" text NOT NULL,
	"number" text,
	"parentId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "accountingPeriod" (
	"closedAt" timestamp with time zone,
	"closedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"endDate" date NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"startDate" date NOT NULL,
	"status" "accountingPeriodStatus" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "accountingPeriod" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "address" (
	"addressLine1" text,
	"addressLine2" text,
	"city" text,
	"companyId" text NOT NULL,
	"countryCode" text,
	"fax" text,
	"id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"postalCode" text,
	"stateProvince" text
);
--> statement-breakpoint
ALTER TABLE "address" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "apiKeyRateLimit" (
	"apiKeyId" text NOT NULL,
	"requestCount" numeric NOT NULL,
	"windowStart" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apiKey" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"expiresAt" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"keyHash" text NOT NULL,
	"keyPreview" text,
	"lastUsedAt" timestamp with time zone,
	"name" text NOT NULL,
	"rateLimit" numeric NOT NULL,
	"rateLimitWindow" text NOT NULL,
	"scopes" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apiKey" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approvalRequest" (
	"amount" numeric,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"decisionAt" timestamp with time zone,
	"decisionBy" text,
	"decisionNotes" text,
	"documentId" text NOT NULL,
	"documentType" "approvalDocumentType" NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"requestedAt" timestamp with time zone NOT NULL,
	"requestedBy" text NOT NULL,
	"status" "approvalStatus" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "approvalRequest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approvalRule" (
	"approverGroupIds" text[],
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"defaultApproverId" text,
	"documentType" "approvalDocumentType" NOT NULL,
	"enabled" boolean NOT NULL,
	"escalationDays" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"lowerBoundAmount" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "approvalRule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attributeDataType" (
	"id" numeric PRIMARY KEY NOT NULL,
	"isBoolean" boolean NOT NULL,
	"isCustomer" boolean NOT NULL,
	"isDate" boolean NOT NULL,
	"isFile" boolean NOT NULL,
	"isList" boolean NOT NULL,
	"isNumeric" boolean NOT NULL,
	"isSupplier" boolean NOT NULL,
	"isText" boolean NOT NULL,
	"isUser" boolean NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditLogArchive" (
	"archivePath" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"endDate" date NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"rowCount" numeric NOT NULL,
	"sizeBytes" numeric,
	"startDate" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditLogArchive" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "batchProperty" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dataType" "configurationParameterDataType" NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"label" text NOT NULL,
	"listOptions" text[],
	"sortOrder" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "batchProperty" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "challengeAttempt" (
	"courseId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"id" numeric PRIMARY KEY NOT NULL,
	"passed" boolean NOT NULL,
	"topicId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companyAccountsPayableBillingAddress" (
	"addressLine1" text,
	"addressLine2" text,
	"city" text,
	"countryCode" text,
	"email" text,
	"fax" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"phone" text,
	"postalCode" text,
	"state" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "companyAccountsReceivableBillingAddress" (
	"addressLine1" text,
	"addressLine2" text,
	"city" text,
	"countryCode" text,
	"email" text,
	"fax" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"phone" text,
	"postalCode" text,
	"state" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "companyGroup" (
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ownerId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "companyIntegration" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"metadata" jsonb NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "companyIntegration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "companyPlan" (
	"aiTokensLimit" numeric NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"planId" text NOT NULL,
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"stripeSubscriptionStatus" text NOT NULL,
	"subscriptionStartDate" date NOT NULL,
	"tasksLimit" numeric NOT NULL,
	"trialPeriodEndsAt" timestamp with time zone,
	"updatedAt" timestamp with time zone NOT NULL,
	"usersLimit" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companySettings" (
	"accountingEnabled" boolean NOT NULL,
	"accountsPayableAddress" boolean,
	"accountsPayableEmail" text,
	"accountsReceivableAddress" boolean,
	"accountsReceivableEmail" text,
	"consoleEnabled" boolean NOT NULL,
	"defaultCustomerCc" text[],
	"defaultSupplierCc" text[],
	"digitalQuoteEnabled" boolean NOT NULL,
	"digitalQuoteIncludesPurchaseOrders" boolean NOT NULL,
	"digitalQuoteNotificationGroup" text[] NOT NULL,
	"enforceInspectionFourEyes" boolean NOT NULL,
	"gaugeCalibrationExpiredNotificationGroup" text[] NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"includeThumbnailsOnPurchasingPdfs" boolean NOT NULL,
	"includeThumbnailsOnSalesPdfs" boolean NOT NULL,
	"inventoryJobCompletedNotificationGroup" text[] NOT NULL,
	"inventoryShelfLife" jsonb NOT NULL,
	"jobTravelerIncludeWorkInstructions" boolean NOT NULL,
	"kanbanOutput" "kanbanOutput" NOT NULL,
	"maintenanceAdvanceDays" numeric NOT NULL,
	"maintenanceDispatchNotificationGroup" text[],
	"maintenanceGenerateInAdvance" boolean NOT NULL,
	"materialGeneratedIds" boolean NOT NULL,
	"operationsDispatchNotificationGroup" text[],
	"otherDispatchNotificationGroup" text[],
	"productLabelSize" text,
	"purchasePriceUpdateTiming" "purchasePriceUpdateTiming" NOT NULL,
	"qualityDispatchNotificationGroup" text[],
	"qualityIssueTarget" numeric NOT NULL,
	"quoteLineCategoryMarkups" jsonb,
	"rfqReadyNotificationGroup" text[] NOT NULL,
	"salesJobCompletedNotificationGroup" text[] NOT NULL,
	"samplingStandard" "samplingStandard" NOT NULL,
	"shelfLabelSize" text,
	"supplierQuoteNotificationGroup" text[] NOT NULL,
	"timeCardEnabled" boolean NOT NULL,
	"updateLeadTimesOnReceipt" boolean NOT NULL,
	"useMetric" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"active" boolean NOT NULL,
	"addressLine1" text,
	"addressLine2" text,
	"auditLogEnabled" boolean NOT NULL,
	"baseCurrencyCode" text NOT NULL,
	"city" text,
	"companyGroupId" text,
	"countryCode" text,
	"createdAt" timestamp with time zone NOT NULL,
	"email" text,
	"eori" text,
	"fax" text,
	"id" text PRIMARY KEY NOT NULL,
	"isEliminationEntity" boolean NOT NULL,
	"logoDark" text,
	"logoDarkIcon" text,
	"logoLight" text,
	"logoLightIcon" text,
	"logoWatermark" text,
	"name" text NOT NULL,
	"parentCompanyId" text,
	"phone" text,
	"postalCode" text,
	"slackChannel" text,
	"stateProvince" text,
	"suggestionNotificationGroup" text[] NOT NULL,
	"taxId" text,
	"updatedBy" text,
	"vatNumber" text,
	"website" text
);
--> statement-breakpoint
CREATE TABLE "companyUsage" (
	"aiTokens" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nextResetDatetime" text NOT NULL,
	"tasks" numeric NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"users" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companyUsage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "config" (
	"apiUrl" text NOT NULL,
	"id" boolean PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configurationParameterGroup" (
	"companyId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"isUngrouped" boolean NOT NULL,
	"itemId" text NOT NULL,
	"name" text NOT NULL,
	"sortOrder" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configurationParameterGroup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "configurationParameter" (
	"companyId" text NOT NULL,
	"configurationParameterGroupId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dataType" "configurationParameterDataType" NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"listOptions" text[],
	"materialFormFilterId" text,
	"sortOrder" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "configurationParameter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "configurationRule" (
	"code" text NOT NULL,
	"companyId" text NOT NULL,
	"field" text NOT NULL,
	"itemId" text NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "configurationRule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consumable" (
	"approved" boolean NOT NULL,
	"approvedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "consumable" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact" (
	"companyId" text NOT NULL,
	"email" text,
	"fax" text,
	"firstName" text,
	"fullName" text,
	"homePhone" text,
	"id" text PRIMARY KEY NOT NULL,
	"isCustomer" boolean NOT NULL,
	"lastName" text,
	"mobilePhone" text,
	"notes" text,
	"title" text,
	"workPhone" text
);
--> statement-breakpoint
ALTER TABLE "contact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contractorAbility" (
	"abilityId" text NOT NULL,
	"contractorId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"hoursPerWeek" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "contractor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "costCenter" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ownerId" text,
	"parentCostCenterId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "costCenter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "costLedger" (
	"adjustment" boolean NOT NULL,
	"companyId" text NOT NULL,
	"cost" numeric NOT NULL,
	"costLedgerType" "costLedgerType" NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"documentId" text,
	"documentType" jsonb,
	"entryNumber" numeric NOT NULL,
	"externalDocumentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text,
	"itemLedgerType" "itemLedgerType" NOT NULL,
	"nominalCost" numeric NOT NULL,
	"postingDate" date NOT NULL,
	"quantity" numeric NOT NULL,
	"remainingQuantity" numeric NOT NULL,
	"supplierId" text
);
--> statement-breakpoint
ALTER TABLE "costLedger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "country" (
	"alpha2" text PRIMARY KEY NOT NULL,
	"alpha3" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencyCode" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency" (
	"active" boolean NOT NULL,
	"code" text NOT NULL,
	"companyGroupId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"decimalPlaces" numeric NOT NULL,
	"exchangeRate" numeric NOT NULL,
	"historicalExchangeRate" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "customField" (
	"active" boolean,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dataTypeId" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"listOptions" text[],
	"name" text NOT NULL,
	"required" boolean NOT NULL,
	"sortOrder" numeric NOT NULL,
	"table" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "customField" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customFieldTable" (
	"module" "module" NOT NULL,
	"name" text NOT NULL,
	"table" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customerAccount" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"customerId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customerAccount" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerContact" (
	"contactId" text NOT NULL,
	"customerId" text NOT NULL,
	"customerLocationId" text,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "customerItemPriceOverrideBreak" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerItemPriceOverrideId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"overridePrice" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "customerItemPriceOverrideBreak" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerItemPriceOverride" (
	"active" boolean NOT NULL,
	"applyRulesOnTop" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerId" text,
	"customerTypeId" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"notes" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"validFrom" text,
	"validTo" text
);
--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerLocation" (
	"addressId" text NOT NULL,
	"customerId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[]
);
--> statement-breakpoint
CREATE TABLE "customerPartToItem" (
	"companyId" text NOT NULL,
	"customerId" text NOT NULL,
	"customerPartId" text NOT NULL,
	"customerPartRevision" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customerPartToItem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerPayment" (
	"companyId" text NOT NULL,
	"customerId" text NOT NULL,
	"invoiceCustomerContactId" text,
	"invoiceCustomerId" text,
	"invoiceCustomerLocationId" text,
	"paymentTermId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "customerPayment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerShipping" (
	"companyId" text NOT NULL,
	"customerId" text NOT NULL,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"shippingCustomerContactId" text,
	"shippingCustomerId" text,
	"shippingCustomerLocationId" text,
	"shippingMethodId" text,
	"shippingTermId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "customerShipping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerStatus" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "customerStatus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer" (
	"accountManagerId" text,
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text,
	"currencyCode" text,
	"customerStatusId" text,
	"customerTypeId" text,
	"customFields" jsonb,
	"defaultCc" text[],
	"embedding" vector NOT NULL,
	"fax" text,
	"id" text PRIMARY KEY NOT NULL,
	"intercompanyCompanyId" text,
	"logo" text,
	"name" text NOT NULL,
	"phone" text,
	"salesContactId" text,
	"tags" text[],
	"taxPercent" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"website" text
);
--> statement-breakpoint
ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerTax" (
	"companyId" text NOT NULL,
	"customerId" text NOT NULL,
	"eori" text,
	"taxExempt" boolean NOT NULL,
	"taxExemptionCertificateNumber" text,
	"taxExemptionCertificatePath" text,
	"taxExemptionReason" jsonb,
	"taxId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"vatNumber" text
);
--> statement-breakpoint
ALTER TABLE "customerTax" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customerType" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"protected" boolean NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "customerType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "demandActual" (
	"actualQuantity" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"notes" text,
	"periodId" text NOT NULL,
	"sourceType" "demandSourceType" NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demandActual" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "demandForecast" (
	"companyId" text NOT NULL,
	"confidence" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"forecastMethod" text,
	"forecastQuantity" numeric NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"notes" text,
	"periodId" text NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demandForecast" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "demandProjection" (
	"companyId" text NOT NULL,
	"confidence" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"forecastMethod" text,
	"forecastQuantity" numeric NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"notes" text,
	"periodId" text NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demandProjection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "department" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parentDepartmentId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dimension" (
	"active" boolean NOT NULL,
	"companyGroupId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"entityType" "dimensionEntityType" NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"required" boolean NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "dimensionValue" (
	"companyGroupId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dimensionId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "documentFavorite" (
	"documentId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentLabel" (
	"documentId" text NOT NULL,
	"label" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"extension" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"readGroups" text[],
	"size" numeric NOT NULL,
	"sourceDocument" jsonb,
	"sourceDocumentId" text,
	"type" "documentType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"writeGroups" text[]
);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documentTransaction" (
	"createdAt" timestamp with time zone NOT NULL,
	"documentId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"type" "documentTransactionType" NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employeeAbility" (
	"abilityId" text NOT NULL,
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"employeeId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lastTrainingDate" date,
	"trainingCompleted" boolean,
	"trainingDays" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employeeAbility" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employeeJob" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"departmentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text,
	"managerId" text,
	"shiftId" text,
	"startDate" date,
	"tags" text[],
	"title" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "employeeJob" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employeeShift" (
	"employeeId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"shiftId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"employeeTypeId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"pin" text
);
--> statement-breakpoint
ALTER TABLE "employee" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employeeTypePermission" (
	"create" text[] NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"delete" text[] NOT NULL,
	"employeeTypeId" text NOT NULL,
	"module" "module" NOT NULL,
	"update" text[] NOT NULL,
	"updatedAt" timestamp with time zone,
	"view" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employeeType" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"protected" boolean NOT NULL,
	"systemType" jsonb,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "employeeType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "eventSystemSubscription" (
	"active" boolean,
	"companyId" text NOT NULL,
	"config" jsonb NOT NULL,
	"createdAt" timestamp with time zone,
	"filter" jsonb,
	"handlerType" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"operations" text[] NOT NULL,
	"table" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventSystemSubscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exchangeRateHistory" (
	"companyGroupId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text NOT NULL,
	"effectiveDate" date NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"rate" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "externalIntegrationMapping" (
	"allowDuplicateExternalId" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text,
	"entityId" text NOT NULL,
	"entityType" text NOT NULL,
	"externalId" text,
	"id" text PRIMARY KEY NOT NULL,
	"integration" text NOT NULL,
	"lastSyncedAt" timestamp with time zone,
	"metadata" jsonb,
	"remoteUpdatedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "externalIntegrationMapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "externalLink" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"customerId" text,
	"documentId" text NOT NULL,
	"documentType" "externalLinkDocumentType" NOT NULL,
	"expiresAt" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"supplierId" text
);
--> statement-breakpoint
ALTER TABLE "externalLink" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"attachmentPath" text,
	"feedback" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"location" text NOT NULL,
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "fiscalYearSettings" (
	"companyId" text NOT NULL,
	"startMonth" "month" NOT NULL,
	"taxStartMonth" "month" NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscalYearSettings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fixture" (
	"approved" boolean NOT NULL,
	"approvedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerId" text,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "fixture" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fulfillment" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text,
	"quantity" numeric NOT NULL,
	"salesOrderLineId" text NOT NULL,
	"type" "fulfillmentType" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fulfillment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gaugeCalibrationRecord" (
	"approvedBy" text,
	"calibrationAttempts" jsonb,
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb NOT NULL,
	"dateCalibrated" text NOT NULL,
	"gaugeId" text NOT NULL,
	"humidity" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"inspectionStatus" "inspectionStatus" NOT NULL,
	"measurementStandard" text,
	"notes" jsonb NOT NULL,
	"requiresAction" boolean NOT NULL,
	"requiresAdjustment" boolean NOT NULL,
	"requiresRepair" boolean NOT NULL,
	"supplierId" text,
	"temperature" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gauge" (
	"calibrationIntervalInMonths" numeric NOT NULL,
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb NOT NULL,
	"dateAcquired" text,
	"description" text,
	"gaugeCalibrationStatus" "gaugeCalibrationStatus" NOT NULL,
	"gaugeId" text NOT NULL,
	"gaugeRole" "gaugeRole" NOT NULL,
	"gaugeStatus" "gaugeStatus" NOT NULL,
	"gaugeTypeId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lastCalibrationDate" date,
	"lastCalibrationStatus" "gaugeCalibrationStatus" NOT NULL,
	"locationId" text,
	"modelNumber" text,
	"nextCalibrationDate" date,
	"serialNumber" text,
	"storageUnitId" text,
	"supplierId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "gauge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gaugeType" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "gaugeType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "group" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"isCustomerOrgGroup" boolean NOT NULL,
	"isCustomerTypeGroup" boolean NOT NULL,
	"isEmployeeTypeGroup" boolean NOT NULL,
	"isIdentityGroup" boolean NOT NULL,
	"isSupplierOrgGroup" boolean NOT NULL,
	"isSupplierTypeGroup" boolean NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "holiday" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"date" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"year" numeric
);
--> statement-breakpoint
ALTER TABLE "holiday" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inboundInspectionHistory" (
	"aql" numeric,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"defectsFound" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"inboundInspectionId" text NOT NULL,
	"inspectionLevel" "inspectionLevel",
	"itemId" text NOT NULL,
	"lotSize" numeric NOT NULL,
	"outcome" text NOT NULL,
	"sampleSize" numeric NOT NULL,
	"samplingStandard" "samplingStandard" NOT NULL,
	"severity" "inspectionSeverity" NOT NULL,
	"supplierId" text
);
--> statement-breakpoint
ALTER TABLE "inboundInspectionHistory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inboundInspectionSample" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"inboundInspectionId" text NOT NULL,
	"inspectedAt" timestamp with time zone,
	"inspectedBy" text,
	"notes" text,
	"status" "inboundInspectionSampleStatus" NOT NULL,
	"trackedEntityId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inboundInspection" (
	"acceptanceNumber" numeric NOT NULL,
	"aql" numeric,
	"codeLetter" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dispositionedAt" timestamp with time zone,
	"dispositionedBy" text,
	"id" text PRIMARY KEY NOT NULL,
	"inboundInspectionId" text NOT NULL,
	"inspectionLevel" "inspectionLevel",
	"itemId" text NOT NULL,
	"itemReadableId" text,
	"lotSize" numeric NOT NULL,
	"notes" text,
	"receiptId" text NOT NULL,
	"receiptLineId" text NOT NULL,
	"rejectionNumber" numeric NOT NULL,
	"sampleSize" numeric NOT NULL,
	"samplingPlanType" "samplingPlanType" NOT NULL,
	"samplingStandard" "samplingStandard" NOT NULL,
	"severity" "inspectionSeverity",
	"status" "inboundInspectionStatus" NOT NULL,
	"supplierId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "inboundInspection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "integration" (
	"id" text PRIMARY KEY NOT NULL,
	"jsonschema" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intercompanyTransaction" (
	"amount" numeric NOT NULL,
	"companyGroupId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"currencyCode" text NOT NULL,
	"description" text,
	"documentId" text,
	"documentType" jsonb,
	"eliminationJournalId" text,
	"id" text PRIMARY KEY NOT NULL,
	"sourceCompanyId" text NOT NULL,
	"sourceJournalLineId" text NOT NULL,
	"status" text NOT NULL,
	"targetCompanyId" text NOT NULL,
	"targetJournalLineId" text,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"acceptedAt" timestamp with time zone,
	"code" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"email" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"permissions" jsonb NOT NULL,
	"revokedAt" timestamp with time zone,
	"role" "role" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemCost" (
	"companyId" text NOT NULL,
	"costingMethod" "itemCostingMethod" NOT NULL,
	"costIsAdjusted" boolean NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"itemId" text NOT NULL,
	"itemPostingGroupId" text,
	"standardCost" numeric NOT NULL,
	"tags" text[],
	"unitCost" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemCost" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemLedger" (
	"comment" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"documentId" text,
	"documentLineId" text,
	"documentType" jsonb,
	"entryNumber" numeric NOT NULL,
	"entryType" "itemLedgerType" NOT NULL,
	"externalDocumentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text,
	"postingDate" date NOT NULL,
	"quantity" numeric NOT NULL,
	"storageUnitId" text,
	"trackedEntityId" text,
	"trackedEntityStatus" jsonb
);
--> statement-breakpoint
ALTER TABLE "itemLedger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemPlanning" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"critical" boolean NOT NULL,
	"customFields" jsonb,
	"demandAccumulationIncludesInventory" boolean NOT NULL,
	"demandAccumulationPeriod" numeric NOT NULL,
	"demandAccumulationSafetyStock" numeric NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"maximumInventoryQuantity" numeric NOT NULL,
	"maximumOrderQuantity" numeric NOT NULL,
	"minimumOrderQuantity" numeric NOT NULL,
	"orderMultiple" numeric NOT NULL,
	"reorderingPolicy" "itemReorderingPolicy" NOT NULL,
	"reorderPoint" numeric NOT NULL,
	"reorderQuantity" numeric NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemPlanning" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemPostingGroup" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemPostingGroup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemReplenishment" (
	"companyId" text NOT NULL,
	"conversionFactor" numeric NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"itemId" text NOT NULL,
	"leadTime" numeric NOT NULL,
	"lotSize" numeric,
	"manufacturingBlocked" boolean NOT NULL,
	"preferredSupplierId" text,
	"purchasingBlocked" boolean NOT NULL,
	"purchasingUnitOfMeasureCode" text,
	"requiresConfiguration" boolean NOT NULL,
	"scrapPercentage" numeric NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemReplenishment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemRuleAssignment" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"itemId" text NOT NULL,
	"ruleId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "itemRuleAssignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemRule" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"conditionAst" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"name" text NOT NULL,
	"severity" text NOT NULL,
	"surfaces" "transactionSurface"[] NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemRule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemSamplingPlan" (
	"aql" numeric,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"inspectionLevel" "inspectionLevel" NOT NULL,
	"itemId" text NOT NULL,
	"percentage" numeric,
	"sampleSize" numeric,
	"severity" "inspectionSeverity" NOT NULL,
	"type" "samplingPlanType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemSamplingPlan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemShelfLife" (
	"calculateFromBom" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"days" numeric,
	"itemId" text NOT NULL,
	"mode" "shelfLifeMode" NOT NULL,
	"triggerProcessId" text,
	"triggerTiming" "shelfLifeTriggerTiming" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemShelfLife" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item" (
	"active" boolean NOT NULL,
	"assignee" text,
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"defaultMethodType" "methodType",
	"description" text,
	"embedding" vector NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemTrackingType" "itemTrackingType" NOT NULL,
	"modelUploadId" text,
	"name" text NOT NULL,
	"notes" jsonb,
	"readableId" text NOT NULL,
	"readableIdWithRevision" text,
	"replenishmentSystem" "itemReplenishmentSystem" NOT NULL,
	"requiresInspection" boolean NOT NULL,
	"revision" text,
	"thumbnailPath" text,
	"trackingMethod" text,
	"type" "itemType" NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "itemUnitSalePrice" (
	"allowInvoiceDiscount" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text NOT NULL,
	"customFields" jsonb,
	"itemId" text NOT NULL,
	"priceIncludesTax" boolean NOT NULL,
	"salesBlocked" boolean NOT NULL,
	"salesUnitOfMeasureCode" text,
	"tags" text[],
	"unitSalePrice" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "itemUnitSalePrice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobFavorite" (
	"jobId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobMakeMethod" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"itemScrapPercentage" numeric NOT NULL,
	"jobId" text NOT NULL,
	"parentMaterialId" text,
	"quantityPerParent" numeric NOT NULL,
	"requiresBatchTracking" boolean NOT NULL,
	"requiresSerialTracking" boolean NOT NULL,
	"trackedEntityId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"version" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobMaterial" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"defaultStorageUnit" boolean,
	"description" text NOT NULL,
	"estimatedQuantity" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"itemScrapPercentage" numeric NOT NULL,
	"itemType" text NOT NULL,
	"jobId" text NOT NULL,
	"jobMakeMethodId" text NOT NULL,
	"jobOperationId" text,
	"kit" boolean NOT NULL,
	"methodType" "methodType" NOT NULL,
	"order" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"quantityIssued" numeric,
	"quantityToIssue" numeric,
	"requiresBatchTracking" boolean NOT NULL,
	"requiresSerialTracking" boolean NOT NULL,
	"scrapQuantity" numeric NOT NULL,
	"storageUnitId" text,
	"unitCost" numeric NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "jobMaterial" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperationDependency" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"dependsOnId" text NOT NULL,
	"jobId" text NOT NULL,
	"operationId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobOperationDependency" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperationNote" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"jobOperationId" text NOT NULL,
	"note" text NOT NULL,
	"productionQuantityId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "jobOperationNote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperationParameter" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"operationId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobOperationParameter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperationStepRecord" (
	"booleanValue" boolean,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"index" numeric NOT NULL,
	"jobOperationStepId" text NOT NULL,
	"numericValue" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"userValue" text,
	"value" text
);
--> statement-breakpoint
ALTER TABLE "jobOperationStepRecord" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperationStep" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" jsonb,
	"fileTypes" text[],
	"id" text PRIMARY KEY NOT NULL,
	"listValues" text[],
	"maxValue" numeric,
	"minValue" numeric,
	"name" text NOT NULL,
	"nonConformanceActionId" text,
	"nonConformanceInvestigationId" text,
	"operationId" text NOT NULL,
	"required" boolean,
	"sortOrder" numeric NOT NULL,
	"type" "procedureStepType" NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "jobOperationStep" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperation" (
	"assignee" text,
	"companyId" text NOT NULL,
	"conflictReason" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"dueDate" date,
	"hasConflict" boolean,
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text NOT NULL,
	"jobMakeMethodId" text,
	"laborRate" numeric NOT NULL,
	"laborTime" numeric NOT NULL,
	"laborUnit" "factor" NOT NULL,
	"machineRate" numeric,
	"machineTime" numeric NOT NULL,
	"machineUnit" "factor" NOT NULL,
	"operationLeadTime" numeric NOT NULL,
	"operationMinimumCost" numeric NOT NULL,
	"operationOrder" "methodOperationOrder" NOT NULL,
	"operationQuantity" numeric,
	"operationSupplierProcessId" text,
	"operationType" "operationType" NOT NULL,
	"operationUnitCost" numeric NOT NULL,
	"order" numeric NOT NULL,
	"overheadRate" numeric NOT NULL,
	"priority" numeric NOT NULL,
	"procedureId" text,
	"processId" text NOT NULL,
	"quantityComplete" numeric,
	"quantityReworked" numeric,
	"quantityScrapped" numeric,
	"setupTime" numeric NOT NULL,
	"setupUnit" "factor" NOT NULL,
	"startDate" date,
	"status" "jobOperationStatus" NOT NULL,
	"tags" text[],
	"targetQuantity" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text,
	"workInstruction" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobOperation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobOperationTool" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"operationId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"toolId" text NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "jobOperationTool" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job" (
	"actualTime" numeric,
	"assignee" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"configuration" jsonb,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerId" text,
	"customFields" jsonb,
	"deadlineType" "deadlineType" NOT NULL,
	"dueDate" date,
	"estimatedTime" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"jobId" text NOT NULL,
	"locationId" text NOT NULL,
	"modelUploadId" text,
	"notes" jsonb,
	"priority" numeric NOT NULL,
	"productionQuantity" numeric,
	"quantity" numeric NOT NULL,
	"quantityComplete" numeric NOT NULL,
	"quantityReceivedToInventory" numeric NOT NULL,
	"quantityShipped" numeric NOT NULL,
	"quoteId" text,
	"quoteLineId" text,
	"releasedDate" date,
	"salesOrderId" text,
	"salesOrderLineId" text,
	"scrapQuantity" numeric NOT NULL,
	"secondsToComplete" numeric,
	"startDate" date,
	"status" "jobStatus" NOT NULL,
	"storageUnitId" text,
	"tags" text[],
	"unitOfMeasureCode" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journalLineDimension" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"dimensionId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"journalLineId" text NOT NULL,
	"valueId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journalLineDimension" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journalLine" (
	"accountId" text,
	"accrual" boolean NOT NULL,
	"amount" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"customFields" jsonb,
	"description" text,
	"documentId" text,
	"documentLineReference" text,
	"documentType" jsonb,
	"externalDocumentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"intercompanyPartnerId" text,
	"journalId" text NOT NULL,
	"journalLineReference" text NOT NULL,
	"quantity" numeric NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "journalLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal" (
	"accountingPeriodId" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text,
	"customFields" jsonb,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"journalEntryId" text NOT NULL,
	"postedAt" timestamp with time zone,
	"postedBy" text,
	"postingDate" date NOT NULL,
	"reversalOfId" text,
	"reversedById" text,
	"sourceType" jsonb,
	"status" "journalEntryStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "journal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kanban" (
	"autoRelease" boolean NOT NULL,
	"autoStartJob" boolean NOT NULL,
	"companyId" text NOT NULL,
	"completedBarcodeOverride" text,
	"conversionFactor" numeric NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"jobId" text,
	"locationId" text NOT NULL,
	"purchaseUnitOfMeasureCode" text,
	"quantity" numeric NOT NULL,
	"replenishmentSystem" "itemReplenishmentSystem" NOT NULL,
	"storageUnitId" text,
	"supplierId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "kanban" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lessonCompletion" (
	"courseId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"lessonId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"addressLine1" text NOT NULL,
	"addressLine2" text,
	"city" text NOT NULL,
	"companyId" text NOT NULL,
	"countryCode" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"name" text NOT NULL,
	"postalCode" text NOT NULL,
	"stateProvince" text NOT NULL,
	"tags" text[],
	"timezone" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "location" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceDispatchComment" (
	"comment" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"maintenanceDispatchId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "maintenanceDispatchComment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceDispatchEvent" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"duration" numeric,
	"employeeId" text NOT NULL,
	"endTime" text,
	"id" text PRIMARY KEY NOT NULL,
	"maintenanceDispatchId" text NOT NULL,
	"notes" text,
	"startTime" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceDispatchItem" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"maintenanceDispatchId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"totalCost" numeric,
	"unitCost" numeric,
	"unitOfMeasureCode" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceDispatchItemTrackedEntity" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"maintenanceDispatchItemId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"trackedEntityId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItemTrackedEntity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceDispatch" (
	"actualEndTime" text,
	"actualFailureModeId" text,
	"actualStartTime" text,
	"assignee" text,
	"companyId" text NOT NULL,
	"completedAt" timestamp with time zone,
	"content" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"duration" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text,
	"maintenanceDispatchId" text NOT NULL,
	"maintenanceScheduleId" text,
	"nonConformanceId" text,
	"oeeImpact" "oeeImpact" NOT NULL,
	"plannedEndTime" text,
	"plannedStartTime" text,
	"priority" "maintenanceDispatchPriority" NOT NULL,
	"procedureId" text,
	"severity" "maintenanceSeverity" NOT NULL,
	"source" "maintenanceSource" NOT NULL,
	"status" "maintenanceDispatchStatus" NOT NULL,
	"suspectedFailureModeId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text
);
--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceDispatchWorkCenter" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"maintenanceDispatchId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenanceDispatchWorkCenter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceFailureMode" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "maintenanceFailureModeType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "maintenanceFailureMode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceScheduleItem" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"maintenanceScheduleId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unitOfMeasureCode" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "maintenanceScheduleItem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenanceSchedule" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"estimatedDuration" numeric,
	"frequency" "maintenanceFrequency" NOT NULL,
	"friday" boolean NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lastGeneratedAt" timestamp with time zone,
	"locationId" text,
	"monday" boolean NOT NULL,
	"name" text NOT NULL,
	"nextDueAt" timestamp with time zone,
	"priority" "maintenanceDispatchPriority" NOT NULL,
	"procedureId" text,
	"saturday" boolean NOT NULL,
	"skipHolidays" boolean NOT NULL,
	"sunday" boolean NOT NULL,
	"thursday" boolean NOT NULL,
	"tuesday" boolean NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"wednesday" boolean NOT NULL,
	"workCenterId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "makeMethod" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"status" "makeMethodStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"version" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "makeMethod" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "materialDimension" (
	"companyId" text,
	"id" text PRIMARY KEY NOT NULL,
	"isMetric" boolean NOT NULL,
	"materialFormId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materialDimension" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "materialFinish" (
	"companyId" text,
	"id" text PRIMARY KEY NOT NULL,
	"materialSubstanceId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materialFinish" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "materialForm" (
	"code" text NOT NULL,
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "materialForm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "materialGrade" (
	"companyId" text,
	"id" text PRIMARY KEY NOT NULL,
	"materialSubstanceId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materialGrade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "materialSubstance" (
	"code" text NOT NULL,
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "materialSubstance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "material" (
	"approved" boolean NOT NULL,
	"approvedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"dimensionId" text,
	"finishId" text,
	"gradeId" text,
	"id" text PRIMARY KEY NOT NULL,
	"materialFormId" text,
	"materialSubstanceId" text,
	"materialTypeId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "material" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "materialType" (
	"code" text NOT NULL,
	"companyId" text,
	"id" text PRIMARY KEY NOT NULL,
	"materialFormId" text NOT NULL,
	"materialSubstanceId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materialType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership" (
	"groupId" text NOT NULL,
	"id" numeric PRIMARY KEY NOT NULL,
	"memberGroupId" text,
	"memberUserId" text
);
--> statement-breakpoint
CREATE TABLE "methodMaterial" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"itemType" text NOT NULL,
	"kit" boolean NOT NULL,
	"makeMethodId" text NOT NULL,
	"materialMakeMethodId" text,
	"methodOperationId" text,
	"methodType" "methodType" NOT NULL,
	"order" numeric NOT NULL,
	"productionQuantity" numeric,
	"quantity" numeric NOT NULL,
	"scrapQuantity" numeric NOT NULL,
	"sourcingType" "sourcingType" NOT NULL,
	"storageUnitIds" jsonb NOT NULL,
	"tags" text[],
	"unitOfMeasureCode" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "methodMaterial" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "methodOperationParameter" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"operationId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "methodOperationParameter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "methodOperationStep" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" jsonb,
	"fileTypes" text[],
	"id" text PRIMARY KEY NOT NULL,
	"listValues" text[],
	"maxValue" numeric,
	"minValue" numeric,
	"name" text NOT NULL,
	"operationId" text NOT NULL,
	"required" boolean,
	"sortOrder" numeric NOT NULL,
	"type" "procedureStepType" NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "methodOperationStep" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "methodOperation" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"laborTime" numeric NOT NULL,
	"laborUnit" "factor" NOT NULL,
	"machineTime" numeric NOT NULL,
	"machineUnit" "factor" NOT NULL,
	"makeMethodId" text NOT NULL,
	"operationLeadTime" numeric,
	"operationMinimumCost" numeric,
	"operationOrder" "methodOperationOrder" NOT NULL,
	"operationSupplierProcessId" text,
	"operationType" "operationType" NOT NULL,
	"operationUnitCost" numeric,
	"order" numeric NOT NULL,
	"procedureId" text,
	"processId" text NOT NULL,
	"setupTime" numeric NOT NULL,
	"setupUnit" "factor" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text,
	"workInstruction" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "methodOperation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "methodOperationTool" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"operationId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"toolId" text NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "methodOperationTool" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "modelUpload" (
	"autodeskUrn" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"modelPath" text NOT NULL,
	"name" text,
	"size" numeric,
	"thumbnailPath" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "modelUpload" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "noQuoteReason" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "noQuoteReason" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceActionProcess" (
	"actionTaskId" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"processId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceActionProcess" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceActionTask" (
	"actionTypeId" text,
	"assignee" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dueDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"notes" jsonb NOT NULL,
	"sortOrder" numeric NOT NULL,
	"status" "nonConformanceTaskStatus" NOT NULL,
	"supplierId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceApprovalTask" (
	"approvalType" jsonb,
	"assignee" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"dueDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"notes" jsonb NOT NULL,
	"sortOrder" numeric NOT NULL,
	"status" "nonConformanceTaskStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceApprovalTask" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceCustomer" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceCustomer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceInboundInspection" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"inboundInspectionId" text NOT NULL,
	"nonConformanceId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nonConformanceInboundInspection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceItem" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"disposition" "disposition",
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"nonConformanceId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceItem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceItemTrackedEntity" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"nonConformanceItemId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"trackedEntityId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceJobOperation" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text,
	"jobOperationId" text NOT NULL,
	"jobReadableId" text,
	"nonConformanceId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformancePurchaseOrderLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"purchaseOrderId" text,
	"purchaseOrderLineId" text NOT NULL,
	"purchaseOrderReadableId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceReceiptLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"receiptId" text,
	"receiptLineId" text NOT NULL,
	"receiptReadableId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceRequiredAction" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"systemType" jsonb,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceRequiredAction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceReviewer" (
	"assignee" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"notes" jsonb NOT NULL,
	"status" "nonConformanceTaskStatus" NOT NULL,
	"title" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceReviewer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceSalesOrderLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"salesOrderId" text,
	"salesOrderLineId" text NOT NULL,
	"salesOrderReadableId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceShipmentLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"shipmentId" text,
	"shipmentLineId" text NOT NULL,
	"shipmentReadableId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceSupplier" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"externalLinkId" text,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"supplierId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformance" (
	"approvalRequirements" jsonb,
	"assignee" text,
	"closeDate" date,
	"companyId" text,
	"content" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"dueDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text NOT NULL,
	"name" text NOT NULL,
	"nonConformanceId" text NOT NULL,
	"nonConformanceTypeId" text NOT NULL,
	"nonConformanceWorkflowId" text,
	"openDate" date NOT NULL,
	"priority" "nonConformancePriority",
	"quantity" numeric NOT NULL,
	"requiredActionIds" text[],
	"source" "nonConformanceSource" NOT NULL,
	"status" "nonConformanceStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceTrackedEntity" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"nonConformanceId" text NOT NULL,
	"trackedEntityId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceTrackedEntity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceType" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonConformanceWorkflow" (
	"active" boolean NOT NULL,
	"approvalRequirements" jsonb,
	"companyId" text NOT NULL,
	"content" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"priority" "nonConformancePriority" NOT NULL,
	"requiredActionIds" text[],
	"source" "nonConformanceSource" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "nonConformanceWorkflow" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "note" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"documentId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"noteRichText" jsonb NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthClient" (
	"clientId" text NOT NULL,
	"clientSecret" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirectUris" text[] NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "oauthClient_clientId_unique" UNIQUE("clientId")
);
--> statement-breakpoint
ALTER TABLE "oauthClient" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthCode" (
	"clientId" text NOT NULL,
	"code" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"redirectUri" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauthCode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthToken" (
	"accessToken" text NOT NULL,
	"clientId" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"refreshToken" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauthToken" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "opportunity" (
	"companyId" text NOT NULL,
	"customerId" text,
	"id" text PRIMARY KEY NOT NULL,
	"purchaseOrderDocumentPath" text,
	"requestForQuoteDocumentPath" text
);
--> statement-breakpoint
ALTER TABLE "opportunity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "part" (
	"approved" boolean NOT NULL,
	"approvedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"fromDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"toDate" date,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "part" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partner" (
	"abilityId" text NOT NULL,
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"hoursPerWeek" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "partner" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "paymentTerm" (
	"active" boolean NOT NULL,
	"calculationMethod" "paymentTermCalculationMethod" NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"daysDiscount" numeric NOT NULL,
	"daysDue" numeric NOT NULL,
	"discountPercentage" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "paymentTerm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "period" (
	"createdAt" timestamp with time zone NOT NULL,
	"endDate" date NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"periodType" "periodType" NOT NULL,
	"startDate" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickMethod" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"defaultStorageUnitId" text,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "pickMethod" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan" (
	"aiTokensLimit" numeric NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"public" boolean NOT NULL,
	"stripePriceId" text NOT NULL,
	"stripeTrialPeriodDays" numeric NOT NULL,
	"tasksLimit" numeric NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"userBasedPricing" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricingRule" (
	"active" boolean NOT NULL,
	"amount" numeric NOT NULL,
	"amountType" "pricingRuleAmountType" NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerIds" text[],
	"customerTypeIds" text[],
	"id" text PRIMARY KEY NOT NULL,
	"itemIds" text[],
	"itemPostingGroupId" text,
	"maxQuantity" numeric,
	"minQuantity" numeric,
	"name" text NOT NULL,
	"priority" numeric NOT NULL,
	"ruleType" "pricingRuleType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"validFrom" text,
	"validTo" text
);
--> statement-breakpoint
ALTER TABLE "pricingRule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "procedureParameter" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"procedureId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procedureParameter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "procedureStep" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" jsonb,
	"fileTypes" text[],
	"id" text PRIMARY KEY NOT NULL,
	"listValues" text[],
	"maxValue" numeric,
	"minValue" numeric,
	"name" text NOT NULL,
	"procedureId" text NOT NULL,
	"required" boolean,
	"sortOrder" numeric NOT NULL,
	"type" "procedureStepType" NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "procedureStep" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "procedure" (
	"assignee" text,
	"companyId" text,
	"content" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"processId" text,
	"status" "procedureStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"version" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procedure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"completeAllOnScan" boolean NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"defaultStandardFactor" "factor" NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"processType" "processType" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "process" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "productionEvent" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"duration" numeric,
	"employeeId" text,
	"endTime" text,
	"id" text PRIMARY KEY NOT NULL,
	"jobOperationId" text NOT NULL,
	"notes" text,
	"postedToGL" boolean NOT NULL,
	"startTime" text NOT NULL,
	"type" "productionEventType",
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text
);
--> statement-breakpoint
ALTER TABLE "productionEvent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "productionQuantity" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"jobOperationId" text NOT NULL,
	"laborProductionEventId" text,
	"machineProductionEventId" text,
	"notes" text,
	"quantity" numeric NOT NULL,
	"scrapReasonId" text,
	"setupProductionEventId" text,
	"type" "productionQuantityType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "productionQuantity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseInvoiceDelivery" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"locationId" text,
	"shippingMethodId" text,
	"shippingTermId" text,
	"supplierShippingCost" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseInvoiceDelivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseInvoiceLine" (
	"accountId" text,
	"assetId" text,
	"companyId" text NOT NULL,
	"conversionFactor" numeric,
	"costCenterId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"exchangeRate" numeric NOT NULL,
	"extendedPrice" numeric,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"inventoryUnitOfMeasureCode" text,
	"invoiceId" text NOT NULL,
	"invoiceLineType" "payableLineType" NOT NULL,
	"itemId" text,
	"jobOperationId" text,
	"locationId" text,
	"modelUploadId" text,
	"ownerId" text,
	"purchaseOrderId" text,
	"purchaseOrderLineId" text,
	"purchaseUnitOfMeasureCode" text,
	"quantity" numeric NOT NULL,
	"requiredDate" date,
	"serviceId" text,
	"shippingCost" numeric,
	"sortOrder" numeric NOT NULL,
	"storageUnitId" text,
	"supplierExtendedPrice" numeric,
	"supplierShippingCost" numeric NOT NULL,
	"supplierTaxAmount" numeric NOT NULL,
	"supplierUnitPrice" numeric NOT NULL,
	"tags" text[],
	"taxAmount" numeric,
	"taxPercent" numeric,
	"totalAmount" numeric,
	"unitPrice" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseInvoicePaymentRelation" (
	"id" text PRIMARY KEY NOT NULL,
	"invoiceId" text NOT NULL,
	"paymentId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseInvoicePriceChange" (
	"id" text PRIMARY KEY NOT NULL,
	"invoiceId" text NOT NULL,
	"invoiceLineId" text NOT NULL,
	"newPrice" numeric NOT NULL,
	"newQuantity" numeric NOT NULL,
	"previousPrice" numeric NOT NULL,
	"previousQuantity" numeric NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseInvoiceStatusHistory" (
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"invoiceId" text NOT NULL,
	"status" "purchaseInvoiceStatus" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseInvoice" (
	"assignee" text,
	"balance" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text NOT NULL,
	"customFields" jsonb,
	"dateDue" text,
	"dateIssued" text,
	"datePaid" text,
	"exchangeRate" numeric NOT NULL,
	"exchangeRateUpdatedAt" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"invoiceId" text NOT NULL,
	"invoiceSupplierContactId" text,
	"invoiceSupplierId" text,
	"invoiceSupplierLocationId" text,
	"locationId" text,
	"paymentTermId" text,
	"postingDate" date,
	"status" "purchaseInvoiceStatus" NOT NULL,
	"subtotal" numeric NOT NULL,
	"supplierId" text,
	"supplierInteractionId" text NOT NULL,
	"supplierReference" text,
	"tags" text[],
	"totalAmount" numeric NOT NULL,
	"totalDiscount" numeric NOT NULL,
	"totalTax" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseOrderDelivery" (
	"companyId" text NOT NULL,
	"customerId" text,
	"customerLocationId" text,
	"customFields" jsonb,
	"deliveryDate" date,
	"dropShipment" boolean NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"locationId" text,
	"notes" text,
	"receiptPromisedDate" date,
	"receiptRequestedDate" date,
	"shippingMethodId" text,
	"shippingTermId" text,
	"supplierShippingCost" numeric NOT NULL,
	"tags" text[],
	"trackingNumber" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseOrderFavorite" (
	"purchaseOrderId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseOrderLine" (
	"accountId" text,
	"assetId" text,
	"companyId" text NOT NULL,
	"conversionFactor" numeric,
	"costCenterId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"exchangeRate" numeric NOT NULL,
	"extendedPrice" numeric,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"inventoryUnitOfMeasureCode" text,
	"invoicedComplete" boolean NOT NULL,
	"itemId" text,
	"jobId" text,
	"jobOperationId" text,
	"locationId" text,
	"modelUploadId" text,
	"ownerId" text,
	"promisedDate" date,
	"purchaseOrderId" text NOT NULL,
	"purchaseOrderLineType" "purchaseOrderLineType" NOT NULL,
	"purchaseQuantity" numeric,
	"purchaseUnitOfMeasureCode" text,
	"quantityInvoiced" numeric,
	"quantityReceived" numeric,
	"quantityShipped" numeric,
	"quantityToInvoice" numeric,
	"quantityToReceive" numeric,
	"receivedComplete" boolean NOT NULL,
	"receivedDate" date,
	"requiredDate" date,
	"requiresInspection" boolean NOT NULL,
	"setupPrice" numeric,
	"shippingCost" numeric,
	"sortOrder" numeric NOT NULL,
	"storageUnitId" text,
	"supplierExtendedPrice" numeric,
	"supplierShippingCost" numeric NOT NULL,
	"supplierTaxAmount" numeric NOT NULL,
	"supplierUnitPrice" numeric,
	"tags" text[],
	"taxAmount" numeric,
	"taxPercent" numeric,
	"unitPrice" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseOrderPayment" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"invoiceSupplierContactId" text,
	"invoiceSupplierId" text,
	"invoiceSupplierLocationId" text,
	"paymentComplete" boolean NOT NULL,
	"paymentTermId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseOrderPayment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseOrderStatusHistory" (
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"purchaseOrderId" text NOT NULL,
	"status" "purchaseOrderStatus" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseOrder" (
	"assignee" text,
	"closedAt" timestamp with time zone,
	"closedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text,
	"customFields" jsonb,
	"exchangeRate" numeric,
	"exchangeRateUpdatedAt" timestamp with time zone,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"jobId" text,
	"jobReadableId" text,
	"orderDate" date,
	"purchaseOrderId" text NOT NULL,
	"purchaseOrderType" "purchaseOrderType" NOT NULL,
	"revisionId" numeric NOT NULL,
	"status" "purchaseOrderStatus" NOT NULL,
	"supplierContactId" text,
	"supplierId" text NOT NULL,
	"supplierInteractionId" text NOT NULL,
	"supplierLocationId" text,
	"supplierReference" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchaseOrder" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchaseOrderTransaction" (
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"purchaseOrderId" text NOT NULL,
	"type" "purchaseOrderTransactionType" NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasePayment" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text NOT NULL,
	"customFields" jsonb,
	"exchangeRate" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"paymentDate" date,
	"paymentId" text NOT NULL,
	"supplierId" text NOT NULL,
	"totalAmount" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchasePayment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchasingRfqFavorite" (
	"rfqId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasingRfqLine" (
	"companyId" text NOT NULL,
	"conversionFactor" numeric,
	"createdAt" timestamp with time zone,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"inventoryUnitOfMeasureCode" text NOT NULL,
	"itemId" text NOT NULL,
	"order" numeric NOT NULL,
	"purchaseUnitOfMeasureCode" text NOT NULL,
	"purchasingRfqId" text NOT NULL,
	"quantity" numeric[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchasingRfqLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchasingRfqSupplier" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"createdBy" text,
	"id" text PRIMARY KEY NOT NULL,
	"purchasingRfqId" text NOT NULL,
	"supplierId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchasingRfqSupplier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchasingRfq" (
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"createdBy" text,
	"customFields" jsonb,
	"employeeId" text,
	"expirationDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" text,
	"locationId" text,
	"notes" jsonb,
	"revisionId" numeric NOT NULL,
	"rfqDate" date NOT NULL,
	"rfqId" text NOT NULL,
	"status" "purchasingRfqStatus" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "purchasingRfq" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchasingRfqToPurchaseOrder" (
	"companyId" text NOT NULL,
	"purchaseOrderId" text NOT NULL,
	"purchasingRfqId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchasingRfqToPurchaseOrder" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchasingRfqToSupplierQuote" (
	"companyId" text NOT NULL,
	"purchasingRfqId" text NOT NULL,
	"supplierQuoteId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchasingRfqToSupplierQuote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "qualityDocumentStep" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"fileTypes" text[],
	"id" text PRIMARY KEY NOT NULL,
	"listValues" text[],
	"maxValue" numeric,
	"minValue" numeric,
	"name" text NOT NULL,
	"qualityDocumentId" text NOT NULL,
	"required" boolean,
	"sortOrder" numeric NOT NULL,
	"type" "procedureStepType" NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "qualityDocumentStep" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "qualityDocument" (
	"assignee" text,
	"companyId" text,
	"content" jsonb,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "qualityDocumentStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"version" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qualityDocument" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteFavorite" (
	"quoteId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quoteLinePrice" (
	"categoryMarkups" jsonb,
	"convertedNetExtendedPrice" numeric,
	"convertedNetUnitPrice" numeric,
	"convertedShippingCost" numeric,
	"convertedUnitPrice" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"discountPercent" numeric NOT NULL,
	"exchangeRate" numeric,
	"leadTime" numeric NOT NULL,
	"netExtendedPrice" numeric,
	"netUnitPrice" numeric,
	"quantity" numeric NOT NULL,
	"quoteId" text NOT NULL,
	"quoteLineId" text NOT NULL,
	"shippingCost" numeric NOT NULL,
	"unitPrice" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "quoteLine" (
	"additionalCharges" jsonb,
	"companyId" text NOT NULL,
	"configuration" jsonb,
	"createdBy" text NOT NULL,
	"customerPartId" text,
	"customerPartRevision" text,
	"customFields" jsonb,
	"description" text NOT NULL,
	"estimatorId" text,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"itemId" text NOT NULL,
	"itemType" text NOT NULL,
	"locationId" text,
	"methodType" "methodType" NOT NULL,
	"modelUploadId" text,
	"noQuoteReason" text,
	"priceTrace" jsonb,
	"pricingRuleId" text,
	"quantity" numeric[],
	"quoteId" text NOT NULL,
	"quoteRevisionId" numeric NOT NULL,
	"sortOrder" numeric NOT NULL,
	"status" "quoteLineStatus" NOT NULL,
	"tags" text[],
	"taxPercent" numeric NOT NULL,
	"unitOfMeasureCode" text,
	"unitPricePrecision" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quoteLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteMakeMethod" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"parentMaterialId" text,
	"quantityPerParent" numeric NOT NULL,
	"quoteId" text NOT NULL,
	"quoteLineId" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"version" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteMaterial" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"itemType" text NOT NULL,
	"kit" boolean NOT NULL,
	"methodType" "methodType" NOT NULL,
	"order" numeric NOT NULL,
	"productionQuantity" numeric,
	"quantity" numeric NOT NULL,
	"quoteId" text NOT NULL,
	"quoteLineId" text NOT NULL,
	"quoteMakeMethodId" text NOT NULL,
	"quoteOperationId" text,
	"scrapQuantity" numeric NOT NULL,
	"storageUnitId" text,
	"tags" text[],
	"unitCost" numeric NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quoteMaterial" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteOperationParameter" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"operationId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quoteOperationParameter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteOperationStep" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" jsonb,
	"fileTypes" text[],
	"id" text PRIMARY KEY NOT NULL,
	"listValues" text[],
	"maxValue" numeric,
	"minValue" numeric,
	"name" text NOT NULL,
	"operationId" text NOT NULL,
	"required" boolean,
	"sortOrder" numeric NOT NULL,
	"type" "procedureStepType" NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quoteOperationStep" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteOperation" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"laborRate" numeric NOT NULL,
	"laborTime" numeric NOT NULL,
	"laborUnit" "factor" NOT NULL,
	"machineRate" numeric,
	"machineTime" numeric NOT NULL,
	"machineUnit" "factor" NOT NULL,
	"operationLeadTime" numeric NOT NULL,
	"operationMinimumCost" numeric NOT NULL,
	"operationOrder" "methodOperationOrder" NOT NULL,
	"operationSupplierProcessId" text,
	"operationType" "operationType" NOT NULL,
	"operationUnitCost" numeric NOT NULL,
	"order" numeric NOT NULL,
	"overheadRate" numeric NOT NULL,
	"procedureId" text,
	"processId" text NOT NULL,
	"quoteId" text NOT NULL,
	"quoteLineId" text NOT NULL,
	"quoteMakeMethodId" text,
	"setupTime" numeric NOT NULL,
	"setupUnit" "factor" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text,
	"workInstruction" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quoteOperation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteOperationTool" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"operationId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"toolId" text NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quoteOperationTool" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quotePayment" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"invoiceCustomerContactId" text,
	"invoiceCustomerId" text,
	"invoiceCustomerLocationId" text,
	"paymentTermId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quotePayment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quoteShipment" (
	"companyId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"locationId" text,
	"receiptRequestedDate" date,
	"shippingCost" numeric,
	"shippingMethodId" text,
	"shippingTermId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quoteShipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quote" (
	"assignee" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text,
	"customerContactId" text,
	"customerEngineeringContactId" text,
	"customerId" text NOT NULL,
	"customerLocationId" text,
	"customerReference" text,
	"customFields" jsonb,
	"digitalQuoteAcceptedBy" text,
	"digitalQuoteAcceptedByEmail" text,
	"digitalQuoteRejectedBy" text,
	"digitalQuoteRejectedByEmail" text,
	"dueDate" date,
	"estimatorId" text,
	"exchangeRate" numeric,
	"exchangeRateUpdatedAt" timestamp with time zone,
	"expirationDate" date,
	"externalLinkId" text,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"locationId" text,
	"opportunityId" text,
	"quoteId" text NOT NULL,
	"revisionId" numeric NOT NULL,
	"salesPersonId" text,
	"status" "quoteStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "quote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receiptLine" (
	"companyId" text NOT NULL,
	"conversionFactor" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"lineId" text,
	"locationId" text,
	"orderQuantity" numeric NOT NULL,
	"outstandingQuantity" numeric NOT NULL,
	"receiptId" text NOT NULL,
	"receivedQuantity" numeric NOT NULL,
	"requiresBatchTracking" boolean NOT NULL,
	"requiresSerialTracking" boolean NOT NULL,
	"storageUnitId" text,
	"unitOfMeasure" text NOT NULL,
	"unitPrice" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "receiptLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receipt" (
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"externalDocumentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"invoiced" boolean,
	"locationId" text,
	"postedBy" text,
	"postingDate" date,
	"receiptId" text NOT NULL,
	"sourceDocument" jsonb,
	"sourceDocumentId" text,
	"sourceDocumentReadableId" text,
	"status" "receiptStatus" NOT NULL,
	"supplierId" text,
	"supplierInteractionId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "riskRegister" (
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text,
	"likelihood" numeric,
	"notes" jsonb,
	"severity" numeric,
	"source" "riskSource" NOT NULL,
	"sourceId" text,
	"status" "riskStatus" NOT NULL,
	"title" text NOT NULL,
	"type" "riskRegisterType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "riskRegister" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesInvoiceLine" (
	"accountId" text,
	"addOnCost" numeric NOT NULL,
	"assetId" text,
	"companyId" text NOT NULL,
	"convertedAddOnCost" numeric,
	"convertedNonTaxableAddOnCost" numeric,
	"convertedSetupPrice" numeric,
	"convertedShippingCost" numeric,
	"convertedUnitPrice" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb NOT NULL,
	"description" text,
	"exchangeRate" numeric NOT NULL,
	"externalNotes" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb NOT NULL,
	"invoiceId" text NOT NULL,
	"invoiceLineType" "salesInvoiceLineType" NOT NULL,
	"itemId" text,
	"locationId" text,
	"methodType" "methodType" NOT NULL,
	"modelUploadId" text,
	"nonTaxableAddOnCost" numeric NOT NULL,
	"opportunityId" text,
	"quantity" numeric NOT NULL,
	"salesOrderId" text,
	"salesOrderLineId" text,
	"setupPrice" numeric NOT NULL,
	"shippingCost" numeric NOT NULL,
	"sortOrder" numeric NOT NULL,
	"storageUnitId" text,
	"taxPercent" numeric NOT NULL,
	"unitOfMeasureCode" text NOT NULL,
	"unitPrice" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesInvoiceShipment" (
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"locationId" text,
	"shippingCost" numeric NOT NULL,
	"shippingMethodId" text,
	"shippingTermId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesInvoiceShipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesInvoice" (
	"assignee" text,
	"balance" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text NOT NULL,
	"customerId" text NOT NULL,
	"customerReference" text,
	"customFields" jsonb NOT NULL,
	"dateDue" text,
	"dateIssued" text,
	"datePaid" text,
	"exchangeRate" numeric NOT NULL,
	"exchangeRateUpdatedAt" timestamp with time zone,
	"externalNotes" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb NOT NULL,
	"invoiceCustomerContactId" text,
	"invoiceCustomerId" text,
	"invoiceCustomerLocationId" text,
	"invoiceId" text NOT NULL,
	"locationId" text,
	"opportunityId" text,
	"paymentTermId" text,
	"postingDate" date,
	"shipmentId" text,
	"status" "salesInvoiceStatus" NOT NULL,
	"subtotal" numeric NOT NULL,
	"tags" text[],
	"totalAmount" numeric NOT NULL,
	"totalDiscount" numeric NOT NULL,
	"totalTax" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesInvoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesOrderFavorite" (
	"salesOrderId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesOrderLine" (
	"accountId" text,
	"addOnCost" numeric NOT NULL,
	"assetId" text,
	"companyId" text NOT NULL,
	"convertedAddOnCost" numeric,
	"convertedNonTaxableAddOnCost" numeric,
	"convertedShippingCost" numeric,
	"convertedUnitPrice" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text,
	"exchangeRate" numeric,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"invoicedComplete" boolean NOT NULL,
	"itemId" text,
	"locationId" text,
	"methodType" "methodType" NOT NULL,
	"modelUploadId" text,
	"nonTaxableAddOnCost" numeric NOT NULL,
	"priceTrace" jsonb,
	"pricingRuleId" text,
	"promisedDate" date,
	"quantityInvoiced" numeric,
	"quantitySent" numeric,
	"quantityToInvoice" numeric,
	"quantityToSend" numeric,
	"requiresInspection" boolean NOT NULL,
	"saleQuantity" numeric,
	"salesOrderId" text NOT NULL,
	"salesOrderLineType" "salesOrderLineType" NOT NULL,
	"sentComplete" boolean NOT NULL,
	"sentDate" date,
	"setupPrice" numeric,
	"shippingCost" numeric NOT NULL,
	"sortOrder" numeric NOT NULL,
	"status" "salesOrderLineStatus" NOT NULL,
	"storageUnitId" text,
	"taxPercent" numeric NOT NULL,
	"unitOfMeasureCode" text,
	"unitPrice" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesOrderLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesOrderPayment" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"invoiceCustomerContactId" text,
	"invoiceCustomerId" text,
	"invoiceCustomerLocationId" text,
	"paymentComplete" boolean NOT NULL,
	"paymentTermId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesOrderShipment" (
	"assignee" text,
	"companyId" text NOT NULL,
	"customerId" text,
	"customerLocationId" text,
	"customFields" jsonb,
	"deliveryDate" date,
	"dropShipment" boolean NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"locationId" text,
	"notes" text,
	"receiptPromisedDate" date,
	"receiptRequestedDate" date,
	"shippingCost" numeric,
	"shippingMethodId" text,
	"shippingTermId" text,
	"supplierId" text,
	"supplierLocationId" text,
	"trackingNumber" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesOrderStatusHistory" (
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"salesOrderId" text NOT NULL,
	"status" "salesOrderStatus" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesOrder" (
	"assignee" text,
	"closedAt" timestamp with time zone,
	"closedBy" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text NOT NULL,
	"customerContactId" text,
	"customerEngineeringContactId" text,
	"customerId" text NOT NULL,
	"customerLocationId" text,
	"customerReference" text,
	"customFields" jsonb,
	"exchangeRate" numeric,
	"exchangeRateUpdatedAt" timestamp with time zone,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"locationId" text,
	"opportunityId" text,
	"orderDate" date,
	"revisionId" numeric NOT NULL,
	"salesOrderId" text NOT NULL,
	"salesPersonId" text,
	"sentCompleteDate" date,
	"status" "salesOrderStatus" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesOrder" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesOrderTransaction" (
	"createdAt" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"salesOrderId" text NOT NULL,
	"type" "salesOrderTransactionType" NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesRfqFavorite" (
	"rfqId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesRfqLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone,
	"createdBy" text NOT NULL,
	"customerPartId" text NOT NULL,
	"customerPartRevision" text,
	"customFields" jsonb,
	"description" text,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"itemId" text,
	"modelUploadId" text,
	"order" numeric NOT NULL,
	"quantity" numeric[],
	"salesRfqId" text NOT NULL,
	"tags" text[],
	"unitOfMeasureCode" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesRfqLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salesRfq" (
	"assignee" text,
	"companyId" text NOT NULL,
	"completedDate" date,
	"createdAt" timestamp with time zone,
	"createdBy" text,
	"customerContactId" text,
	"customerEngineeringContactId" text,
	"customerId" text,
	"customerLocationId" text,
	"customerReference" text,
	"customFields" jsonb,
	"employeeId" text,
	"expirationDate" date,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"locationId" text,
	"noQuoteReasonId" text,
	"opportunityId" text,
	"revisionId" numeric NOT NULL,
	"rfqDate" date NOT NULL,
	"rfqId" text NOT NULL,
	"salesPersonId" text,
	"status" "salesRfqStatus" NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "salesRfq" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scrapReason" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "scrapReason" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "searchIndexRegistry" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"lastRebuiltAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "searchIndexRegistry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "searchIndex_CYj9v111oXXm6PX9ZD6Yn2" (
	"createdAt" timestamp with time zone NOT NULL,
	"description" text,
	"entityId" text NOT NULL,
	"entityType" text NOT NULL,
	"id" numeric PRIMARY KEY NOT NULL,
	"link" text NOT NULL,
	"metadata" jsonb,
	"searchVector" "tsvector" NOT NULL,
	"tags" text[],
	"title" text NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sequence" (
	"companyId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"next" numeric NOT NULL,
	"prefix" text,
	"size" numeric NOT NULL,
	"step" numeric NOT NULL,
	"suffix" text,
	"table" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "sequence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service" (
	"approved" boolean NOT NULL,
	"approvedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"fromDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text,
	"serviceType" "serviceType" NOT NULL,
	"tags" text[],
	"toDate" date,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "service" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shift" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"endTime" text NOT NULL,
	"friday" boolean NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text NOT NULL,
	"monday" boolean NOT NULL,
	"name" text NOT NULL,
	"saturday" boolean NOT NULL,
	"startTime" text NOT NULL,
	"sunday" boolean NOT NULL,
	"tags" text[],
	"thursday" boolean NOT NULL,
	"tuesday" boolean NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"wednesday" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipmentLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"fulfillmentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"lineId" text,
	"locationId" text,
	"orderQuantity" numeric NOT NULL,
	"outstandingQuantity" numeric NOT NULL,
	"requiresBatchTracking" boolean NOT NULL,
	"requiresSerialTracking" boolean NOT NULL,
	"shipmentId" text NOT NULL,
	"shippedQuantity" numeric NOT NULL,
	"storageUnitId" text,
	"unitOfMeasure" text NOT NULL,
	"unitPrice" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "shipmentLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipment" (
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customerId" text,
	"customFields" jsonb,
	"externalDocumentId" text,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"invoiced" boolean,
	"locationId" text,
	"opportunityId" text,
	"postedBy" text,
	"postingDate" date,
	"shipmentId" text NOT NULL,
	"shippingMethodId" text,
	"sourceDocument" jsonb,
	"sourceDocumentId" text,
	"sourceDocumentReadableId" text,
	"status" "shipmentStatus" NOT NULL,
	"supplierId" text,
	"supplierInteractionId" text,
	"tags" text[],
	"trackingNumber" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "shipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shippingMethod" (
	"active" boolean NOT NULL,
	"carrier" "shippingCarrier" NOT NULL,
	"carrierAccountId" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"trackingUrl" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "shippingMethod" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shippingTerm" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "shippingTerm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "slackDocumentThread" (
	"channelId" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"documentId" text NOT NULL,
	"documentType" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"threadTs" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "slackDocumentThread" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stockTransferLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"fromStorageUnitId" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"jobId" text,
	"jobMaterialId" text,
	"outstandingQuantity" numeric,
	"pickedQuantity" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"requiresBatchTracking" boolean NOT NULL,
	"requiresSerialTracking" boolean NOT NULL,
	"stockTransferId" text NOT NULL,
	"toStorageUnitId" text,
	"trackedEntityId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "stockTransferLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stockTransfer" (
	"assignee" text,
	"companyId" text NOT NULL,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text NOT NULL,
	"notes" jsonb,
	"status" "stockTransferStatus" NOT NULL,
	"stockTransferId" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "stockTransfer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storageType" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "storageType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storageUnit" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text NOT NULL,
	"name" text NOT NULL,
	"parentId" text,
	"storageTypeIds" text[] NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"warehouseId" text
);
--> statement-breakpoint
ALTER TABLE "storageUnit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suggestion" (
	"attachmentPath" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"emoji" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"suggestion" text NOT NULL,
	"tags" text[],
	"userId" text
);
--> statement-breakpoint
ALTER TABLE "suggestion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierAccount" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"supplierId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplierAccount" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierContact" (
	"contactId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"supplierId" text NOT NULL,
	"supplierLocationId" text,
	"tags" text[],
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "supplierInteraction" (
	"companyId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"supplierId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplierInteraction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierLedger" (
	"amount" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"documentId" text,
	"documentType" jsonb,
	"entryNumber" numeric NOT NULL,
	"externalDocumentId" text,
	"id" text PRIMARY KEY NOT NULL,
	"postingDate" date NOT NULL,
	"supplierId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplierLedger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierLocation" (
	"addressId" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"supplierId" text NOT NULL,
	"tags" text[]
);
--> statement-breakpoint
CREATE TABLE "supplierPartPrice" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"leadTime" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"sourceDocumentId" text,
	"sourceType" "supplierPartPriceSourceType" NOT NULL,
	"supplierPartId" text NOT NULL,
	"unitPrice" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierPartPrice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierPart" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"conversionFactor" numeric NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"minimumOrderQuantity" numeric,
	"supplierId" text NOT NULL,
	"supplierPartId" text,
	"supplierUnitOfMeasureCode" text,
	"tags" text[],
	"unitPrice" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierPart" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierPayment" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"invoiceSupplierContactId" text,
	"invoiceSupplierId" text,
	"invoiceSupplierLocationId" text,
	"paymentTermId" text,
	"supplierId" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierPayment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierProcess" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"leadTime" numeric NOT NULL,
	"minimumCost" numeric NOT NULL,
	"processId" text NOT NULL,
	"supplierId" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierProcess" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierQuoteFavorite" (
	"supplierQuoteId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplierQuoteLinePrice" (
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"exchangeRate" numeric,
	"extendedPrice" numeric,
	"leadTime" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"shippingCost" numeric,
	"supplierExtendedPrice" numeric,
	"supplierQuoteId" text NOT NULL,
	"supplierQuoteLineId" text NOT NULL,
	"supplierShippingCost" numeric NOT NULL,
	"supplierTaxAmount" numeric NOT NULL,
	"supplierUnitPrice" numeric NOT NULL,
	"taxAmount" numeric,
	"taxPercent" numeric,
	"unitPrice" numeric,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "supplierQuoteLine" (
	"accountId" text,
	"companyId" text NOT NULL,
	"conversionFactor" numeric NOT NULL,
	"costCenterId" text,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"description" text NOT NULL,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"inventoryUnitOfMeasureCode" text,
	"itemId" text,
	"ownerId" text,
	"purchaseUnitOfMeasureCode" text,
	"quantity" numeric[],
	"requiredDate" date,
	"sortOrder" numeric NOT NULL,
	"supplierPartId" text,
	"supplierPartRevision" text,
	"supplierQuoteId" text NOT NULL,
	"supplierQuoteLineType" text NOT NULL,
	"supplierQuoteRevisionId" numeric NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierQuote" (
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"currencyCode" text,
	"customFields" jsonb,
	"exchangeRate" numeric,
	"exchangeRateUpdatedAt" timestamp with time zone,
	"expirationDate" date,
	"externalLinkId" text,
	"externalNotes" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"internalNotes" jsonb,
	"quotedDate" date NOT NULL,
	"revisionId" numeric NOT NULL,
	"status" "supplierQuoteStatus" NOT NULL,
	"supplierContactId" text,
	"supplierId" text NOT NULL,
	"supplierInteractionId" text NOT NULL,
	"supplierLocationId" text,
	"supplierQuoteId" text NOT NULL,
	"supplierQuoteType" "purchaseOrderType" NOT NULL,
	"supplierReference" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierQuote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierShipping" (
	"companyId" text NOT NULL,
	"customFields" jsonb,
	"incoterm" "incoterm",
	"incotermLocation" text,
	"shippingMethodId" text,
	"shippingSupplierContactId" text,
	"shippingSupplierId" text,
	"shippingSupplierLocationId" text,
	"shippingTermId" text,
	"supplierId" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierShipping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier" (
	"accountManagerId" text,
	"assignee" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text,
	"currencyCode" text,
	"customFields" jsonb,
	"defaultCc" text[],
	"embedding" vector NOT NULL,
	"fax" text,
	"id" text PRIMARY KEY NOT NULL,
	"intercompanyCompanyId" text,
	"logo" text,
	"name" text NOT NULL,
	"phone" text,
	"purchasingContactId" text,
	"supplierStatus" jsonb,
	"supplierTypeId" text,
	"tags" text[],
	"taxPercent" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"website" text
);
--> statement-breakpoint
ALTER TABLE "supplier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierTax" (
	"companyId" text NOT NULL,
	"eori" text,
	"supplierId" text NOT NULL,
	"taxExempt" boolean NOT NULL,
	"taxExemptionCertificateNumber" text,
	"taxExemptionCertificatePath" text,
	"taxExemptionReason" jsonb,
	"taxId" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"vatNumber" text
);
--> statement-breakpoint
ALTER TABLE "supplierTax" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplierType" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"protected" boolean NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "supplierType" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplyActual" (
	"actualQuantity" numeric NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"notes" text,
	"periodId" text NOT NULL,
	"sourceType" "supplySourceType" NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplyActual" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplyForecast" (
	"companyId" text NOT NULL,
	"confidence" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"forecastMethod" text,
	"forecastQuantity" numeric NOT NULL,
	"itemId" text NOT NULL,
	"locationId" text NOT NULL,
	"notes" text,
	"periodId" text NOT NULL,
	"sourceType" "supplySourceType",
	"updatedAt" timestamp with time zone NOT NULL,
	"updatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplyForecast" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tableView" (
	"columnOrder" text[],
	"columnPinning" jsonb,
	"columnVisibility" jsonb,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"filters" text[],
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sortOrder" numeric NOT NULL,
	"sorts" text[],
	"table" text NOT NULL,
	"type" "tableViewType" NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "tableView" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tag" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"name" text NOT NULL,
	"table" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "terms" (
	"id" text PRIMARY KEY NOT NULL,
	"purchasingTerms" jsonb,
	"salesTerms" jsonb,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "timeCardEntry" (
	"autoCloseShiftId" text,
	"clockIn" text NOT NULL,
	"clockOut" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"employeeId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"note" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "timeCardEntry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tool" (
	"approved" boolean NOT NULL,
	"approvedBy" text,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "tool" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trackedActivityInput" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"quantity" numeric NOT NULL,
	"trackedActivityId" text NOT NULL,
	"trackedEntityId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trackedActivityInput" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trackedActivityOutput" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"quantity" numeric NOT NULL,
	"trackedActivityId" text NOT NULL,
	"trackedEntityId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trackedActivityOutput" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trackedActivity" (
	"attributes" jsonb NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"sourceDocument" text,
	"sourceDocumentId" text,
	"sourceDocumentReadableId" text,
	"type" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trackedActivity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trackedEntity" (
	"attributes" jsonb NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"expirationDate" date,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text,
	"quantity" numeric NOT NULL,
	"readableId" text,
	"sourceDocument" text NOT NULL,
	"sourceDocumentId" text NOT NULL,
	"sourceDocumentReadableId" text,
	"status" "trackedEntityStatus" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trackedEntity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trainingAssignment" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"groupIds" text[],
	"id" text PRIMARY KEY NOT NULL,
	"trainingId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "trainingAssignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trainingCompletion" (
	"companyId" text NOT NULL,
	"completedAt" timestamp with time zone NOT NULL,
	"completedBy" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"employeeId" text NOT NULL,
	"id" numeric PRIMARY KEY NOT NULL,
	"period" text,
	"trainingAssignmentId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "trainingCompletion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trainingQuestion" (
	"companyId" text NOT NULL,
	"correctAnswers" text[],
	"correctBoolean" boolean,
	"correctNumber" numeric,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"matchingPairs" jsonb,
	"options" text[],
	"question" text NOT NULL,
	"required" boolean,
	"sortOrder" numeric NOT NULL,
	"tolerance" numeric,
	"trainingId" text NOT NULL,
	"type" "trainingQuestionType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "trainingQuestion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training" (
	"assignee" text,
	"companyId" text,
	"content" jsonb,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"description" text,
	"estimatedDuration" text,
	"frequency" "trainingFrequency" NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"processId" text,
	"status" "trainingStatus" NOT NULL,
	"tags" text[],
	"type" "trainingType" NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"version" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unitOfMeasure" (
	"active" boolean NOT NULL,
	"code" text NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "unitOfMeasure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "userAttributeCategory" (
	"active" boolean,
	"companyId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"emoji" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"protected" boolean,
	"public" boolean,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "userAttributeCategory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "userAttribute" (
	"active" boolean,
	"attributeDataTypeId" numeric NOT NULL,
	"canSelfManage" boolean,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"listOptions" text[],
	"name" text NOT NULL,
	"sortOrder" numeric NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"userAttributeCategoryId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userAttributeValue" (
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"userAttributeId" text NOT NULL,
	"userId" text NOT NULL,
	"valueBoolean" boolean,
	"valueDate" date,
	"valueFile" text,
	"valueNumeric" numeric,
	"valueText" text,
	"valueUser" text
);
--> statement-breakpoint
CREATE TABLE "userModulePreference" (
	"companyId" text NOT NULL,
	"hidden" boolean NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"position" numeric NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "userModulePreference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "userPermission" (
	"id" text PRIMARY KEY NOT NULL,
	"permissions" jsonb
);
--> statement-breakpoint
CREATE TABLE "user" (
	"about" text NOT NULL,
	"acknowledgedITAR" boolean NOT NULL,
	"active" boolean,
	"admin" boolean,
	"avatarUrl" text,
	"createdAt" timestamp with time zone NOT NULL,
	"developer" boolean,
	"email" text NOT NULL,
	"firstName" text NOT NULL,
	"flags" jsonb NOT NULL,
	"fullName" text,
	"id" text PRIMARY KEY NOT NULL,
	"isConsoleOperator" boolean NOT NULL,
	"lastName" text NOT NULL,
	"phone" text,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "userToCompany" (
	"companyId" text NOT NULL,
	"role" "role" NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "userToCompany" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouse" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"locationId" text NOT NULL,
	"name" text NOT NULL,
	"requiresBin" boolean NOT NULL,
	"requiresPick" boolean NOT NULL,
	"requiresPutAway" boolean NOT NULL,
	"requiresReceive" boolean NOT NULL,
	"requiresShipment" boolean NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "warehouse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouseTransferLine" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"fromLocationId" text NOT NULL,
	"fromStorageUnitId" text,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"notes" text,
	"quantity" numeric NOT NULL,
	"receivedQuantity" numeric NOT NULL,
	"shippedQuantity" numeric NOT NULL,
	"toLocationId" text NOT NULL,
	"toStorageUnitId" text,
	"transferId" text NOT NULL,
	"unitOfMeasureCode" text,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouseTransfer" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"expectedReceiptDate" date,
	"fromLocationId" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"notes" text,
	"reference" text,
	"status" "warehouseTransferStatus" NOT NULL,
	"tags" text[],
	"toLocationId" text NOT NULL,
	"transferDate" date,
	"transferId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "warehouseTransfer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"errorCount" numeric NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lastError" text,
	"lastSuccess" text,
	"name" text NOT NULL,
	"onDelete" boolean NOT NULL,
	"onInsert" boolean NOT NULL,
	"onUpdate" boolean NOT NULL,
	"successCount" numeric NOT NULL,
	"table" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhookTable" (
	"module" "module" NOT NULL,
	"name" text NOT NULL,
	"table" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workCenterProcess" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"processId" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workCenterProcess" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workCenterReplacementPart" (
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unitOfMeasureCode" text NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" text,
	"workCenterId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workCenterReplacementPart" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workCenter" (
	"active" boolean NOT NULL,
	"companyId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"createdBy" text NOT NULL,
	"customFields" jsonb,
	"defaultStandardFactor" "factor" NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"laborRate" numeric NOT NULL,
	"locationId" text,
	"machineRate" numeric NOT NULL,
	"name" text NOT NULL,
	"overheadRate" numeric NOT NULL,
	"requiredAbilityId" text,
	"tags" text[],
	"updatedAt" timestamp with time zone,
	"updatedBy" text
);
--> statement-breakpoint
ALTER TABLE "workCenter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ability" ADD CONSTRAINT "ability_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ability" ADD CONSTRAINT "ability_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ability" ADD CONSTRAINT "ability_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_accumulatedDepreciationAccount_account_id_fk" FOREIGN KEY ("accumulatedDepreciationAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_accumulatedDepreciationOnDisposalAccount_account_id_fk" FOREIGN KEY ("accumulatedDepreciationOnDisposalAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_assetAquisitionCostAccount_account_id_fk" FOREIGN KEY ("assetAquisitionCostAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_assetAquisitionCostOnDisposalAccount_account_id_fk" FOREIGN KEY ("assetAquisitionCostOnDisposalAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_assetDepreciationExpenseAccount_account_id_fk" FOREIGN KEY ("assetDepreciationExpenseAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_assetGainsAndLossesAccount_account_id_fk" FOREIGN KEY ("assetGainsAndLossesAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_bankCashAccount_account_id_fk" FOREIGN KEY ("bankCashAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_bankForeignCurrencyAccount_account_id_fk" FOREIGN KEY ("bankForeignCurrencyAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_bankLocalCurrencyAccount_account_id_fk" FOREIGN KEY ("bankLocalCurrencyAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_costOfGoodsSoldAccount_account_id_fk" FOREIGN KEY ("costOfGoodsSoldAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_currencyTranslationAccount_account_id_fk" FOREIGN KEY ("currencyTranslationAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_customerPaymentDiscountAccount_account_id_fk" FOREIGN KEY ("customerPaymentDiscountAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_goodsReceivedNotInvoicedAccount_account_id_fk" FOREIGN KEY ("goodsReceivedNotInvoicedAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_indirectCostAccount_account_id_fk" FOREIGN KEY ("indirectCostAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_interestAccount_account_id_fk" FOREIGN KEY ("interestAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_inventoryAccount_account_id_fk" FOREIGN KEY ("inventoryAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_inventoryAdjustmentVarianceAccount_account_id_fk" FOREIGN KEY ("inventoryAdjustmentVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_inventoryShippedNotInvoicedAccount_account_id_fk" FOREIGN KEY ("inventoryShippedNotInvoicedAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_laborAbsorptionAccount_account_id_fk" FOREIGN KEY ("laborAbsorptionAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_laborAndMachineVarianceAccount_account_id_fk" FOREIGN KEY ("laborAndMachineVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_lotSizeVarianceAccount_account_id_fk" FOREIGN KEY ("lotSizeVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_maintenanceAccount_account_id_fk" FOREIGN KEY ("maintenanceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_materialVarianceAccount_account_id_fk" FOREIGN KEY ("materialVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_overheadVarianceAccount_account_id_fk" FOREIGN KEY ("overheadVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_payablesAccount_account_id_fk" FOREIGN KEY ("payablesAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_prepaymentAccount_account_id_fk" FOREIGN KEY ("prepaymentAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_purchaseTaxPayableAccount_account_id_fk" FOREIGN KEY ("purchaseTaxPayableAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_purchaseVarianceAccount_account_id_fk" FOREIGN KEY ("purchaseVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_receivablesAccount_account_id_fk" FOREIGN KEY ("receivablesAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_retainedEarningsAccount_account_id_fk" FOREIGN KEY ("retainedEarningsAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_reverseChargeSalesTaxPayableAccount_account_id_fk" FOREIGN KEY ("reverseChargeSalesTaxPayableAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_roundingAccount_account_id_fk" FOREIGN KEY ("roundingAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_salesAccount_account_id_fk" FOREIGN KEY ("salesAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_salesDiscountAccount_account_id_fk" FOREIGN KEY ("salesDiscountAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_salesTaxPayableAccount_account_id_fk" FOREIGN KEY ("salesTaxPayableAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_serviceChargeAccount_account_id_fk" FOREIGN KEY ("serviceChargeAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_subcontractingVarianceAccount_account_id_fk" FOREIGN KEY ("subcontractingVarianceAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_supplierPaymentDiscountAccount_account_id_fk" FOREIGN KEY ("supplierPaymentDiscountAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountDefault" ADD CONSTRAINT "accountDefault_workInProgressAccount_account_id_fk" FOREIGN KEY ("workInProgressAccount") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountingPeriod" ADD CONSTRAINT "accountingPeriod_closedBy_user_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountingPeriod" ADD CONSTRAINT "accountingPeriod_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountingPeriod" ADD CONSTRAINT "accountingPeriod_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountingPeriod" ADD CONSTRAINT "accountingPeriod_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address" ADD CONSTRAINT "address_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address" ADD CONSTRAINT "address_countryCode_country_alpha2_fk" FOREIGN KEY ("countryCode") REFERENCES "public"."country"("alpha2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiKeyRateLimit" ADD CONSTRAINT "apiKeyRateLimit_apiKeyId_apiKey_id_fk" FOREIGN KEY ("apiKeyId") REFERENCES "public"."apiKey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_decisionBy_user_id_fk" FOREIGN KEY ("decisionBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_requestedBy_user_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRule" ADD CONSTRAINT "approvalRule_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRule" ADD CONSTRAINT "approvalRule_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRule" ADD CONSTRAINT "approvalRule_defaultApproverId_user_id_fk" FOREIGN KEY ("defaultApproverId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvalRule" ADD CONSTRAINT "approvalRule_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditLogArchive" ADD CONSTRAINT "auditLogArchive_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batchProperty" ADD CONSTRAINT "batchProperty_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batchProperty" ADD CONSTRAINT "batchProperty_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batchProperty" ADD CONSTRAINT "batchProperty_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batchProperty" ADD CONSTRAINT "batchProperty_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challengeAttempt" ADD CONSTRAINT "challengeAttempt_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyAccountsPayableBillingAddress" ADD CONSTRAINT "companyAccountsPayableBillingAddress_id_company_id_fk" FOREIGN KEY ("id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyAccountsReceivableBillingAddress" ADD CONSTRAINT "companyAccountsReceivableBillingAddress_id_company_id_fk" FOREIGN KEY ("id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyGroup" ADD CONSTRAINT "companyGroup_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyGroup" ADD CONSTRAINT "companyGroup_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyGroup" ADD CONSTRAINT "companyGroup_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyIntegration" ADD CONSTRAINT "companyIntegration_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyIntegration" ADD CONSTRAINT "companyIntegration_id_integration_id_fk" FOREIGN KEY ("id") REFERENCES "public"."integration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyPlan" ADD CONSTRAINT "companyPlan_id_company_id_fk" FOREIGN KEY ("id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyPlan" ADD CONSTRAINT "companyPlan_planId_plan_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companySettings" ADD CONSTRAINT "companySettings_id_company_id_fk" FOREIGN KEY ("id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_baseCurrencyCode_currencyCode_code_fk" FOREIGN KEY ("baseCurrencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companyUsage" ADD CONSTRAINT "companyUsage_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameterGroup" ADD CONSTRAINT "configurationParameterGroup_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameterGroup" ADD CONSTRAINT "configurationParameterGroup_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameter" ADD CONSTRAINT "configurationParameter_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameter" ADD CONSTRAINT "configurationParameter_configurationParameterGroupId_configurationParameterGroup_id_fk" FOREIGN KEY ("configurationParameterGroupId") REFERENCES "public"."configurationParameterGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameter" ADD CONSTRAINT "configurationParameter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameter" ADD CONSTRAINT "configurationParameter_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameter" ADD CONSTRAINT "configurationParameter_materialFormFilterId_materialForm_id_fk" FOREIGN KEY ("materialFormFilterId") REFERENCES "public"."materialForm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationParameter" ADD CONSTRAINT "configurationParameter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationRule" ADD CONSTRAINT "configurationRule_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationRule" ADD CONSTRAINT "configurationRule_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurationRule" ADD CONSTRAINT "configurationRule_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable" ADD CONSTRAINT "consumable_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable" ADD CONSTRAINT "consumable_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable" ADD CONSTRAINT "consumable_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable" ADD CONSTRAINT "consumable_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractorAbility" ADD CONSTRAINT "contractorAbility_abilityId_ability_id_fk" FOREIGN KEY ("abilityId") REFERENCES "public"."ability"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractorAbility" ADD CONSTRAINT "contractorAbility_contractorId_contractor_id_fk" FOREIGN KEY ("contractorId") REFERENCES "public"."contractor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractorAbility" ADD CONSTRAINT "contractorAbility_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_id_supplierContact_id_fk" FOREIGN KEY ("id") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costCenter" ADD CONSTRAINT "costCenter_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costCenter" ADD CONSTRAINT "costCenter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costCenter" ADD CONSTRAINT "costCenter_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costCenter" ADD CONSTRAINT "costCenter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costLedger" ADD CONSTRAINT "costLedger_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costLedger" ADD CONSTRAINT "costLedger_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency" ADD CONSTRAINT "currency_code_currencyCode_code_fk" FOREIGN KEY ("code") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency" ADD CONSTRAINT "currency_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency" ADD CONSTRAINT "currency_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customField" ADD CONSTRAINT "customField_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customField" ADD CONSTRAINT "customField_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customField" ADD CONSTRAINT "customField_dataTypeId_attributeDataType_id_fk" FOREIGN KEY ("dataTypeId") REFERENCES "public"."attributeDataType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customField" ADD CONSTRAINT "customField_table_customFieldTable_table_fk" FOREIGN KEY ("table") REFERENCES "public"."customFieldTable"("table") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customField" ADD CONSTRAINT "customField_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerAccount" ADD CONSTRAINT "customerAccount_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerAccount" ADD CONSTRAINT "customerAccount_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerAccount" ADD CONSTRAINT "customerAccount_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerContact" ADD CONSTRAINT "customerContact_contactId_contact_id_fk" FOREIGN KEY ("contactId") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerContact" ADD CONSTRAINT "customerContact_customerLocationId_customerLocation_id_fk" FOREIGN KEY ("customerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerContact" ADD CONSTRAINT "customerContact_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverrideBreak" ADD CONSTRAINT "customerItemPriceOverrideBreak_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverrideBreak" ADD CONSTRAINT "customerItemPriceOverrideBreak_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverrideBreak" ADD CONSTRAINT "customerItemPriceOverrideBreak_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ADD CONSTRAINT "customerItemPriceOverride_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ADD CONSTRAINT "customerItemPriceOverride_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ADD CONSTRAINT "customerItemPriceOverride_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ADD CONSTRAINT "customerItemPriceOverride_customerTypeId_customerType_id_fk" FOREIGN KEY ("customerTypeId") REFERENCES "public"."customerType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ADD CONSTRAINT "customerItemPriceOverride_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerItemPriceOverride" ADD CONSTRAINT "customerItemPriceOverride_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerLocation" ADD CONSTRAINT "customerLocation_addressId_address_id_fk" FOREIGN KEY ("addressId") REFERENCES "public"."address"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPartToItem" ADD CONSTRAINT "customerPartToItem_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPartToItem" ADD CONSTRAINT "customerPartToItem_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPartToItem" ADD CONSTRAINT "customerPartToItem_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_invoiceCustomerContactId_customerContact_id_fk" FOREIGN KEY ("invoiceCustomerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_invoiceCustomerId_customer_id_fk" FOREIGN KEY ("invoiceCustomerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_invoiceCustomerLocationId_customerLocation_id_fk" FOREIGN KEY ("invoiceCustomerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerPayment" ADD CONSTRAINT "customerPayment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_shippingCustomerContactId_customerContact_id_fk" FOREIGN KEY ("shippingCustomerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_shippingCustomerId_customer_id_fk" FOREIGN KEY ("shippingCustomerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_shippingCustomerLocationId_customerLocation_id_fk" FOREIGN KEY ("shippingCustomerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_shippingTermId_shippingTerm_id_fk" FOREIGN KEY ("shippingTermId") REFERENCES "public"."shippingTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerShipping" ADD CONSTRAINT "customerShipping_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerStatus" ADD CONSTRAINT "customerStatus_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerStatus" ADD CONSTRAINT "customerStatus_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerStatus" ADD CONSTRAINT "customerStatus_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_accountManagerId_user_id_fk" FOREIGN KEY ("accountManagerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_customerStatusId_customerStatus_id_fk" FOREIGN KEY ("customerStatusId") REFERENCES "public"."customerStatus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_customerTypeId_customerType_id_fk" FOREIGN KEY ("customerTypeId") REFERENCES "public"."customerType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_intercompanyCompanyId_company_id_fk" FOREIGN KEY ("intercompanyCompanyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_salesContactId_customerContact_id_fk" FOREIGN KEY ("salesContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerTax" ADD CONSTRAINT "customerTax_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerTax" ADD CONSTRAINT "customerTax_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerTax" ADD CONSTRAINT "customerTax_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerType" ADD CONSTRAINT "customerType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerType" ADD CONSTRAINT "customerType_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerType" ADD CONSTRAINT "customerType_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandActual" ADD CONSTRAINT "demandActual_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandActual" ADD CONSTRAINT "demandActual_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandActual" ADD CONSTRAINT "demandActual_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandActual" ADD CONSTRAINT "demandActual_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandActual" ADD CONSTRAINT "demandActual_periodId_period_id_fk" FOREIGN KEY ("periodId") REFERENCES "public"."period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandActual" ADD CONSTRAINT "demandActual_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandForecast" ADD CONSTRAINT "demandForecast_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandForecast" ADD CONSTRAINT "demandForecast_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandForecast" ADD CONSTRAINT "demandForecast_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandForecast" ADD CONSTRAINT "demandForecast_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandForecast" ADD CONSTRAINT "demandForecast_periodId_period_id_fk" FOREIGN KEY ("periodId") REFERENCES "public"."period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandForecast" ADD CONSTRAINT "demandForecast_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandProjection" ADD CONSTRAINT "demandProjection_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandProjection" ADD CONSTRAINT "demandProjection_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandProjection" ADD CONSTRAINT "demandProjection_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandProjection" ADD CONSTRAINT "demandProjection_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandProjection" ADD CONSTRAINT "demandProjection_periodId_period_id_fk" FOREIGN KEY ("periodId") REFERENCES "public"."period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandProjection" ADD CONSTRAINT "demandProjection_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension" ADD CONSTRAINT "dimension_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension" ADD CONSTRAINT "dimension_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension" ADD CONSTRAINT "dimension_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimensionValue" ADD CONSTRAINT "dimensionValue_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimensionValue" ADD CONSTRAINT "dimensionValue_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimensionValue" ADD CONSTRAINT "dimensionValue_dimensionId_dimension_id_fk" FOREIGN KEY ("dimensionId") REFERENCES "public"."dimension"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimensionValue" ADD CONSTRAINT "dimensionValue_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentFavorite" ADD CONSTRAINT "documentFavorite_documentId_document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentFavorite" ADD CONSTRAINT "documentFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentLabel" ADD CONSTRAINT "documentLabel_documentId_document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentLabel" ADD CONSTRAINT "documentLabel_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentTransaction" ADD CONSTRAINT "documentTransaction_documentId_document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentTransaction" ADD CONSTRAINT "documentTransaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeAbility" ADD CONSTRAINT "employeeAbility_abilityId_ability_id_fk" FOREIGN KEY ("abilityId") REFERENCES "public"."ability"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeAbility" ADD CONSTRAINT "employeeAbility_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_departmentId_department_id_fk" FOREIGN KEY ("departmentId") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_managerId_user_id_fk" FOREIGN KEY ("managerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_shiftId_shift_id_fk" FOREIGN KEY ("shiftId") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeJob" ADD CONSTRAINT "employeeJob_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeShift" ADD CONSTRAINT "employeeShift_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeShift" ADD CONSTRAINT "employeeShift_shiftId_shift_id_fk" FOREIGN KEY ("shiftId") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_employeeTypeId_employeeType_id_fk" FOREIGN KEY ("employeeTypeId") REFERENCES "public"."employeeType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeTypePermission" ADD CONSTRAINT "employeeTypePermission_employeeTypeId_employeeType_id_fk" FOREIGN KEY ("employeeTypeId") REFERENCES "public"."employeeType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employeeType" ADD CONSTRAINT "employeeType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventSystemSubscription" ADD CONSTRAINT "eventSystemSubscription_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchangeRateHistory" ADD CONSTRAINT "exchangeRateHistory_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchangeRateHistory" ADD CONSTRAINT "exchangeRateHistory_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externalIntegrationMapping" ADD CONSTRAINT "externalIntegrationMapping_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externalIntegrationMapping" ADD CONSTRAINT "externalIntegrationMapping_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externalLink" ADD CONSTRAINT "externalLink_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externalLink" ADD CONSTRAINT "externalLink_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externalLink" ADD CONSTRAINT "externalLink_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscalYearSettings" ADD CONSTRAINT "fiscalYearSettings_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscalYearSettings" ADD CONSTRAINT "fiscalYearSettings_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment" ADD CONSTRAINT "fulfillment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment" ADD CONSTRAINT "fulfillment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment" ADD CONSTRAINT "fulfillment_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment" ADD CONSTRAINT "fulfillment_salesOrderLineId_salesOrderLine_id_fk" FOREIGN KEY ("salesOrderLineId") REFERENCES "public"."salesOrderLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_gaugeId_gauge_id_fk" FOREIGN KEY ("gaugeId") REFERENCES "public"."gauge"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeCalibrationRecord" ADD CONSTRAINT "gaugeCalibrationRecord_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_gaugeTypeId_gaugeType_id_fk" FOREIGN KEY ("gaugeTypeId") REFERENCES "public"."gaugeType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauge" ADD CONSTRAINT "gauge_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeType" ADD CONSTRAINT "gaugeType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeType" ADD CONSTRAINT "gaugeType_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaugeType" ADD CONSTRAINT "gaugeType_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionHistory" ADD CONSTRAINT "inboundInspectionHistory_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionHistory" ADD CONSTRAINT "inboundInspectionHistory_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionHistory" ADD CONSTRAINT "inboundInspectionHistory_inboundInspectionId_inboundInspection_id_fk" FOREIGN KEY ("inboundInspectionId") REFERENCES "public"."inboundInspection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionHistory" ADD CONSTRAINT "inboundInspectionHistory_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionHistory" ADD CONSTRAINT "inboundInspectionHistory_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ADD CONSTRAINT "inboundInspectionSample_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ADD CONSTRAINT "inboundInspectionSample_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ADD CONSTRAINT "inboundInspectionSample_inboundInspectionId_inboundInspection_id_fk" FOREIGN KEY ("inboundInspectionId") REFERENCES "public"."inboundInspection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ADD CONSTRAINT "inboundInspectionSample_inspectedBy_user_id_fk" FOREIGN KEY ("inspectedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ADD CONSTRAINT "inboundInspectionSample_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspectionSample" ADD CONSTRAINT "inboundInspectionSample_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_dispositionedBy_user_id_fk" FOREIGN KEY ("dispositionedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_receiptId_receipt_id_fk" FOREIGN KEY ("receiptId") REFERENCES "public"."receipt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_receiptLineId_receiptLine_id_fk" FOREIGN KEY ("receiptLineId") REFERENCES "public"."receiptLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inboundInspection" ADD CONSTRAINT "inboundInspection_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ADD CONSTRAINT "intercompanyTransaction_companyGroupId_companyGroup_id_fk" FOREIGN KEY ("companyGroupId") REFERENCES "public"."companyGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ADD CONSTRAINT "intercompanyTransaction_eliminationJournalId_journal_id_fk" FOREIGN KEY ("eliminationJournalId") REFERENCES "public"."journal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ADD CONSTRAINT "intercompanyTransaction_sourceCompanyId_company_id_fk" FOREIGN KEY ("sourceCompanyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ADD CONSTRAINT "intercompanyTransaction_sourceJournalLineId_journalLine_id_fk" FOREIGN KEY ("sourceJournalLineId") REFERENCES "public"."journalLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ADD CONSTRAINT "intercompanyTransaction_targetCompanyId_company_id_fk" FOREIGN KEY ("targetCompanyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompanyTransaction" ADD CONSTRAINT "intercompanyTransaction_targetJournalLineId_journalLine_id_fk" FOREIGN KEY ("targetJournalLineId") REFERENCES "public"."journalLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemCost" ADD CONSTRAINT "itemCost_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemCost" ADD CONSTRAINT "itemCost_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemCost" ADD CONSTRAINT "itemCost_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemCost" ADD CONSTRAINT "itemCost_itemPostingGroupId_itemPostingGroup_id_fk" FOREIGN KEY ("itemPostingGroupId") REFERENCES "public"."itemPostingGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemCost" ADD CONSTRAINT "itemCost_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemLedger" ADD CONSTRAINT "itemLedger_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemLedger" ADD CONSTRAINT "itemLedger_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemLedger" ADD CONSTRAINT "itemLedger_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemLedger" ADD CONSTRAINT "itemLedger_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemLedger" ADD CONSTRAINT "itemLedger_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemLedger" ADD CONSTRAINT "itemLedger_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPlanning" ADD CONSTRAINT "itemPlanning_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPlanning" ADD CONSTRAINT "itemPlanning_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPlanning" ADD CONSTRAINT "itemPlanning_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPlanning" ADD CONSTRAINT "itemPlanning_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPlanning" ADD CONSTRAINT "itemPlanning_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPostingGroup" ADD CONSTRAINT "itemPostingGroup_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPostingGroup" ADD CONSTRAINT "itemPostingGroup_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemPostingGroup" ADD CONSTRAINT "itemPostingGroup_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemReplenishment" ADD CONSTRAINT "itemReplenishment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemReplenishment" ADD CONSTRAINT "itemReplenishment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemReplenishment" ADD CONSTRAINT "itemReplenishment_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemReplenishment" ADD CONSTRAINT "itemReplenishment_preferredSupplierId_supplier_id_fk" FOREIGN KEY ("preferredSupplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemReplenishment" ADD CONSTRAINT "itemReplenishment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRuleAssignment" ADD CONSTRAINT "itemRuleAssignment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRuleAssignment" ADD CONSTRAINT "itemRuleAssignment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRuleAssignment" ADD CONSTRAINT "itemRuleAssignment_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRuleAssignment" ADD CONSTRAINT "itemRuleAssignment_ruleId_itemRule_id_fk" FOREIGN KEY ("ruleId") REFERENCES "public"."itemRule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRule" ADD CONSTRAINT "itemRule_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRule" ADD CONSTRAINT "itemRule_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemRule" ADD CONSTRAINT "itemRule_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemSamplingPlan" ADD CONSTRAINT "itemSamplingPlan_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemSamplingPlan" ADD CONSTRAINT "itemSamplingPlan_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemSamplingPlan" ADD CONSTRAINT "itemSamplingPlan_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemSamplingPlan" ADD CONSTRAINT "itemSamplingPlan_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemShelfLife" ADD CONSTRAINT "itemShelfLife_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemShelfLife" ADD CONSTRAINT "itemShelfLife_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemShelfLife" ADD CONSTRAINT "itemShelfLife_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemShelfLife" ADD CONSTRAINT "itemShelfLife_triggerProcessId_process_id_fk" FOREIGN KEY ("triggerProcessId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemShelfLife" ADD CONSTRAINT "itemShelfLife_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_modelUploadId_modelUpload_id_fk" FOREIGN KEY ("modelUploadId") REFERENCES "public"."modelUpload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemUnitSalePrice" ADD CONSTRAINT "itemUnitSalePrice_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemUnitSalePrice" ADD CONSTRAINT "itemUnitSalePrice_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemUnitSalePrice" ADD CONSTRAINT "itemUnitSalePrice_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemUnitSalePrice" ADD CONSTRAINT "itemUnitSalePrice_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itemUnitSalePrice" ADD CONSTRAINT "itemUnitSalePrice_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobFavorite" ADD CONSTRAINT "jobFavorite_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobFavorite" ADD CONSTRAINT "jobFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_parentMaterialId_jobMaterial_id_fk" FOREIGN KEY ("parentMaterialId") REFERENCES "public"."jobMaterial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMakeMethod" ADD CONSTRAINT "jobMakeMethod_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_jobOperationId_jobOperation_id_fk" FOREIGN KEY ("jobOperationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationDependency" ADD CONSTRAINT "jobOperationDependency_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationDependency" ADD CONSTRAINT "jobOperationDependency_dependsOnId_jobOperation_id_fk" FOREIGN KEY ("dependsOnId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationDependency" ADD CONSTRAINT "jobOperationDependency_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationDependency" ADD CONSTRAINT "jobOperationDependency_operationId_jobOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationNote" ADD CONSTRAINT "jobOperationNote_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationNote" ADD CONSTRAINT "jobOperationNote_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationNote" ADD CONSTRAINT "jobOperationNote_productionQuantityId_productionQuantity_id_fk" FOREIGN KEY ("productionQuantityId") REFERENCES "public"."productionQuantity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationNote" ADD CONSTRAINT "jobOperationNote_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationParameter" ADD CONSTRAINT "jobOperationParameter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationParameter" ADD CONSTRAINT "jobOperationParameter_operationId_jobOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationParameter" ADD CONSTRAINT "jobOperationParameter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStepRecord" ADD CONSTRAINT "jobOperationStepRecord_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStepRecord" ADD CONSTRAINT "jobOperationStepRecord_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStepRecord" ADD CONSTRAINT "jobOperationStepRecord_jobOperationStepId_jobOperationStep_id_fk" FOREIGN KEY ("jobOperationStepId") REFERENCES "public"."jobOperationStep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStepRecord" ADD CONSTRAINT "jobOperationStepRecord_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStepRecord" ADD CONSTRAINT "jobOperationStepRecord_userValue_user_id_fk" FOREIGN KEY ("userValue") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStep" ADD CONSTRAINT "jobOperationStep_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStep" ADD CONSTRAINT "jobOperationStep_nonConformanceActionId_nonConformanceActionTask_id_fk" FOREIGN KEY ("nonConformanceActionId") REFERENCES "public"."nonConformanceActionTask"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStep" ADD CONSTRAINT "jobOperationStep_operationId_jobOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationStep" ADD CONSTRAINT "jobOperationStep_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperation" ADD CONSTRAINT "jobOperation_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationTool" ADD CONSTRAINT "jobOperationTool_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationTool" ADD CONSTRAINT "jobOperationTool_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationTool" ADD CONSTRAINT "jobOperationTool_operationId_jobOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationTool" ADD CONSTRAINT "jobOperationTool_toolId_item_id_fk" FOREIGN KEY ("toolId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobOperationTool" ADD CONSTRAINT "jobOperationTool_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_salesOrderLineId_salesOrderLine_id_fk" FOREIGN KEY ("salesOrderLineId") REFERENCES "public"."salesOrderLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLineDimension" ADD CONSTRAINT "journalLineDimension_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLineDimension" ADD CONSTRAINT "journalLineDimension_dimensionId_dimension_id_fk" FOREIGN KEY ("dimensionId") REFERENCES "public"."dimension"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLineDimension" ADD CONSTRAINT "journalLineDimension_journalLineId_journalLine_id_fk" FOREIGN KEY ("journalLineId") REFERENCES "public"."journalLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLine" ADD CONSTRAINT "journalLine_accountId_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLine" ADD CONSTRAINT "journalLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLine" ADD CONSTRAINT "journalLine_intercompanyPartnerId_company_id_fk" FOREIGN KEY ("intercompanyPartnerId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLine" ADD CONSTRAINT "journalLine_journalId_journal_id_fk" FOREIGN KEY ("journalId") REFERENCES "public"."journal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journalLine" ADD CONSTRAINT "journalLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_accountingPeriodId_accountingPeriod_id_fk" FOREIGN KEY ("accountingPeriodId") REFERENCES "public"."accountingPeriod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_postedBy_user_id_fk" FOREIGN KEY ("postedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban" ADD CONSTRAINT "kanban_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessonCompletion" ADD CONSTRAINT "lessonCompletion_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchComment" ADD CONSTRAINT "maintenanceDispatchComment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchComment" ADD CONSTRAINT "maintenanceDispatchComment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchComment" ADD CONSTRAINT "maintenanceDispatchComment_maintenanceDispatchId_maintenanceDispatch_id_fk" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "public"."maintenanceDispatch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchComment" ADD CONSTRAINT "maintenanceDispatchComment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ADD CONSTRAINT "maintenanceDispatchEvent_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ADD CONSTRAINT "maintenanceDispatchEvent_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ADD CONSTRAINT "maintenanceDispatchEvent_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ADD CONSTRAINT "maintenanceDispatchEvent_maintenanceDispatchId_maintenanceDispatch_id_fk" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "public"."maintenanceDispatch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ADD CONSTRAINT "maintenanceDispatchEvent_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchEvent" ADD CONSTRAINT "maintenanceDispatchEvent_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItem" ADD CONSTRAINT "maintenanceDispatchItem_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItem" ADD CONSTRAINT "maintenanceDispatchItem_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItem" ADD CONSTRAINT "maintenanceDispatchItem_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItem" ADD CONSTRAINT "maintenanceDispatchItem_maintenanceDispatchId_maintenanceDispatch_id_fk" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "public"."maintenanceDispatch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItem" ADD CONSTRAINT "maintenanceDispatchItem_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItemTrackedEntity" ADD CONSTRAINT "maintenanceDispatchItemTrackedEntity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItemTrackedEntity" ADD CONSTRAINT "maintenanceDispatchItemTrackedEntity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItemTrackedEntity" ADD CONSTRAINT "maintenanceDispatchItemTrackedEntity_maintenanceDispatchItemId_maintenanceDispatchItem_id_fk" FOREIGN KEY ("maintenanceDispatchItemId") REFERENCES "public"."maintenanceDispatchItem"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItemTrackedEntity" ADD CONSTRAINT "maintenanceDispatchItemTrackedEntity_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchItemTrackedEntity" ADD CONSTRAINT "maintenanceDispatchItemTrackedEntity_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_actualFailureModeId_maintenanceFailureMode_id_fk" FOREIGN KEY ("actualFailureModeId") REFERENCES "public"."maintenanceFailureMode"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_maintenanceScheduleId_maintenanceSchedule_id_fk" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "public"."maintenanceSchedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_suspectedFailureModeId_maintenanceFailureMode_id_fk" FOREIGN KEY ("suspectedFailureModeId") REFERENCES "public"."maintenanceFailureMode"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatch" ADD CONSTRAINT "maintenanceDispatch_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchWorkCenter" ADD CONSTRAINT "maintenanceDispatchWorkCenter_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchWorkCenter" ADD CONSTRAINT "maintenanceDispatchWorkCenter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchWorkCenter" ADD CONSTRAINT "maintenanceDispatchWorkCenter_maintenanceDispatchId_maintenanceDispatch_id_fk" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "public"."maintenanceDispatch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchWorkCenter" ADD CONSTRAINT "maintenanceDispatchWorkCenter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceDispatchWorkCenter" ADD CONSTRAINT "maintenanceDispatchWorkCenter_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceFailureMode" ADD CONSTRAINT "maintenanceFailureMode_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceFailureMode" ADD CONSTRAINT "maintenanceFailureMode_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceFailureMode" ADD CONSTRAINT "maintenanceFailureMode_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceScheduleItem" ADD CONSTRAINT "maintenanceScheduleItem_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceScheduleItem" ADD CONSTRAINT "maintenanceScheduleItem_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceScheduleItem" ADD CONSTRAINT "maintenanceScheduleItem_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceScheduleItem" ADD CONSTRAINT "maintenanceScheduleItem_maintenanceScheduleId_maintenanceSchedule_id_fk" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "public"."maintenanceSchedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceScheduleItem" ADD CONSTRAINT "maintenanceScheduleItem_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ADD CONSTRAINT "maintenanceSchedule_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ADD CONSTRAINT "maintenanceSchedule_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ADD CONSTRAINT "maintenanceSchedule_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ADD CONSTRAINT "maintenanceSchedule_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ADD CONSTRAINT "maintenanceSchedule_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceSchedule" ADD CONSTRAINT "maintenanceSchedule_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeMethod" ADD CONSTRAINT "makeMethod_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeMethod" ADD CONSTRAINT "makeMethod_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeMethod" ADD CONSTRAINT "makeMethod_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialDimension" ADD CONSTRAINT "materialDimension_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialDimension" ADD CONSTRAINT "materialDimension_materialFormId_materialForm_id_fk" FOREIGN KEY ("materialFormId") REFERENCES "public"."materialForm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialFinish" ADD CONSTRAINT "materialFinish_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialFinish" ADD CONSTRAINT "materialFinish_materialSubstanceId_materialSubstance_id_fk" FOREIGN KEY ("materialSubstanceId") REFERENCES "public"."materialSubstance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialForm" ADD CONSTRAINT "materialForm_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialForm" ADD CONSTRAINT "materialForm_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialForm" ADD CONSTRAINT "materialForm_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialGrade" ADD CONSTRAINT "materialGrade_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialGrade" ADD CONSTRAINT "materialGrade_materialSubstanceId_materialSubstance_id_fk" FOREIGN KEY ("materialSubstanceId") REFERENCES "public"."materialSubstance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialSubstance" ADD CONSTRAINT "materialSubstance_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialSubstance" ADD CONSTRAINT "materialSubstance_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialSubstance" ADD CONSTRAINT "materialSubstance_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_dimensionId_materialDimension_id_fk" FOREIGN KEY ("dimensionId") REFERENCES "public"."materialDimension"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_finishId_materialFinish_id_fk" FOREIGN KEY ("finishId") REFERENCES "public"."materialFinish"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_gradeId_materialGrade_id_fk" FOREIGN KEY ("gradeId") REFERENCES "public"."materialGrade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_materialFormId_materialForm_id_fk" FOREIGN KEY ("materialFormId") REFERENCES "public"."materialForm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_materialSubstanceId_materialSubstance_id_fk" FOREIGN KEY ("materialSubstanceId") REFERENCES "public"."materialSubstance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_materialTypeId_materialType_id_fk" FOREIGN KEY ("materialTypeId") REFERENCES "public"."materialType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialType" ADD CONSTRAINT "materialType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialType" ADD CONSTRAINT "materialType_materialFormId_materialForm_id_fk" FOREIGN KEY ("materialFormId") REFERENCES "public"."materialForm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materialType" ADD CONSTRAINT "materialType_materialSubstanceId_materialSubstance_id_fk" FOREIGN KEY ("materialSubstanceId") REFERENCES "public"."materialSubstance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_groupId_group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_memberGroupId_group_id_fk" FOREIGN KEY ("memberGroupId") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_memberUserId_user_id_fk" FOREIGN KEY ("memberUserId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_makeMethodId_makeMethod_id_fk" FOREIGN KEY ("makeMethodId") REFERENCES "public"."makeMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_materialMakeMethodId_makeMethod_id_fk" FOREIGN KEY ("materialMakeMethodId") REFERENCES "public"."makeMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_methodOperationId_methodOperation_id_fk" FOREIGN KEY ("methodOperationId") REFERENCES "public"."methodOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodMaterial" ADD CONSTRAINT "methodMaterial_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationParameter" ADD CONSTRAINT "methodOperationParameter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationParameter" ADD CONSTRAINT "methodOperationParameter_operationId_methodOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."methodOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationParameter" ADD CONSTRAINT "methodOperationParameter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationStep" ADD CONSTRAINT "methodOperationStep_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationStep" ADD CONSTRAINT "methodOperationStep_operationId_methodOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."methodOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationStep" ADD CONSTRAINT "methodOperationStep_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_makeMethodId_makeMethod_id_fk" FOREIGN KEY ("makeMethodId") REFERENCES "public"."makeMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_operationSupplierProcessId_supplierProcess_id_fk" FOREIGN KEY ("operationSupplierProcessId") REFERENCES "public"."supplierProcess"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperation" ADD CONSTRAINT "methodOperation_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationTool" ADD CONSTRAINT "methodOperationTool_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationTool" ADD CONSTRAINT "methodOperationTool_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationTool" ADD CONSTRAINT "methodOperationTool_operationId_methodOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."methodOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationTool" ADD CONSTRAINT "methodOperationTool_toolId_item_id_fk" FOREIGN KEY ("toolId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "methodOperationTool" ADD CONSTRAINT "methodOperationTool_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelUpload" ADD CONSTRAINT "modelUpload_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelUpload" ADD CONSTRAINT "modelUpload_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelUpload" ADD CONSTRAINT "modelUpload_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noQuoteReason" ADD CONSTRAINT "noQuoteReason_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noQuoteReason" ADD CONSTRAINT "noQuoteReason_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noQuoteReason" ADD CONSTRAINT "noQuoteReason_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionProcess" ADD CONSTRAINT "nonConformanceActionProcess_actionTaskId_nonConformanceActionTask_id_fk" FOREIGN KEY ("actionTaskId") REFERENCES "public"."nonConformanceActionTask"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionProcess" ADD CONSTRAINT "nonConformanceActionProcess_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionProcess" ADD CONSTRAINT "nonConformanceActionProcess_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionProcess" ADD CONSTRAINT "nonConformanceActionProcess_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionProcess" ADD CONSTRAINT "nonConformanceActionProcess_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_actionTypeId_nonConformanceRequiredAction_id_fk" FOREIGN KEY ("actionTypeId") REFERENCES "public"."nonConformanceRequiredAction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceActionTask" ADD CONSTRAINT "nonConformanceActionTask_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceApprovalTask" ADD CONSTRAINT "nonConformanceApprovalTask_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceApprovalTask" ADD CONSTRAINT "nonConformanceApprovalTask_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceApprovalTask" ADD CONSTRAINT "nonConformanceApprovalTask_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceApprovalTask" ADD CONSTRAINT "nonConformanceApprovalTask_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceApprovalTask" ADD CONSTRAINT "nonConformanceApprovalTask_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceCustomer" ADD CONSTRAINT "nonConformanceCustomer_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceCustomer" ADD CONSTRAINT "nonConformanceCustomer_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceCustomer" ADD CONSTRAINT "nonConformanceCustomer_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceCustomer" ADD CONSTRAINT "nonConformanceCustomer_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceCustomer" ADD CONSTRAINT "nonConformanceCustomer_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceInboundInspection" ADD CONSTRAINT "nonConformanceInboundInspection_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceInboundInspection" ADD CONSTRAINT "nonConformanceInboundInspection_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceInboundInspection" ADD CONSTRAINT "nonConformanceInboundInspection_inboundInspectionId_inboundInspection_id_fk" FOREIGN KEY ("inboundInspectionId") REFERENCES "public"."inboundInspection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceInboundInspection" ADD CONSTRAINT "nonConformanceInboundInspection_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItem" ADD CONSTRAINT "nonConformanceItem_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItem" ADD CONSTRAINT "nonConformanceItem_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItem" ADD CONSTRAINT "nonConformanceItem_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItem" ADD CONSTRAINT "nonConformanceItem_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItem" ADD CONSTRAINT "nonConformanceItem_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ADD CONSTRAINT "nonConformanceItemTrackedEntity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ADD CONSTRAINT "nonConformanceItemTrackedEntity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ADD CONSTRAINT "nonConformanceItemTrackedEntity_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ADD CONSTRAINT "nonConformanceItemTrackedEntity_nonConformanceItemId_nonConformanceItem_id_fk" FOREIGN KEY ("nonConformanceItemId") REFERENCES "public"."nonConformanceItem"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ADD CONSTRAINT "nonConformanceItemTrackedEntity_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceItemTrackedEntity" ADD CONSTRAINT "nonConformanceItemTrackedEntity_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ADD CONSTRAINT "nonConformanceJobOperation_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ADD CONSTRAINT "nonConformanceJobOperation_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ADD CONSTRAINT "nonConformanceJobOperation_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ADD CONSTRAINT "nonConformanceJobOperation_jobOperationId_jobOperation_id_fk" FOREIGN KEY ("jobOperationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ADD CONSTRAINT "nonConformanceJobOperation_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceJobOperation" ADD CONSTRAINT "nonConformanceJobOperation_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ADD CONSTRAINT "nonConformancePurchaseOrderLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ADD CONSTRAINT "nonConformancePurchaseOrderLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ADD CONSTRAINT "nonConformancePurchaseOrderLine_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ADD CONSTRAINT "nonConformancePurchaseOrderLine_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ADD CONSTRAINT "nonConformancePurchaseOrderLine_purchaseOrderLineId_purchaseOrderLine_id_fk" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "public"."purchaseOrderLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformancePurchaseOrderLine" ADD CONSTRAINT "nonConformancePurchaseOrderLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ADD CONSTRAINT "nonConformanceReceiptLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ADD CONSTRAINT "nonConformanceReceiptLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ADD CONSTRAINT "nonConformanceReceiptLine_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ADD CONSTRAINT "nonConformanceReceiptLine_receiptId_receipt_id_fk" FOREIGN KEY ("receiptId") REFERENCES "public"."receipt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ADD CONSTRAINT "nonConformanceReceiptLine_receiptLineId_receiptLine_id_fk" FOREIGN KEY ("receiptLineId") REFERENCES "public"."receiptLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReceiptLine" ADD CONSTRAINT "nonConformanceReceiptLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceRequiredAction" ADD CONSTRAINT "nonConformanceRequiredAction_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceRequiredAction" ADD CONSTRAINT "nonConformanceRequiredAction_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceRequiredAction" ADD CONSTRAINT "nonConformanceRequiredAction_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReviewer" ADD CONSTRAINT "nonConformanceReviewer_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReviewer" ADD CONSTRAINT "nonConformanceReviewer_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReviewer" ADD CONSTRAINT "nonConformanceReviewer_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReviewer" ADD CONSTRAINT "nonConformanceReviewer_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceReviewer" ADD CONSTRAINT "nonConformanceReviewer_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ADD CONSTRAINT "nonConformanceSalesOrderLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ADD CONSTRAINT "nonConformanceSalesOrderLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ADD CONSTRAINT "nonConformanceSalesOrderLine_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ADD CONSTRAINT "nonConformanceSalesOrderLine_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ADD CONSTRAINT "nonConformanceSalesOrderLine_salesOrderLineId_salesOrderLine_id_fk" FOREIGN KEY ("salesOrderLineId") REFERENCES "public"."salesOrderLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSalesOrderLine" ADD CONSTRAINT "nonConformanceSalesOrderLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ADD CONSTRAINT "nonConformanceShipmentLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ADD CONSTRAINT "nonConformanceShipmentLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ADD CONSTRAINT "nonConformanceShipmentLine_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ADD CONSTRAINT "nonConformanceShipmentLine_shipmentId_shipment_id_fk" FOREIGN KEY ("shipmentId") REFERENCES "public"."shipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ADD CONSTRAINT "nonConformanceShipmentLine_shipmentLineId_shipmentLine_id_fk" FOREIGN KEY ("shipmentLineId") REFERENCES "public"."shipmentLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceShipmentLine" ADD CONSTRAINT "nonConformanceShipmentLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ADD CONSTRAINT "nonConformanceSupplier_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ADD CONSTRAINT "nonConformanceSupplier_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ADD CONSTRAINT "nonConformanceSupplier_externalLinkId_externalLink_id_fk" FOREIGN KEY ("externalLinkId") REFERENCES "public"."externalLink"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ADD CONSTRAINT "nonConformanceSupplier_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ADD CONSTRAINT "nonConformanceSupplier_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceSupplier" ADD CONSTRAINT "nonConformanceSupplier_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_nonConformanceTypeId_nonConformanceType_id_fk" FOREIGN KEY ("nonConformanceTypeId") REFERENCES "public"."nonConformanceType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_nonConformanceWorkflowId_nonConformanceWorkflow_id_fk" FOREIGN KEY ("nonConformanceWorkflowId") REFERENCES "public"."nonConformanceWorkflow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformance" ADD CONSTRAINT "nonConformance_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceTrackedEntity" ADD CONSTRAINT "nonConformanceTrackedEntity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceTrackedEntity" ADD CONSTRAINT "nonConformanceTrackedEntity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceTrackedEntity" ADD CONSTRAINT "nonConformanceTrackedEntity_nonConformanceId_nonConformance_id_fk" FOREIGN KEY ("nonConformanceId") REFERENCES "public"."nonConformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceTrackedEntity" ADD CONSTRAINT "nonConformanceTrackedEntity_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceTrackedEntity" ADD CONSTRAINT "nonConformanceTrackedEntity_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceType" ADD CONSTRAINT "nonConformanceType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceType" ADD CONSTRAINT "nonConformanceType_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceType" ADD CONSTRAINT "nonConformanceType_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceWorkflow" ADD CONSTRAINT "nonConformanceWorkflow_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceWorkflow" ADD CONSTRAINT "nonConformanceWorkflow_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonConformanceWorkflow" ADD CONSTRAINT "nonConformanceWorkflow_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthCode" ADD CONSTRAINT "oauthCode_clientId_oauthClient_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthClient"("clientId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthCode" ADD CONSTRAINT "oauthCode_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthCode" ADD CONSTRAINT "oauthCode_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthToken" ADD CONSTRAINT "oauthToken_clientId_oauthClient_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthClient"("clientId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthToken" ADD CONSTRAINT "oauthToken_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthToken" ADD CONSTRAINT "oauthToken_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ADD CONSTRAINT "partner_abilityId_ability_id_fk" FOREIGN KEY ("abilityId") REFERENCES "public"."ability"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ADD CONSTRAINT "partner_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ADD CONSTRAINT "partner_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ADD CONSTRAINT "partner_id_supplierLocation_id_fk" FOREIGN KEY ("id") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ADD CONSTRAINT "partner_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentTerm" ADD CONSTRAINT "paymentTerm_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentTerm" ADD CONSTRAINT "paymentTerm_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentTerm" ADD CONSTRAINT "paymentTerm_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickMethod" ADD CONSTRAINT "pickMethod_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickMethod" ADD CONSTRAINT "pickMethod_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickMethod" ADD CONSTRAINT "pickMethod_defaultStorageUnitId_storageUnit_id_fk" FOREIGN KEY ("defaultStorageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickMethod" ADD CONSTRAINT "pickMethod_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickMethod" ADD CONSTRAINT "pickMethod_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickMethod" ADD CONSTRAINT "pickMethod_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricingRule" ADD CONSTRAINT "pricingRule_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricingRule" ADD CONSTRAINT "pricingRule_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricingRule" ADD CONSTRAINT "pricingRule_itemPostingGroupId_itemPostingGroup_id_fk" FOREIGN KEY ("itemPostingGroupId") REFERENCES "public"."itemPostingGroup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricingRule" ADD CONSTRAINT "pricingRule_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureParameter" ADD CONSTRAINT "procedureParameter_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureParameter" ADD CONSTRAINT "procedureParameter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureParameter" ADD CONSTRAINT "procedureParameter_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureParameter" ADD CONSTRAINT "procedureParameter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureStep" ADD CONSTRAINT "procedureStep_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureStep" ADD CONSTRAINT "procedureStep_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureStep" ADD CONSTRAINT "procedureStep_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedureStep" ADD CONSTRAINT "procedureStep_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process" ADD CONSTRAINT "process_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process" ADD CONSTRAINT "process_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process" ADD CONSTRAINT "process_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionEvent" ADD CONSTRAINT "productionEvent_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionEvent" ADD CONSTRAINT "productionEvent_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionEvent" ADD CONSTRAINT "productionEvent_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionEvent" ADD CONSTRAINT "productionEvent_jobOperationId_jobOperation_id_fk" FOREIGN KEY ("jobOperationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionEvent" ADD CONSTRAINT "productionEvent_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionEvent" ADD CONSTRAINT "productionEvent_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionQuantity" ADD CONSTRAINT "productionQuantity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionQuantity" ADD CONSTRAINT "productionQuantity_jobOperationId_jobOperation_id_fk" FOREIGN KEY ("jobOperationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionQuantity" ADD CONSTRAINT "productionQuantity_laborProductionEventId_productionEvent_id_fk" FOREIGN KEY ("laborProductionEventId") REFERENCES "public"."productionEvent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionQuantity" ADD CONSTRAINT "productionQuantity_machineProductionEventId_productionEvent_id_fk" FOREIGN KEY ("machineProductionEventId") REFERENCES "public"."productionEvent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionQuantity" ADD CONSTRAINT "productionQuantity_scrapReasonId_scrapReason_id_fk" FOREIGN KEY ("scrapReasonId") REFERENCES "public"."scrapReason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productionQuantity" ADD CONSTRAINT "productionQuantity_setupProductionEventId_productionEvent_id_fk" FOREIGN KEY ("setupProductionEventId") REFERENCES "public"."productionEvent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceDelivery" ADD CONSTRAINT "purchaseInvoiceDelivery_id_purchaseInvoice_id_fk" FOREIGN KEY ("id") REFERENCES "public"."purchaseInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceDelivery" ADD CONSTRAINT "purchaseInvoiceDelivery_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceDelivery" ADD CONSTRAINT "purchaseInvoiceDelivery_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceDelivery" ADD CONSTRAINT "purchaseInvoiceDelivery_shippingTermId_shippingTerm_id_fk" FOREIGN KEY ("shippingTermId") REFERENCES "public"."shippingTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceDelivery" ADD CONSTRAINT "purchaseInvoiceDelivery_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_accountId_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_costCenterId_costCenter_id_fk" FOREIGN KEY ("costCenterId") REFERENCES "public"."costCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_invoiceId_purchaseInvoice_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."purchaseInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_jobOperationId_jobOperation_id_fk" FOREIGN KEY ("jobOperationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_modelUploadId_modelUpload_id_fk" FOREIGN KEY ("modelUploadId") REFERENCES "public"."modelUpload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_purchaseOrderLineId_purchaseOrderLine_id_fk" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "public"."purchaseOrderLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceLine" ADD CONSTRAINT "purchaseInvoiceLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoicePaymentRelation" ADD CONSTRAINT "purchaseInvoicePaymentRelation_invoiceId_purchaseInvoice_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."purchaseInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoicePaymentRelation" ADD CONSTRAINT "purchaseInvoicePaymentRelation_paymentId_purchasePayment_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."purchasePayment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoicePriceChange" ADD CONSTRAINT "purchaseInvoicePriceChange_invoiceId_purchaseInvoice_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."purchaseInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoicePriceChange" ADD CONSTRAINT "purchaseInvoicePriceChange_invoiceLineId_purchaseInvoiceLine_id_fk" FOREIGN KEY ("invoiceLineId") REFERENCES "public"."purchaseInvoiceLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoicePriceChange" ADD CONSTRAINT "purchaseInvoicePriceChange_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoiceStatusHistory" ADD CONSTRAINT "purchaseInvoiceStatusHistory_invoiceId_purchaseInvoice_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."purchaseInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_invoiceSupplierContactId_supplierContact_id_fk" FOREIGN KEY ("invoiceSupplierContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_invoiceSupplierId_supplier_id_fk" FOREIGN KEY ("invoiceSupplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_invoiceSupplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("invoiceSupplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_supplierInteractionId_supplierInteraction_id_fk" FOREIGN KEY ("supplierInteractionId") REFERENCES "public"."supplierInteraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseInvoice" ADD CONSTRAINT "purchaseInvoice_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_customerLocationId_customerLocation_id_fk" FOREIGN KEY ("customerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_id_purchaseOrder_id_fk" FOREIGN KEY ("id") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_shippingTermId_shippingTerm_id_fk" FOREIGN KEY ("shippingTermId") REFERENCES "public"."shippingTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderDelivery" ADD CONSTRAINT "purchaseOrderDelivery_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderFavorite" ADD CONSTRAINT "purchaseOrderFavorite_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderFavorite" ADD CONSTRAINT "purchaseOrderFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_accountId_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_costCenterId_costCenter_id_fk" FOREIGN KEY ("costCenterId") REFERENCES "public"."costCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_jobOperationId_jobOperation_id_fk" FOREIGN KEY ("jobOperationId") REFERENCES "public"."jobOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_modelUploadId_modelUpload_id_fk" FOREIGN KEY ("modelUploadId") REFERENCES "public"."modelUpload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderLine" ADD CONSTRAINT "purchaseOrderLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderPayment" ADD CONSTRAINT "purchaseOrderPayment_id_purchaseOrder_id_fk" FOREIGN KEY ("id") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderPayment" ADD CONSTRAINT "purchaseOrderPayment_invoiceSupplierContactId_supplierContact_id_fk" FOREIGN KEY ("invoiceSupplierContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderPayment" ADD CONSTRAINT "purchaseOrderPayment_invoiceSupplierId_supplier_id_fk" FOREIGN KEY ("invoiceSupplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderPayment" ADD CONSTRAINT "purchaseOrderPayment_invoiceSupplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("invoiceSupplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderPayment" ADD CONSTRAINT "purchaseOrderPayment_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderStatusHistory" ADD CONSTRAINT "purchaseOrderStatusHistory_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderStatusHistory" ADD CONSTRAINT "purchaseOrderStatusHistory_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_closedBy_user_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_supplierContactId_supplierContact_id_fk" FOREIGN KEY ("supplierContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_supplierInteractionId_supplierInteraction_id_fk" FOREIGN KEY ("supplierInteractionId") REFERENCES "public"."supplierInteraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_supplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("supplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrder" ADD CONSTRAINT "purchaseOrder_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderTransaction" ADD CONSTRAINT "purchaseOrderTransaction_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderTransaction" ADD CONSTRAINT "purchaseOrderTransaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasePayment" ADD CONSTRAINT "purchasePayment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasePayment" ADD CONSTRAINT "purchasePayment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasePayment" ADD CONSTRAINT "purchasePayment_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasePayment" ADD CONSTRAINT "purchasePayment_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasePayment" ADD CONSTRAINT "purchasePayment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqFavorite" ADD CONSTRAINT "purchasingRfqFavorite_rfqId_purchasingRfq_id_fk" FOREIGN KEY ("rfqId") REFERENCES "public"."purchasingRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqFavorite" ADD CONSTRAINT "purchasingRfqFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqLine" ADD CONSTRAINT "purchasingRfqLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqLine" ADD CONSTRAINT "purchasingRfqLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqLine" ADD CONSTRAINT "purchasingRfqLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqLine" ADD CONSTRAINT "purchasingRfqLine_purchasingRfqId_purchasingRfq_id_fk" FOREIGN KEY ("purchasingRfqId") REFERENCES "public"."purchasingRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqLine" ADD CONSTRAINT "purchasingRfqLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqSupplier" ADD CONSTRAINT "purchasingRfqSupplier_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqSupplier" ADD CONSTRAINT "purchasingRfqSupplier_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqSupplier" ADD CONSTRAINT "purchasingRfqSupplier_purchasingRfqId_purchasingRfq_id_fk" FOREIGN KEY ("purchasingRfqId") REFERENCES "public"."purchasingRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqSupplier" ADD CONSTRAINT "purchasingRfqSupplier_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfq" ADD CONSTRAINT "purchasingRfq_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfq" ADD CONSTRAINT "purchasingRfq_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfq" ADD CONSTRAINT "purchasingRfq_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfq" ADD CONSTRAINT "purchasingRfq_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfq" ADD CONSTRAINT "purchasingRfq_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfq" ADD CONSTRAINT "purchasingRfq_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqToPurchaseOrder" ADD CONSTRAINT "purchasingRfqToPurchaseOrder_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqToPurchaseOrder" ADD CONSTRAINT "purchasingRfqToPurchaseOrder_purchaseOrderId_purchaseOrder_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqToPurchaseOrder" ADD CONSTRAINT "purchasingRfqToPurchaseOrder_purchasingRfqId_purchasingRfq_id_fk" FOREIGN KEY ("purchasingRfqId") REFERENCES "public"."purchasingRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqToSupplierQuote" ADD CONSTRAINT "purchasingRfqToSupplierQuote_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqToSupplierQuote" ADD CONSTRAINT "purchasingRfqToSupplierQuote_purchasingRfqId_purchasingRfq_id_fk" FOREIGN KEY ("purchasingRfqId") REFERENCES "public"."purchasingRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasingRfqToSupplierQuote" ADD CONSTRAINT "purchasingRfqToSupplierQuote_supplierQuoteId_supplierQuote_id_fk" FOREIGN KEY ("supplierQuoteId") REFERENCES "public"."supplierQuote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocumentStep" ADD CONSTRAINT "qualityDocumentStep_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocumentStep" ADD CONSTRAINT "qualityDocumentStep_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocumentStep" ADD CONSTRAINT "qualityDocumentStep_qualityDocumentId_qualityDocument_id_fk" FOREIGN KEY ("qualityDocumentId") REFERENCES "public"."qualityDocument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocumentStep" ADD CONSTRAINT "qualityDocumentStep_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocument" ADD CONSTRAINT "qualityDocument_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocument" ADD CONSTRAINT "qualityDocument_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocument" ADD CONSTRAINT "qualityDocument_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualityDocument" ADD CONSTRAINT "qualityDocument_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteFavorite" ADD CONSTRAINT "quoteFavorite_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteFavorite" ADD CONSTRAINT "quoteFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLinePrice" ADD CONSTRAINT "quoteLinePrice_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLinePrice" ADD CONSTRAINT "quoteLinePrice_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLinePrice" ADD CONSTRAINT "quoteLinePrice_quoteLineId_quoteLine_id_fk" FOREIGN KEY ("quoteLineId") REFERENCES "public"."quoteLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLinePrice" ADD CONSTRAINT "quoteLinePrice_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_estimatorId_user_id_fk" FOREIGN KEY ("estimatorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_modelUploadId_modelUpload_id_fk" FOREIGN KEY ("modelUploadId") REFERENCES "public"."modelUpload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_pricingRuleId_pricingRule_id_fk" FOREIGN KEY ("pricingRuleId") REFERENCES "public"."pricingRule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_parentMaterialId_quoteMaterial_id_fk" FOREIGN KEY ("parentMaterialId") REFERENCES "public"."quoteMaterial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_quoteLineId_quoteLine_id_fk" FOREIGN KEY ("quoteLineId") REFERENCES "public"."quoteLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_quoteLineId_quoteLine_id_fk" FOREIGN KEY ("quoteLineId") REFERENCES "public"."quoteLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_quoteOperationId_quoteOperation_id_fk" FOREIGN KEY ("quoteOperationId") REFERENCES "public"."quoteOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationParameter" ADD CONSTRAINT "quoteOperationParameter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationParameter" ADD CONSTRAINT "quoteOperationParameter_operationId_quoteOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."quoteOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationParameter" ADD CONSTRAINT "quoteOperationParameter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationStep" ADD CONSTRAINT "quoteOperationStep_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationStep" ADD CONSTRAINT "quoteOperationStep_operationId_quoteOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."quoteOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationStep" ADD CONSTRAINT "quoteOperationStep_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_operationSupplierProcessId_supplierProcess_id_fk" FOREIGN KEY ("operationSupplierProcessId") REFERENCES "public"."supplierProcess"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_procedureId_procedure_id_fk" FOREIGN KEY ("procedureId") REFERENCES "public"."procedure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_quoteId_quote_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_quoteLineId_quoteLine_id_fk" FOREIGN KEY ("quoteLineId") REFERENCES "public"."quoteLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperation" ADD CONSTRAINT "quoteOperation_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationTool" ADD CONSTRAINT "quoteOperationTool_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationTool" ADD CONSTRAINT "quoteOperationTool_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationTool" ADD CONSTRAINT "quoteOperationTool_operationId_quoteOperation_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."quoteOperation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationTool" ADD CONSTRAINT "quoteOperationTool_toolId_item_id_fk" FOREIGN KEY ("toolId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteOperationTool" ADD CONSTRAINT "quoteOperationTool_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotePayment" ADD CONSTRAINT "quotePayment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotePayment" ADD CONSTRAINT "quotePayment_id_quote_id_fk" FOREIGN KEY ("id") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotePayment" ADD CONSTRAINT "quotePayment_invoiceCustomerContactId_customerContact_id_fk" FOREIGN KEY ("invoiceCustomerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotePayment" ADD CONSTRAINT "quotePayment_invoiceCustomerId_customer_id_fk" FOREIGN KEY ("invoiceCustomerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotePayment" ADD CONSTRAINT "quotePayment_invoiceCustomerLocationId_customerLocation_id_fk" FOREIGN KEY ("invoiceCustomerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotePayment" ADD CONSTRAINT "quotePayment_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteShipment" ADD CONSTRAINT "quoteShipment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteShipment" ADD CONSTRAINT "quoteShipment_id_quote_id_fk" FOREIGN KEY ("id") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteShipment" ADD CONSTRAINT "quoteShipment_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteShipment" ADD CONSTRAINT "quoteShipment_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteShipment" ADD CONSTRAINT "quoteShipment_shippingTermId_shippingTerm_id_fk" FOREIGN KEY ("shippingTermId") REFERENCES "public"."shippingTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoteShipment" ADD CONSTRAINT "quoteShipment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_customerContactId_customerContact_id_fk" FOREIGN KEY ("customerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_customerEngineeringContactId_customerContact_id_fk" FOREIGN KEY ("customerEngineeringContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_customerLocationId_customerLocation_id_fk" FOREIGN KEY ("customerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_estimatorId_user_id_fk" FOREIGN KEY ("estimatorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_externalLinkId_externalLink_id_fk" FOREIGN KEY ("externalLinkId") REFERENCES "public"."externalLink"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_opportunityId_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_salesPersonId_user_id_fk" FOREIGN KEY ("salesPersonId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_receiptId_receipt_id_fk" FOREIGN KEY ("receiptId") REFERENCES "public"."receipt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiptLine" ADD CONSTRAINT "receiptLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_postedBy_user_id_fk" FOREIGN KEY ("postedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_supplierInteractionId_supplierInteraction_id_fk" FOREIGN KEY ("supplierInteractionId") REFERENCES "public"."supplierInteraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riskRegister" ADD CONSTRAINT "riskRegister_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riskRegister" ADD CONSTRAINT "riskRegister_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riskRegister" ADD CONSTRAINT "riskRegister_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riskRegister" ADD CONSTRAINT "riskRegister_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riskRegister" ADD CONSTRAINT "riskRegister_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_accountId_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_invoiceId_salesInvoice_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."salesInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_modelUploadId_modelUpload_id_fk" FOREIGN KEY ("modelUploadId") REFERENCES "public"."modelUpload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_opportunityId_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_salesOrderLineId_salesOrderLine_id_fk" FOREIGN KEY ("salesOrderLineId") REFERENCES "public"."salesOrderLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceLine" ADD CONSTRAINT "salesInvoiceLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceShipment" ADD CONSTRAINT "salesInvoiceShipment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceShipment" ADD CONSTRAINT "salesInvoiceShipment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceShipment" ADD CONSTRAINT "salesInvoiceShipment_id_salesInvoice_id_fk" FOREIGN KEY ("id") REFERENCES "public"."salesInvoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoiceShipment" ADD CONSTRAINT "salesInvoiceShipment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_invoiceCustomerContactId_customerContact_id_fk" FOREIGN KEY ("invoiceCustomerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_invoiceCustomerId_customer_id_fk" FOREIGN KEY ("invoiceCustomerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_invoiceCustomerLocationId_customerLocation_id_fk" FOREIGN KEY ("invoiceCustomerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_opportunityId_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_shipmentId_shipment_id_fk" FOREIGN KEY ("shipmentId") REFERENCES "public"."shipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInvoice" ADD CONSTRAINT "salesInvoice_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderFavorite" ADD CONSTRAINT "salesOrderFavorite_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderFavorite" ADD CONSTRAINT "salesOrderFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_accountId_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_pricingRuleId_pricingRule_id_fk" FOREIGN KEY ("pricingRuleId") REFERENCES "public"."pricingRule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderLine" ADD CONSTRAINT "salesOrderLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ADD CONSTRAINT "salesOrderPayment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ADD CONSTRAINT "salesOrderPayment_id_salesOrder_id_fk" FOREIGN KEY ("id") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ADD CONSTRAINT "salesOrderPayment_invoiceCustomerContactId_customerContact_id_fk" FOREIGN KEY ("invoiceCustomerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ADD CONSTRAINT "salesOrderPayment_invoiceCustomerId_customer_id_fk" FOREIGN KEY ("invoiceCustomerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ADD CONSTRAINT "salesOrderPayment_invoiceCustomerLocationId_customerLocation_id_fk" FOREIGN KEY ("invoiceCustomerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderPayment" ADD CONSTRAINT "salesOrderPayment_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_customerLocationId_customerLocation_id_fk" FOREIGN KEY ("customerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_id_salesOrder_id_fk" FOREIGN KEY ("id") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_shippingTermId_shippingTerm_id_fk" FOREIGN KEY ("shippingTermId") REFERENCES "public"."shippingTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderShipment" ADD CONSTRAINT "salesOrderShipment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderStatusHistory" ADD CONSTRAINT "salesOrderStatusHistory_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderStatusHistory" ADD CONSTRAINT "salesOrderStatusHistory_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_closedBy_user_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_customerContactId_customerContact_id_fk" FOREIGN KEY ("customerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_customerEngineeringContactId_customerContact_id_fk" FOREIGN KEY ("customerEngineeringContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_customerLocationId_customerLocation_id_fk" FOREIGN KEY ("customerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_opportunityId_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrder" ADD CONSTRAINT "salesOrder_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderTransaction" ADD CONSTRAINT "salesOrderTransaction_salesOrderId_salesOrder_id_fk" FOREIGN KEY ("salesOrderId") REFERENCES "public"."salesOrder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesOrderTransaction" ADD CONSTRAINT "salesOrderTransaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqFavorite" ADD CONSTRAINT "salesRfqFavorite_rfqId_salesRfq_id_fk" FOREIGN KEY ("rfqId") REFERENCES "public"."salesRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqFavorite" ADD CONSTRAINT "salesRfqFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqLine" ADD CONSTRAINT "salesRfqLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqLine" ADD CONSTRAINT "salesRfqLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqLine" ADD CONSTRAINT "salesRfqLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqLine" ADD CONSTRAINT "salesRfqLine_modelUploadId_modelUpload_id_fk" FOREIGN KEY ("modelUploadId") REFERENCES "public"."modelUpload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqLine" ADD CONSTRAINT "salesRfqLine_salesRfqId_salesRfq_id_fk" FOREIGN KEY ("salesRfqId") REFERENCES "public"."salesRfq"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfqLine" ADD CONSTRAINT "salesRfqLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_customerContactId_customerContact_id_fk" FOREIGN KEY ("customerContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_customerEngineeringContactId_customerContact_id_fk" FOREIGN KEY ("customerEngineeringContactId") REFERENCES "public"."customerContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_customerLocationId_customerLocation_id_fk" FOREIGN KEY ("customerLocationId") REFERENCES "public"."customerLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_noQuoteReasonId_noQuoteReason_id_fk" FOREIGN KEY ("noQuoteReasonId") REFERENCES "public"."noQuoteReason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_opportunityId_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesRfq" ADD CONSTRAINT "salesRfq_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapReason" ADD CONSTRAINT "scrapReason_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapReason" ADD CONSTRAINT "scrapReason_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapReason" ADD CONSTRAINT "scrapReason_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searchIndexRegistry" ADD CONSTRAINT "searchIndexRegistry_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence" ADD CONSTRAINT "sequence_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence" ADD CONSTRAINT "sequence_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_fulfillmentId_fulfillment_id_fk" FOREIGN KEY ("fulfillmentId") REFERENCES "public"."fulfillment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_shipmentId_shipment_id_fk" FOREIGN KEY ("shipmentId") REFERENCES "public"."shipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_storageUnitId_storageUnit_id_fk" FOREIGN KEY ("storageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipmentLine" ADD CONSTRAINT "shipmentLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_customerId_customer_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_opportunityId_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_postedBy_user_id_fk" FOREIGN KEY ("postedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplierInteractionId_supplierInteraction_id_fk" FOREIGN KEY ("supplierInteractionId") REFERENCES "public"."supplierInteraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingMethod" ADD CONSTRAINT "shippingMethod_carrierAccountId_account_id_fk" FOREIGN KEY ("carrierAccountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingMethod" ADD CONSTRAINT "shippingMethod_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingMethod" ADD CONSTRAINT "shippingMethod_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingMethod" ADD CONSTRAINT "shippingMethod_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingTerm" ADD CONSTRAINT "shippingTerm_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingTerm" ADD CONSTRAINT "shippingTerm_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shippingTerm" ADD CONSTRAINT "shippingTerm_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slackDocumentThread" ADD CONSTRAINT "slackDocumentThread_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slackDocumentThread" ADD CONSTRAINT "slackDocumentThread_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slackDocumentThread" ADD CONSTRAINT "slackDocumentThread_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_fromStorageUnitId_storageUnit_id_fk" FOREIGN KEY ("fromStorageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_jobMaterialId_jobMaterial_id_fk" FOREIGN KEY ("jobMaterialId") REFERENCES "public"."jobMaterial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_toStorageUnitId_storageUnit_id_fk" FOREIGN KEY ("toStorageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransferLine" ADD CONSTRAINT "stockTransferLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransfer" ADD CONSTRAINT "stockTransfer_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransfer" ADD CONSTRAINT "stockTransfer_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransfer" ADD CONSTRAINT "stockTransfer_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransfer" ADD CONSTRAINT "stockTransfer_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockTransfer" ADD CONSTRAINT "stockTransfer_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageType" ADD CONSTRAINT "storageType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageType" ADD CONSTRAINT "storageType_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageType" ADD CONSTRAINT "storageType_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageUnit" ADD CONSTRAINT "storageUnit_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageUnit" ADD CONSTRAINT "storageUnit_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageUnit" ADD CONSTRAINT "storageUnit_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageUnit" ADD CONSTRAINT "storageUnit_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storageUnit" ADD CONSTRAINT "storageUnit_warehouseId_warehouse_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierAccount" ADD CONSTRAINT "supplierAccount_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierAccount" ADD CONSTRAINT "supplierAccount_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierAccount" ADD CONSTRAINT "supplierAccount_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierContact" ADD CONSTRAINT "supplierContact_contactId_contact_id_fk" FOREIGN KEY ("contactId") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierContact" ADD CONSTRAINT "supplierContact_supplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("supplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierContact" ADD CONSTRAINT "supplierContact_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierInteraction" ADD CONSTRAINT "supplierInteraction_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierInteraction" ADD CONSTRAINT "supplierInteraction_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierLedger" ADD CONSTRAINT "supplierLedger_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierLedger" ADD CONSTRAINT "supplierLedger_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierLocation" ADD CONSTRAINT "supplierLocation_addressId_address_id_fk" FOREIGN KEY ("addressId") REFERENCES "public"."address"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPartPrice" ADD CONSTRAINT "supplierPartPrice_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPartPrice" ADD CONSTRAINT "supplierPartPrice_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPartPrice" ADD CONSTRAINT "supplierPartPrice_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPart" ADD CONSTRAINT "supplierPart_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPart" ADD CONSTRAINT "supplierPart_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPart" ADD CONSTRAINT "supplierPart_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPart" ADD CONSTRAINT "supplierPart_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPart" ADD CONSTRAINT "supplierPart_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_invoiceSupplierContactId_supplierContact_id_fk" FOREIGN KEY ("invoiceSupplierContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_invoiceSupplierId_supplier_id_fk" FOREIGN KEY ("invoiceSupplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_invoiceSupplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("invoiceSupplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_paymentTermId_paymentTerm_id_fk" FOREIGN KEY ("paymentTermId") REFERENCES "public"."paymentTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayment" ADD CONSTRAINT "supplierPayment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierProcess" ADD CONSTRAINT "supplierProcess_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierProcess" ADD CONSTRAINT "supplierProcess_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierProcess" ADD CONSTRAINT "supplierProcess_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierProcess" ADD CONSTRAINT "supplierProcess_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierProcess" ADD CONSTRAINT "supplierProcess_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteFavorite" ADD CONSTRAINT "supplierQuoteFavorite_supplierQuoteId_supplierQuote_id_fk" FOREIGN KEY ("supplierQuoteId") REFERENCES "public"."supplierQuote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteFavorite" ADD CONSTRAINT "supplierQuoteFavorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLinePrice" ADD CONSTRAINT "supplierQuoteLinePrice_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLinePrice" ADD CONSTRAINT "supplierQuoteLinePrice_supplierQuoteId_supplierQuote_id_fk" FOREIGN KEY ("supplierQuoteId") REFERENCES "public"."supplierQuote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLinePrice" ADD CONSTRAINT "supplierQuoteLinePrice_supplierQuoteLineId_supplierQuoteLine_id_fk" FOREIGN KEY ("supplierQuoteLineId") REFERENCES "public"."supplierQuoteLine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLinePrice" ADD CONSTRAINT "supplierQuoteLinePrice_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_accountId_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_costCenterId_costCenter_id_fk" FOREIGN KEY ("costCenterId") REFERENCES "public"."costCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_supplierQuoteId_supplierQuote_id_fk" FOREIGN KEY ("supplierQuoteId") REFERENCES "public"."supplierQuote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuoteLine" ADD CONSTRAINT "supplierQuoteLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_externalLinkId_externalLink_id_fk" FOREIGN KEY ("externalLinkId") REFERENCES "public"."externalLink"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_supplierContactId_supplierContact_id_fk" FOREIGN KEY ("supplierContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_supplierInteractionId_supplierInteraction_id_fk" FOREIGN KEY ("supplierInteractionId") REFERENCES "public"."supplierInteraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_supplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("supplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierQuote" ADD CONSTRAINT "supplierQuote_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_shippingMethodId_shippingMethod_id_fk" FOREIGN KEY ("shippingMethodId") REFERENCES "public"."shippingMethod"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_shippingSupplierContactId_supplierContact_id_fk" FOREIGN KEY ("shippingSupplierContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_shippingSupplierId_supplier_id_fk" FOREIGN KEY ("shippingSupplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_shippingSupplierLocationId_supplierLocation_id_fk" FOREIGN KEY ("shippingSupplierLocationId") REFERENCES "public"."supplierLocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_shippingTermId_shippingTerm_id_fk" FOREIGN KEY ("shippingTermId") REFERENCES "public"."shippingTerm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierShipping" ADD CONSTRAINT "supplierShipping_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_accountManagerId_user_id_fk" FOREIGN KEY ("accountManagerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_currencyCode_currencyCode_code_fk" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencyCode"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_intercompanyCompanyId_company_id_fk" FOREIGN KEY ("intercompanyCompanyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_purchasingContactId_supplierContact_id_fk" FOREIGN KEY ("purchasingContactId") REFERENCES "public"."supplierContact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_supplierTypeId_supplierType_id_fk" FOREIGN KEY ("supplierTypeId") REFERENCES "public"."supplierType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierTax" ADD CONSTRAINT "supplierTax_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierTax" ADD CONSTRAINT "supplierTax_supplierId_supplier_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierTax" ADD CONSTRAINT "supplierTax_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierType" ADD CONSTRAINT "supplierType_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierType" ADD CONSTRAINT "supplierType_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierType" ADD CONSTRAINT "supplierType_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyActual" ADD CONSTRAINT "supplyActual_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyActual" ADD CONSTRAINT "supplyActual_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyActual" ADD CONSTRAINT "supplyActual_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyActual" ADD CONSTRAINT "supplyActual_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyActual" ADD CONSTRAINT "supplyActual_periodId_period_id_fk" FOREIGN KEY ("periodId") REFERENCES "public"."period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyActual" ADD CONSTRAINT "supplyActual_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyForecast" ADD CONSTRAINT "supplyForecast_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyForecast" ADD CONSTRAINT "supplyForecast_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyForecast" ADD CONSTRAINT "supplyForecast_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyForecast" ADD CONSTRAINT "supplyForecast_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyForecast" ADD CONSTRAINT "supplyForecast_periodId_period_id_fk" FOREIGN KEY ("periodId") REFERENCES "public"."period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplyForecast" ADD CONSTRAINT "supplyForecast_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tableView" ADD CONSTRAINT "tableView_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tableView" ADD CONSTRAINT "tableView_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tableView" ADD CONSTRAINT "tableView_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_id_company_id_fk" FOREIGN KEY ("id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeCardEntry" ADD CONSTRAINT "timeCardEntry_autoCloseShiftId_shift_id_fk" FOREIGN KEY ("autoCloseShiftId") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeCardEntry" ADD CONSTRAINT "timeCardEntry_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeCardEntry" ADD CONSTRAINT "timeCardEntry_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeCardEntry" ADD CONSTRAINT "timeCardEntry_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeCardEntry" ADD CONSTRAINT "timeCardEntry_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityInput" ADD CONSTRAINT "trackedActivityInput_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityInput" ADD CONSTRAINT "trackedActivityInput_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityInput" ADD CONSTRAINT "trackedActivityInput_trackedActivityId_trackedActivity_id_fk" FOREIGN KEY ("trackedActivityId") REFERENCES "public"."trackedActivity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityInput" ADD CONSTRAINT "trackedActivityInput_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityOutput" ADD CONSTRAINT "trackedActivityOutput_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityOutput" ADD CONSTRAINT "trackedActivityOutput_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityOutput" ADD CONSTRAINT "trackedActivityOutput_trackedActivityId_trackedActivity_id_fk" FOREIGN KEY ("trackedActivityId") REFERENCES "public"."trackedActivity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivityOutput" ADD CONSTRAINT "trackedActivityOutput_trackedEntityId_trackedEntity_id_fk" FOREIGN KEY ("trackedEntityId") REFERENCES "public"."trackedEntity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivity" ADD CONSTRAINT "trackedActivity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedActivity" ADD CONSTRAINT "trackedActivity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedEntity" ADD CONSTRAINT "trackedEntity_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedEntity" ADD CONSTRAINT "trackedEntity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackedEntity" ADD CONSTRAINT "trackedEntity_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingAssignment" ADD CONSTRAINT "trainingAssignment_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingAssignment" ADD CONSTRAINT "trainingAssignment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingAssignment" ADD CONSTRAINT "trainingAssignment_trainingId_training_id_fk" FOREIGN KEY ("trainingId") REFERENCES "public"."training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingAssignment" ADD CONSTRAINT "trainingAssignment_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingCompletion" ADD CONSTRAINT "trainingCompletion_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingCompletion" ADD CONSTRAINT "trainingCompletion_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingCompletion" ADD CONSTRAINT "trainingCompletion_employeeId_user_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingCompletion" ADD CONSTRAINT "trainingCompletion_trainingAssignmentId_trainingAssignment_id_fk" FOREIGN KEY ("trainingAssignmentId") REFERENCES "public"."trainingAssignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingCompletion" ADD CONSTRAINT "trainingCompletion_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingQuestion" ADD CONSTRAINT "trainingQuestion_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingQuestion" ADD CONSTRAINT "trainingQuestion_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingQuestion" ADD CONSTRAINT "trainingQuestion_trainingId_training_id_fk" FOREIGN KEY ("trainingId") REFERENCES "public"."training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingQuestion" ADD CONSTRAINT "trainingQuestion_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitOfMeasure" ADD CONSTRAINT "unitOfMeasure_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitOfMeasure" ADD CONSTRAINT "unitOfMeasure_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitOfMeasure" ADD CONSTRAINT "unitOfMeasure_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeCategory" ADD CONSTRAINT "userAttributeCategory_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeCategory" ADD CONSTRAINT "userAttributeCategory_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeCategory" ADD CONSTRAINT "userAttributeCategory_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttribute" ADD CONSTRAINT "userAttribute_attributeDataTypeId_attributeDataType_id_fk" FOREIGN KEY ("attributeDataTypeId") REFERENCES "public"."attributeDataType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttribute" ADD CONSTRAINT "userAttribute_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttribute" ADD CONSTRAINT "userAttribute_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttribute" ADD CONSTRAINT "userAttribute_userAttributeCategoryId_userAttributeCategory_id_fk" FOREIGN KEY ("userAttributeCategoryId") REFERENCES "public"."userAttributeCategory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeValue" ADD CONSTRAINT "userAttributeValue_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeValue" ADD CONSTRAINT "userAttributeValue_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeValue" ADD CONSTRAINT "userAttributeValue_userAttributeId_userAttribute_id_fk" FOREIGN KEY ("userAttributeId") REFERENCES "public"."userAttribute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeValue" ADD CONSTRAINT "userAttributeValue_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAttributeValue" ADD CONSTRAINT "userAttributeValue_valueUser_user_id_fk" FOREIGN KEY ("valueUser") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userModulePreference" ADD CONSTRAINT "userModulePreference_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userModulePreference" ADD CONSTRAINT "userModulePreference_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userPermission" ADD CONSTRAINT "userPermission_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userToCompany" ADD CONSTRAINT "userToCompany_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userToCompany" ADD CONSTRAINT "userToCompany_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_fromLocationId_location_id_fk" FOREIGN KEY ("fromLocationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_fromStorageUnitId_storageUnit_id_fk" FOREIGN KEY ("fromStorageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_toLocationId_location_id_fk" FOREIGN KEY ("toLocationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_toStorageUnitId_storageUnit_id_fk" FOREIGN KEY ("toStorageUnitId") REFERENCES "public"."storageUnit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_transferId_warehouseTransfer_id_fk" FOREIGN KEY ("transferId") REFERENCES "public"."warehouseTransfer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransferLine" ADD CONSTRAINT "warehouseTransferLine_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransfer" ADD CONSTRAINT "warehouseTransfer_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransfer" ADD CONSTRAINT "warehouseTransfer_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransfer" ADD CONSTRAINT "warehouseTransfer_fromLocationId_location_id_fk" FOREIGN KEY ("fromLocationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransfer" ADD CONSTRAINT "warehouseTransfer_toLocationId_location_id_fk" FOREIGN KEY ("toLocationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouseTransfer" ADD CONSTRAINT "warehouseTransfer_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_table_webhookTable_table_fk" FOREIGN KEY ("table") REFERENCES "public"."webhookTable"("table") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterProcess" ADD CONSTRAINT "workCenterProcess_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterProcess" ADD CONSTRAINT "workCenterProcess_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterProcess" ADD CONSTRAINT "workCenterProcess_processId_process_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterProcess" ADD CONSTRAINT "workCenterProcess_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterProcess" ADD CONSTRAINT "workCenterProcess_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterReplacementPart" ADD CONSTRAINT "workCenterReplacementPart_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterReplacementPart" ADD CONSTRAINT "workCenterReplacementPart_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterReplacementPart" ADD CONSTRAINT "workCenterReplacementPart_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterReplacementPart" ADD CONSTRAINT "workCenterReplacementPart_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenterReplacementPart" ADD CONSTRAINT "workCenterReplacementPart_workCenterId_workCenter_id_fk" FOREIGN KEY ("workCenterId") REFERENCES "public"."workCenter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenter" ADD CONSTRAINT "workCenter_companyId_company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenter" ADD CONSTRAINT "workCenter_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenter" ADD CONSTRAINT "workCenter_locationId_location_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenter" ADD CONSTRAINT "workCenter_requiredAbilityId_ability_id_fk" FOREIGN KEY ("requiredAbilityId") REFERENCES "public"."ability"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workCenter" ADD CONSTRAINT "workCenter_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_uid() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_api_key() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT NULLIF(current_setting('app.api_key_id', true), '')
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_companies_with_any_role() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT "companyId"), ARRAY[]::text[])
  FROM (
    SELECT utc."companyId"
    FROM "userToCompany" utc
    WHERE utc."userId" = app_uid()
    UNION
    SELECT ak."companyId"
    FROM "apiKey" ak
    WHERE ak."id" = app_api_key()
  ) companies
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_companies_with_employee_role() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT utc."companyId"), ARRAY[]::text[])
  FROM "userToCompany" utc
  WHERE utc."userId" = app_uid()
    AND utc."role" = 'employee'
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_companies_with_permission(permission text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT e."companyId"), ARRAY[]::text[])
  FROM "employee" e
  INNER JOIN "employeeType" et ON et."id" = e."employeeTypeId"
  INNER JOIN "employeeTypePermission" etp ON etp."employeeTypeId" = et."id"
  WHERE e."id" = app_uid()
    AND e."active" = true
    AND permission = ANY(etp."view" || etp."create" || etp."update" || etp."delete")
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_companies_for_context() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_companies_with_any_role()
$$;--> statement-breakpoint
CREATE POLICY "ability_tenant_select" ON "ability" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("ability"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "ability_tenant_insert" ON "ability" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("ability"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "ability_tenant_update" ON "ability" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("ability"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("ability"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "ability_tenant_delete" ON "ability" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("ability"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountDefault_tenant_select" ON "accountDefault" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("accountDefault"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountDefault_tenant_insert" ON "accountDefault" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("accountDefault"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountDefault_tenant_update" ON "accountDefault" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("accountDefault"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("accountDefault"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountDefault_tenant_delete" ON "accountDefault" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("accountDefault"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountingPeriod_tenant_select" ON "accountingPeriod" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("accountingPeriod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountingPeriod_tenant_insert" ON "accountingPeriod" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("accountingPeriod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountingPeriod_tenant_update" ON "accountingPeriod" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("accountingPeriod"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("accountingPeriod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "accountingPeriod_tenant_delete" ON "accountingPeriod" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("accountingPeriod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "address_tenant_select" ON "address" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("address"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "address_tenant_insert" ON "address" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("address"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "address_tenant_update" ON "address" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("address"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("address"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "address_tenant_delete" ON "address" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("address"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "apiKey_tenant_select" ON "apiKey" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("apiKey"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "apiKey_tenant_insert" ON "apiKey" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("apiKey"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "apiKey_tenant_update" ON "apiKey" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("apiKey"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("apiKey"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "apiKey_tenant_delete" ON "apiKey" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("apiKey"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRequest_tenant_select" ON "approvalRequest" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("approvalRequest"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRequest_tenant_insert" ON "approvalRequest" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("approvalRequest"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRequest_tenant_update" ON "approvalRequest" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("approvalRequest"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("approvalRequest"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRequest_tenant_delete" ON "approvalRequest" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("approvalRequest"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRule_tenant_select" ON "approvalRule" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("approvalRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRule_tenant_insert" ON "approvalRule" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("approvalRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRule_tenant_update" ON "approvalRule" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("approvalRule"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("approvalRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "approvalRule_tenant_delete" ON "approvalRule" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("approvalRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "auditLogArchive_tenant_select" ON "auditLogArchive" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("auditLogArchive"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "auditLogArchive_tenant_insert" ON "auditLogArchive" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("auditLogArchive"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "auditLogArchive_tenant_update" ON "auditLogArchive" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("auditLogArchive"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("auditLogArchive"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "auditLogArchive_tenant_delete" ON "auditLogArchive" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("auditLogArchive"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "batchProperty_tenant_select" ON "batchProperty" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("batchProperty"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "batchProperty_tenant_insert" ON "batchProperty" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("batchProperty"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "batchProperty_tenant_update" ON "batchProperty" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("batchProperty"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("batchProperty"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "batchProperty_tenant_delete" ON "batchProperty" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("batchProperty"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyIntegration_tenant_select" ON "companyIntegration" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("companyIntegration"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyIntegration_tenant_insert" ON "companyIntegration" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("companyIntegration"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyIntegration_tenant_update" ON "companyIntegration" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("companyIntegration"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("companyIntegration"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyIntegration_tenant_delete" ON "companyIntegration" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("companyIntegration"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyUsage_tenant_select" ON "companyUsage" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("companyUsage"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyUsage_tenant_insert" ON "companyUsage" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("companyUsage"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyUsage_tenant_update" ON "companyUsage" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("companyUsage"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("companyUsage"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "companyUsage_tenant_delete" ON "companyUsage" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("companyUsage"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameterGroup_tenant_select" ON "configurationParameterGroup" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("configurationParameterGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameterGroup_tenant_insert" ON "configurationParameterGroup" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("configurationParameterGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameterGroup_tenant_update" ON "configurationParameterGroup" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("configurationParameterGroup"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("configurationParameterGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameterGroup_tenant_delete" ON "configurationParameterGroup" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("configurationParameterGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameter_tenant_select" ON "configurationParameter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("configurationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameter_tenant_insert" ON "configurationParameter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("configurationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameter_tenant_update" ON "configurationParameter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("configurationParameter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("configurationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationParameter_tenant_delete" ON "configurationParameter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("configurationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationRule_tenant_select" ON "configurationRule" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("configurationRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationRule_tenant_insert" ON "configurationRule" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("configurationRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationRule_tenant_update" ON "configurationRule" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("configurationRule"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("configurationRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "configurationRule_tenant_delete" ON "configurationRule" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("configurationRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "consumable_tenant_select" ON "consumable" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("consumable"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "consumable_tenant_insert" ON "consumable" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("consumable"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "consumable_tenant_update" ON "consumable" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("consumable"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("consumable"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "consumable_tenant_delete" ON "consumable" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("consumable"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contact_tenant_select" ON "contact" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("contact"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contact_tenant_insert" ON "contact" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("contact"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contact_tenant_update" ON "contact" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("contact"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("contact"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contact_tenant_delete" ON "contact" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("contact"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contractor_tenant_select" ON "contractor" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("contractor"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contractor_tenant_insert" ON "contractor" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("contractor"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contractor_tenant_update" ON "contractor" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("contractor"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("contractor"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "contractor_tenant_delete" ON "contractor" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("contractor"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costCenter_tenant_select" ON "costCenter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("costCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costCenter_tenant_insert" ON "costCenter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("costCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costCenter_tenant_update" ON "costCenter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("costCenter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("costCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costCenter_tenant_delete" ON "costCenter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("costCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costLedger_tenant_select" ON "costLedger" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("costLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costLedger_tenant_insert" ON "costLedger" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("costLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costLedger_tenant_update" ON "costLedger" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("costLedger"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("costLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "costLedger_tenant_delete" ON "costLedger" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("costLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customField_tenant_select" ON "customField" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customField"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customField_tenant_insert" ON "customField" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customField"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customField_tenant_update" ON "customField" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customField"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customField"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customField_tenant_delete" ON "customField" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customField"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerAccount_tenant_select" ON "customerAccount" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerAccount_tenant_insert" ON "customerAccount" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerAccount_tenant_update" ON "customerAccount" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerAccount"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerAccount_tenant_delete" ON "customerAccount" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverrideBreak_tenant_select" ON "customerItemPriceOverrideBreak" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerItemPriceOverrideBreak"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverrideBreak_tenant_insert" ON "customerItemPriceOverrideBreak" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerItemPriceOverrideBreak"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverrideBreak_tenant_update" ON "customerItemPriceOverrideBreak" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerItemPriceOverrideBreak"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerItemPriceOverrideBreak"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverrideBreak_tenant_delete" ON "customerItemPriceOverrideBreak" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerItemPriceOverrideBreak"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverride_tenant_select" ON "customerItemPriceOverride" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerItemPriceOverride"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverride_tenant_insert" ON "customerItemPriceOverride" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerItemPriceOverride"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverride_tenant_update" ON "customerItemPriceOverride" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerItemPriceOverride"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerItemPriceOverride"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerItemPriceOverride_tenant_delete" ON "customerItemPriceOverride" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerItemPriceOverride"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPartToItem_tenant_select" ON "customerPartToItem" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerPartToItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPartToItem_tenant_insert" ON "customerPartToItem" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerPartToItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPartToItem_tenant_update" ON "customerPartToItem" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerPartToItem"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerPartToItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPartToItem_tenant_delete" ON "customerPartToItem" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerPartToItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPayment_tenant_select" ON "customerPayment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPayment_tenant_insert" ON "customerPayment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPayment_tenant_update" ON "customerPayment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerPayment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerPayment_tenant_delete" ON "customerPayment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerShipping_tenant_select" ON "customerShipping" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerShipping_tenant_insert" ON "customerShipping" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerShipping_tenant_update" ON "customerShipping" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerShipping"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerShipping_tenant_delete" ON "customerShipping" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerStatus_tenant_select" ON "customerStatus" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerStatus"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerStatus_tenant_insert" ON "customerStatus" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerStatus"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerStatus_tenant_update" ON "customerStatus" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerStatus"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerStatus"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerStatus_tenant_delete" ON "customerStatus" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerStatus"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customer_tenant_select" ON "customer" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customer_tenant_insert" ON "customer" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customer_tenant_update" ON "customer" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customer"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customer_tenant_delete" ON "customer" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerTax_tenant_select" ON "customerTax" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerTax_tenant_insert" ON "customerTax" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerTax_tenant_update" ON "customerTax" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerTax"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerTax_tenant_delete" ON "customerTax" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerType_tenant_select" ON "customerType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("customerType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerType_tenant_insert" ON "customerType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("customerType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerType_tenant_update" ON "customerType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("customerType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("customerType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "customerType_tenant_delete" ON "customerType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("customerType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandActual_tenant_select" ON "demandActual" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("demandActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandActual_tenant_insert" ON "demandActual" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("demandActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandActual_tenant_update" ON "demandActual" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("demandActual"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("demandActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandActual_tenant_delete" ON "demandActual" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("demandActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandForecast_tenant_select" ON "demandForecast" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("demandForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandForecast_tenant_insert" ON "demandForecast" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("demandForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandForecast_tenant_update" ON "demandForecast" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("demandForecast"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("demandForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandForecast_tenant_delete" ON "demandForecast" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("demandForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandProjection_tenant_select" ON "demandProjection" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("demandProjection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandProjection_tenant_insert" ON "demandProjection" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("demandProjection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandProjection_tenant_update" ON "demandProjection" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("demandProjection"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("demandProjection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "demandProjection_tenant_delete" ON "demandProjection" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("demandProjection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "department_tenant_select" ON "department" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("department"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "department_tenant_insert" ON "department" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("department"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "department_tenant_update" ON "department" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("department"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("department"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "department_tenant_delete" ON "department" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("department"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "document_tenant_select" ON "document" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("document"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "document_tenant_insert" ON "document" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("document"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "document_tenant_update" ON "document" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("document"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("document"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "document_tenant_delete" ON "document" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("document"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeAbility_tenant_select" ON "employeeAbility" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("employeeAbility"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeAbility_tenant_insert" ON "employeeAbility" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("employeeAbility"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeAbility_tenant_update" ON "employeeAbility" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("employeeAbility"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("employeeAbility"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeAbility_tenant_delete" ON "employeeAbility" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("employeeAbility"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeJob_tenant_select" ON "employeeJob" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("employeeJob"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeJob_tenant_insert" ON "employeeJob" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("employeeJob"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeJob_tenant_update" ON "employeeJob" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("employeeJob"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("employeeJob"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeJob_tenant_delete" ON "employeeJob" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("employeeJob"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employee_tenant_select" ON "employee" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("employee"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employee_tenant_insert" ON "employee" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("employee"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employee_tenant_update" ON "employee" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("employee"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("employee"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employee_tenant_delete" ON "employee" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("employee"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeType_tenant_select" ON "employeeType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("employeeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeType_tenant_insert" ON "employeeType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("employeeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeType_tenant_update" ON "employeeType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("employeeType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("employeeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "employeeType_tenant_delete" ON "employeeType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("employeeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "eventSystemSubscription_tenant_select" ON "eventSystemSubscription" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("eventSystemSubscription"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "eventSystemSubscription_tenant_insert" ON "eventSystemSubscription" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("eventSystemSubscription"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "eventSystemSubscription_tenant_update" ON "eventSystemSubscription" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("eventSystemSubscription"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("eventSystemSubscription"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "eventSystemSubscription_tenant_delete" ON "eventSystemSubscription" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("eventSystemSubscription"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalIntegrationMapping_tenant_select" ON "externalIntegrationMapping" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("externalIntegrationMapping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalIntegrationMapping_tenant_insert" ON "externalIntegrationMapping" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("externalIntegrationMapping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalIntegrationMapping_tenant_update" ON "externalIntegrationMapping" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("externalIntegrationMapping"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("externalIntegrationMapping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalIntegrationMapping_tenant_delete" ON "externalIntegrationMapping" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("externalIntegrationMapping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalLink_tenant_select" ON "externalLink" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("externalLink"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalLink_tenant_insert" ON "externalLink" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("externalLink"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalLink_tenant_update" ON "externalLink" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("externalLink"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("externalLink"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "externalLink_tenant_delete" ON "externalLink" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("externalLink"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fiscalYearSettings_tenant_select" ON "fiscalYearSettings" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("fiscalYearSettings"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fiscalYearSettings_tenant_insert" ON "fiscalYearSettings" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("fiscalYearSettings"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fiscalYearSettings_tenant_update" ON "fiscalYearSettings" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("fiscalYearSettings"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("fiscalYearSettings"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fiscalYearSettings_tenant_delete" ON "fiscalYearSettings" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("fiscalYearSettings"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fixture_tenant_select" ON "fixture" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("fixture"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fixture_tenant_insert" ON "fixture" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("fixture"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fixture_tenant_update" ON "fixture" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("fixture"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("fixture"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fixture_tenant_delete" ON "fixture" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("fixture"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fulfillment_tenant_select" ON "fulfillment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("fulfillment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fulfillment_tenant_insert" ON "fulfillment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("fulfillment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fulfillment_tenant_update" ON "fulfillment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("fulfillment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("fulfillment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "fulfillment_tenant_delete" ON "fulfillment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("fulfillment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeCalibrationRecord_tenant_select" ON "gaugeCalibrationRecord" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("gaugeCalibrationRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeCalibrationRecord_tenant_insert" ON "gaugeCalibrationRecord" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("gaugeCalibrationRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeCalibrationRecord_tenant_update" ON "gaugeCalibrationRecord" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("gaugeCalibrationRecord"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("gaugeCalibrationRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeCalibrationRecord_tenant_delete" ON "gaugeCalibrationRecord" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("gaugeCalibrationRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gauge_tenant_select" ON "gauge" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("gauge"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gauge_tenant_insert" ON "gauge" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("gauge"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gauge_tenant_update" ON "gauge" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("gauge"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("gauge"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gauge_tenant_delete" ON "gauge" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("gauge"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeType_tenant_select" ON "gaugeType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("gaugeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeType_tenant_insert" ON "gaugeType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("gaugeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeType_tenant_update" ON "gaugeType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("gaugeType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("gaugeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "gaugeType_tenant_delete" ON "gaugeType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("gaugeType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "group_tenant_select" ON "group" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("group"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "group_tenant_insert" ON "group" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("group"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "group_tenant_update" ON "group" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("group"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("group"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "group_tenant_delete" ON "group" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("group"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "holiday_tenant_select" ON "holiday" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("holiday"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "holiday_tenant_insert" ON "holiday" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("holiday"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "holiday_tenant_update" ON "holiday" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("holiday"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("holiday"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "holiday_tenant_delete" ON "holiday" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("holiday"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionHistory_tenant_select" ON "inboundInspectionHistory" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("inboundInspectionHistory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionHistory_tenant_insert" ON "inboundInspectionHistory" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("inboundInspectionHistory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionHistory_tenant_update" ON "inboundInspectionHistory" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("inboundInspectionHistory"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("inboundInspectionHistory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionHistory_tenant_delete" ON "inboundInspectionHistory" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("inboundInspectionHistory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionSample_tenant_select" ON "inboundInspectionSample" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("inboundInspectionSample"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionSample_tenant_insert" ON "inboundInspectionSample" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("inboundInspectionSample"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionSample_tenant_update" ON "inboundInspectionSample" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("inboundInspectionSample"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("inboundInspectionSample"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspectionSample_tenant_delete" ON "inboundInspectionSample" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("inboundInspectionSample"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspection_tenant_select" ON "inboundInspection" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("inboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspection_tenant_insert" ON "inboundInspection" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("inboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspection_tenant_update" ON "inboundInspection" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("inboundInspection"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("inboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "inboundInspection_tenant_delete" ON "inboundInspection" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("inboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "invite_tenant_select" ON "invite" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("invite"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "invite_tenant_insert" ON "invite" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("invite"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "invite_tenant_update" ON "invite" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("invite"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("invite"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "invite_tenant_delete" ON "invite" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("invite"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemCost_tenant_select" ON "itemCost" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemCost"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemCost_tenant_insert" ON "itemCost" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemCost"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemCost_tenant_update" ON "itemCost" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemCost"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemCost"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemCost_tenant_delete" ON "itemCost" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemCost"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemLedger_tenant_select" ON "itemLedger" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemLedger_tenant_insert" ON "itemLedger" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemLedger_tenant_update" ON "itemLedger" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemLedger"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemLedger_tenant_delete" ON "itemLedger" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPlanning_tenant_select" ON "itemPlanning" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemPlanning"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPlanning_tenant_insert" ON "itemPlanning" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemPlanning"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPlanning_tenant_update" ON "itemPlanning" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemPlanning"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemPlanning"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPlanning_tenant_delete" ON "itemPlanning" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemPlanning"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPostingGroup_tenant_select" ON "itemPostingGroup" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemPostingGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPostingGroup_tenant_insert" ON "itemPostingGroup" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemPostingGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPostingGroup_tenant_update" ON "itemPostingGroup" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemPostingGroup"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemPostingGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemPostingGroup_tenant_delete" ON "itemPostingGroup" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemPostingGroup"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemReplenishment_tenant_select" ON "itemReplenishment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemReplenishment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemReplenishment_tenant_insert" ON "itemReplenishment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemReplenishment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemReplenishment_tenant_update" ON "itemReplenishment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemReplenishment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemReplenishment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemReplenishment_tenant_delete" ON "itemReplenishment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemReplenishment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRuleAssignment_tenant_select" ON "itemRuleAssignment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemRuleAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRuleAssignment_tenant_insert" ON "itemRuleAssignment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemRuleAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRuleAssignment_tenant_update" ON "itemRuleAssignment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemRuleAssignment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemRuleAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRuleAssignment_tenant_delete" ON "itemRuleAssignment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemRuleAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRule_tenant_select" ON "itemRule" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRule_tenant_insert" ON "itemRule" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRule_tenant_update" ON "itemRule" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemRule"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemRule_tenant_delete" ON "itemRule" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemSamplingPlan_tenant_select" ON "itemSamplingPlan" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemSamplingPlan"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemSamplingPlan_tenant_insert" ON "itemSamplingPlan" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemSamplingPlan"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemSamplingPlan_tenant_update" ON "itemSamplingPlan" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemSamplingPlan"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemSamplingPlan"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemSamplingPlan_tenant_delete" ON "itemSamplingPlan" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemSamplingPlan"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemShelfLife_tenant_select" ON "itemShelfLife" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemShelfLife"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemShelfLife_tenant_insert" ON "itemShelfLife" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemShelfLife"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemShelfLife_tenant_update" ON "itemShelfLife" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemShelfLife"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemShelfLife"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemShelfLife_tenant_delete" ON "itemShelfLife" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemShelfLife"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "item_tenant_select" ON "item" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("item"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "item_tenant_insert" ON "item" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("item"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "item_tenant_update" ON "item" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("item"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("item"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "item_tenant_delete" ON "item" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("item"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemUnitSalePrice_tenant_select" ON "itemUnitSalePrice" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("itemUnitSalePrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemUnitSalePrice_tenant_insert" ON "itemUnitSalePrice" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("itemUnitSalePrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemUnitSalePrice_tenant_update" ON "itemUnitSalePrice" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("itemUnitSalePrice"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("itemUnitSalePrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "itemUnitSalePrice_tenant_delete" ON "itemUnitSalePrice" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("itemUnitSalePrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMakeMethod_tenant_select" ON "jobMakeMethod" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMakeMethod_tenant_insert" ON "jobMakeMethod" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMakeMethod_tenant_update" ON "jobMakeMethod" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobMakeMethod"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMakeMethod_tenant_delete" ON "jobMakeMethod" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMaterial_tenant_select" ON "jobMaterial" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMaterial_tenant_insert" ON "jobMaterial" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMaterial_tenant_update" ON "jobMaterial" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobMaterial"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobMaterial_tenant_delete" ON "jobMaterial" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationDependency_tenant_select" ON "jobOperationDependency" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperationDependency"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationDependency_tenant_insert" ON "jobOperationDependency" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperationDependency"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationDependency_tenant_update" ON "jobOperationDependency" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperationDependency"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperationDependency"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationDependency_tenant_delete" ON "jobOperationDependency" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperationDependency"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationNote_tenant_select" ON "jobOperationNote" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperationNote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationNote_tenant_insert" ON "jobOperationNote" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperationNote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationNote_tenant_update" ON "jobOperationNote" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperationNote"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperationNote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationNote_tenant_delete" ON "jobOperationNote" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperationNote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationParameter_tenant_select" ON "jobOperationParameter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationParameter_tenant_insert" ON "jobOperationParameter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationParameter_tenant_update" ON "jobOperationParameter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperationParameter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationParameter_tenant_delete" ON "jobOperationParameter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStepRecord_tenant_select" ON "jobOperationStepRecord" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperationStepRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStepRecord_tenant_insert" ON "jobOperationStepRecord" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperationStepRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStepRecord_tenant_update" ON "jobOperationStepRecord" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperationStepRecord"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperationStepRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStepRecord_tenant_delete" ON "jobOperationStepRecord" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperationStepRecord"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStep_tenant_select" ON "jobOperationStep" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStep_tenant_insert" ON "jobOperationStep" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStep_tenant_update" ON "jobOperationStep" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperationStep"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationStep_tenant_delete" ON "jobOperationStep" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperation_tenant_select" ON "jobOperation" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperation_tenant_insert" ON "jobOperation" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperation_tenant_update" ON "jobOperation" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperation"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperation_tenant_delete" ON "jobOperation" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationTool_tenant_select" ON "jobOperationTool" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("jobOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationTool_tenant_insert" ON "jobOperationTool" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("jobOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationTool_tenant_update" ON "jobOperationTool" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("jobOperationTool"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("jobOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "jobOperationTool_tenant_delete" ON "jobOperationTool" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("jobOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "job_tenant_select" ON "job" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("job"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "job_tenant_insert" ON "job" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("job"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "job_tenant_update" ON "job" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("job"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("job"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "job_tenant_delete" ON "job" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("job"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLineDimension_tenant_select" ON "journalLineDimension" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("journalLineDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLineDimension_tenant_insert" ON "journalLineDimension" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("journalLineDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLineDimension_tenant_update" ON "journalLineDimension" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("journalLineDimension"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("journalLineDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLineDimension_tenant_delete" ON "journalLineDimension" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("journalLineDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLine_tenant_select" ON "journalLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("journalLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLine_tenant_insert" ON "journalLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("journalLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLine_tenant_update" ON "journalLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("journalLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("journalLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journalLine_tenant_delete" ON "journalLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("journalLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journal_tenant_select" ON "journal" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("journal"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journal_tenant_insert" ON "journal" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("journal"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journal_tenant_update" ON "journal" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("journal"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("journal"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "journal_tenant_delete" ON "journal" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("journal"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "kanban_tenant_select" ON "kanban" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("kanban"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "kanban_tenant_insert" ON "kanban" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("kanban"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "kanban_tenant_update" ON "kanban" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("kanban"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("kanban"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "kanban_tenant_delete" ON "kanban" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("kanban"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "location_tenant_select" ON "location" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("location"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "location_tenant_insert" ON "location" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("location"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "location_tenant_update" ON "location" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("location"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("location"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "location_tenant_delete" ON "location" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("location"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchComment_tenant_select" ON "maintenanceDispatchComment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceDispatchComment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchComment_tenant_insert" ON "maintenanceDispatchComment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceDispatchComment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchComment_tenant_update" ON "maintenanceDispatchComment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceDispatchComment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceDispatchComment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchComment_tenant_delete" ON "maintenanceDispatchComment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceDispatchComment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchEvent_tenant_select" ON "maintenanceDispatchEvent" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceDispatchEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchEvent_tenant_insert" ON "maintenanceDispatchEvent" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceDispatchEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchEvent_tenant_update" ON "maintenanceDispatchEvent" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceDispatchEvent"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceDispatchEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchEvent_tenant_delete" ON "maintenanceDispatchEvent" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceDispatchEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItem_tenant_select" ON "maintenanceDispatchItem" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceDispatchItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItem_tenant_insert" ON "maintenanceDispatchItem" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceDispatchItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItem_tenant_update" ON "maintenanceDispatchItem" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceDispatchItem"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceDispatchItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItem_tenant_delete" ON "maintenanceDispatchItem" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceDispatchItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItemTrackedEntity_tenant_select" ON "maintenanceDispatchItemTrackedEntity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceDispatchItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItemTrackedEntity_tenant_insert" ON "maintenanceDispatchItemTrackedEntity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceDispatchItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItemTrackedEntity_tenant_update" ON "maintenanceDispatchItemTrackedEntity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceDispatchItemTrackedEntity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceDispatchItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchItemTrackedEntity_tenant_delete" ON "maintenanceDispatchItemTrackedEntity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceDispatchItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatch_tenant_select" ON "maintenanceDispatch" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceDispatch"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatch_tenant_insert" ON "maintenanceDispatch" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceDispatch"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatch_tenant_update" ON "maintenanceDispatch" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceDispatch"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceDispatch"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatch_tenant_delete" ON "maintenanceDispatch" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceDispatch"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchWorkCenter_tenant_select" ON "maintenanceDispatchWorkCenter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceDispatchWorkCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchWorkCenter_tenant_insert" ON "maintenanceDispatchWorkCenter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceDispatchWorkCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchWorkCenter_tenant_update" ON "maintenanceDispatchWorkCenter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceDispatchWorkCenter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceDispatchWorkCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceDispatchWorkCenter_tenant_delete" ON "maintenanceDispatchWorkCenter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceDispatchWorkCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceFailureMode_tenant_select" ON "maintenanceFailureMode" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceFailureMode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceFailureMode_tenant_insert" ON "maintenanceFailureMode" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceFailureMode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceFailureMode_tenant_update" ON "maintenanceFailureMode" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceFailureMode"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceFailureMode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceFailureMode_tenant_delete" ON "maintenanceFailureMode" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceFailureMode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceScheduleItem_tenant_select" ON "maintenanceScheduleItem" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceScheduleItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceScheduleItem_tenant_insert" ON "maintenanceScheduleItem" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceScheduleItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceScheduleItem_tenant_update" ON "maintenanceScheduleItem" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceScheduleItem"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceScheduleItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceScheduleItem_tenant_delete" ON "maintenanceScheduleItem" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceScheduleItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceSchedule_tenant_select" ON "maintenanceSchedule" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("maintenanceSchedule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceSchedule_tenant_insert" ON "maintenanceSchedule" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("maintenanceSchedule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceSchedule_tenant_update" ON "maintenanceSchedule" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("maintenanceSchedule"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("maintenanceSchedule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "maintenanceSchedule_tenant_delete" ON "maintenanceSchedule" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("maintenanceSchedule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "makeMethod_tenant_select" ON "makeMethod" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("makeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "makeMethod_tenant_insert" ON "makeMethod" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("makeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "makeMethod_tenant_update" ON "makeMethod" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("makeMethod"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("makeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "makeMethod_tenant_delete" ON "makeMethod" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("makeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialDimension_tenant_select" ON "materialDimension" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("materialDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialDimension_tenant_insert" ON "materialDimension" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("materialDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialDimension_tenant_update" ON "materialDimension" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("materialDimension"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("materialDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialDimension_tenant_delete" ON "materialDimension" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("materialDimension"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialFinish_tenant_select" ON "materialFinish" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("materialFinish"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialFinish_tenant_insert" ON "materialFinish" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("materialFinish"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialFinish_tenant_update" ON "materialFinish" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("materialFinish"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("materialFinish"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialFinish_tenant_delete" ON "materialFinish" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("materialFinish"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialForm_tenant_select" ON "materialForm" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("materialForm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialForm_tenant_insert" ON "materialForm" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("materialForm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialForm_tenant_update" ON "materialForm" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("materialForm"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("materialForm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialForm_tenant_delete" ON "materialForm" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("materialForm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialGrade_tenant_select" ON "materialGrade" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("materialGrade"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialGrade_tenant_insert" ON "materialGrade" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("materialGrade"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialGrade_tenant_update" ON "materialGrade" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("materialGrade"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("materialGrade"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialGrade_tenant_delete" ON "materialGrade" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("materialGrade"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialSubstance_tenant_select" ON "materialSubstance" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("materialSubstance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialSubstance_tenant_insert" ON "materialSubstance" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("materialSubstance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialSubstance_tenant_update" ON "materialSubstance" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("materialSubstance"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("materialSubstance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialSubstance_tenant_delete" ON "materialSubstance" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("materialSubstance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "material_tenant_select" ON "material" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("material"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "material_tenant_insert" ON "material" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("material"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "material_tenant_update" ON "material" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("material"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("material"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "material_tenant_delete" ON "material" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("material"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialType_tenant_select" ON "materialType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("materialType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialType_tenant_insert" ON "materialType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("materialType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialType_tenant_update" ON "materialType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("materialType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("materialType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "materialType_tenant_delete" ON "materialType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("materialType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodMaterial_tenant_select" ON "methodMaterial" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("methodMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodMaterial_tenant_insert" ON "methodMaterial" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("methodMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodMaterial_tenant_update" ON "methodMaterial" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("methodMaterial"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("methodMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodMaterial_tenant_delete" ON "methodMaterial" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("methodMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationParameter_tenant_select" ON "methodOperationParameter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("methodOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationParameter_tenant_insert" ON "methodOperationParameter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("methodOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationParameter_tenant_update" ON "methodOperationParameter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("methodOperationParameter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("methodOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationParameter_tenant_delete" ON "methodOperationParameter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("methodOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationStep_tenant_select" ON "methodOperationStep" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("methodOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationStep_tenant_insert" ON "methodOperationStep" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("methodOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationStep_tenant_update" ON "methodOperationStep" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("methodOperationStep"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("methodOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationStep_tenant_delete" ON "methodOperationStep" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("methodOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperation_tenant_select" ON "methodOperation" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("methodOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperation_tenant_insert" ON "methodOperation" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("methodOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperation_tenant_update" ON "methodOperation" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("methodOperation"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("methodOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperation_tenant_delete" ON "methodOperation" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("methodOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationTool_tenant_select" ON "methodOperationTool" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("methodOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationTool_tenant_insert" ON "methodOperationTool" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("methodOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationTool_tenant_update" ON "methodOperationTool" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("methodOperationTool"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("methodOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "methodOperationTool_tenant_delete" ON "methodOperationTool" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("methodOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "modelUpload_tenant_select" ON "modelUpload" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("modelUpload"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "modelUpload_tenant_insert" ON "modelUpload" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("modelUpload"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "modelUpload_tenant_update" ON "modelUpload" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("modelUpload"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("modelUpload"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "modelUpload_tenant_delete" ON "modelUpload" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("modelUpload"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "noQuoteReason_tenant_select" ON "noQuoteReason" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("noQuoteReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "noQuoteReason_tenant_insert" ON "noQuoteReason" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("noQuoteReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "noQuoteReason_tenant_update" ON "noQuoteReason" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("noQuoteReason"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("noQuoteReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "noQuoteReason_tenant_delete" ON "noQuoteReason" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("noQuoteReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionProcess_tenant_select" ON "nonConformanceActionProcess" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceActionProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionProcess_tenant_insert" ON "nonConformanceActionProcess" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceActionProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionProcess_tenant_update" ON "nonConformanceActionProcess" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceActionProcess"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceActionProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionProcess_tenant_delete" ON "nonConformanceActionProcess" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceActionProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionTask_tenant_select" ON "nonConformanceActionTask" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceActionTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionTask_tenant_insert" ON "nonConformanceActionTask" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceActionTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionTask_tenant_update" ON "nonConformanceActionTask" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceActionTask"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceActionTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceActionTask_tenant_delete" ON "nonConformanceActionTask" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceActionTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceApprovalTask_tenant_select" ON "nonConformanceApprovalTask" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceApprovalTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceApprovalTask_tenant_insert" ON "nonConformanceApprovalTask" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceApprovalTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceApprovalTask_tenant_update" ON "nonConformanceApprovalTask" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceApprovalTask"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceApprovalTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceApprovalTask_tenant_delete" ON "nonConformanceApprovalTask" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceApprovalTask"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceCustomer_tenant_select" ON "nonConformanceCustomer" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceCustomer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceCustomer_tenant_insert" ON "nonConformanceCustomer" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceCustomer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceCustomer_tenant_update" ON "nonConformanceCustomer" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceCustomer"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceCustomer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceCustomer_tenant_delete" ON "nonConformanceCustomer" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceCustomer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceInboundInspection_tenant_select" ON "nonConformanceInboundInspection" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceInboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceInboundInspection_tenant_insert" ON "nonConformanceInboundInspection" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceInboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceInboundInspection_tenant_update" ON "nonConformanceInboundInspection" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceInboundInspection"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceInboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceInboundInspection_tenant_delete" ON "nonConformanceInboundInspection" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceInboundInspection"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItem_tenant_select" ON "nonConformanceItem" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItem_tenant_insert" ON "nonConformanceItem" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItem_tenant_update" ON "nonConformanceItem" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceItem"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItem_tenant_delete" ON "nonConformanceItem" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceItem"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItemTrackedEntity_tenant_select" ON "nonConformanceItemTrackedEntity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItemTrackedEntity_tenant_insert" ON "nonConformanceItemTrackedEntity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItemTrackedEntity_tenant_update" ON "nonConformanceItemTrackedEntity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceItemTrackedEntity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceItemTrackedEntity_tenant_delete" ON "nonConformanceItemTrackedEntity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceItemTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceJobOperation_tenant_select" ON "nonConformanceJobOperation" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceJobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceJobOperation_tenant_insert" ON "nonConformanceJobOperation" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceJobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceJobOperation_tenant_update" ON "nonConformanceJobOperation" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceJobOperation"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceJobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceJobOperation_tenant_delete" ON "nonConformanceJobOperation" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceJobOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformancePurchaseOrderLine_tenant_select" ON "nonConformancePurchaseOrderLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformancePurchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformancePurchaseOrderLine_tenant_insert" ON "nonConformancePurchaseOrderLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformancePurchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformancePurchaseOrderLine_tenant_update" ON "nonConformancePurchaseOrderLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformancePurchaseOrderLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformancePurchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformancePurchaseOrderLine_tenant_delete" ON "nonConformancePurchaseOrderLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformancePurchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReceiptLine_tenant_select" ON "nonConformanceReceiptLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceReceiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReceiptLine_tenant_insert" ON "nonConformanceReceiptLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceReceiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReceiptLine_tenant_update" ON "nonConformanceReceiptLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceReceiptLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceReceiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReceiptLine_tenant_delete" ON "nonConformanceReceiptLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceReceiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceRequiredAction_tenant_select" ON "nonConformanceRequiredAction" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceRequiredAction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceRequiredAction_tenant_insert" ON "nonConformanceRequiredAction" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceRequiredAction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceRequiredAction_tenant_update" ON "nonConformanceRequiredAction" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceRequiredAction"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceRequiredAction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceRequiredAction_tenant_delete" ON "nonConformanceRequiredAction" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceRequiredAction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReviewer_tenant_select" ON "nonConformanceReviewer" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceReviewer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReviewer_tenant_insert" ON "nonConformanceReviewer" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceReviewer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReviewer_tenant_update" ON "nonConformanceReviewer" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceReviewer"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceReviewer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceReviewer_tenant_delete" ON "nonConformanceReviewer" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceReviewer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSalesOrderLine_tenant_select" ON "nonConformanceSalesOrderLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceSalesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSalesOrderLine_tenant_insert" ON "nonConformanceSalesOrderLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceSalesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSalesOrderLine_tenant_update" ON "nonConformanceSalesOrderLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceSalesOrderLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceSalesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSalesOrderLine_tenant_delete" ON "nonConformanceSalesOrderLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceSalesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceShipmentLine_tenant_select" ON "nonConformanceShipmentLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceShipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceShipmentLine_tenant_insert" ON "nonConformanceShipmentLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceShipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceShipmentLine_tenant_update" ON "nonConformanceShipmentLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceShipmentLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceShipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceShipmentLine_tenant_delete" ON "nonConformanceShipmentLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceShipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSupplier_tenant_select" ON "nonConformanceSupplier" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSupplier_tenant_insert" ON "nonConformanceSupplier" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSupplier_tenant_update" ON "nonConformanceSupplier" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceSupplier"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceSupplier_tenant_delete" ON "nonConformanceSupplier" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformance_tenant_select" ON "nonConformance" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformance_tenant_insert" ON "nonConformance" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformance_tenant_update" ON "nonConformance" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformance"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformance_tenant_delete" ON "nonConformance" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformance"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceTrackedEntity_tenant_select" ON "nonConformanceTrackedEntity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceTrackedEntity_tenant_insert" ON "nonConformanceTrackedEntity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceTrackedEntity_tenant_update" ON "nonConformanceTrackedEntity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceTrackedEntity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceTrackedEntity_tenant_delete" ON "nonConformanceTrackedEntity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceTrackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceType_tenant_select" ON "nonConformanceType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceType_tenant_insert" ON "nonConformanceType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceType_tenant_update" ON "nonConformanceType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceType_tenant_delete" ON "nonConformanceType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceWorkflow_tenant_select" ON "nonConformanceWorkflow" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("nonConformanceWorkflow"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceWorkflow_tenant_insert" ON "nonConformanceWorkflow" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("nonConformanceWorkflow"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceWorkflow_tenant_update" ON "nonConformanceWorkflow" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("nonConformanceWorkflow"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("nonConformanceWorkflow"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "nonConformanceWorkflow_tenant_delete" ON "nonConformanceWorkflow" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("nonConformanceWorkflow"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "note_tenant_select" ON "note" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("note"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "note_tenant_insert" ON "note" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("note"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "note_tenant_update" ON "note" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("note"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("note"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "note_tenant_delete" ON "note" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("note"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthClient_tenant_select" ON "oauthClient" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("oauthClient"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthClient_tenant_insert" ON "oauthClient" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("oauthClient"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthClient_tenant_update" ON "oauthClient" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("oauthClient"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("oauthClient"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthClient_tenant_delete" ON "oauthClient" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("oauthClient"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthCode_tenant_select" ON "oauthCode" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("oauthCode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthCode_tenant_insert" ON "oauthCode" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("oauthCode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthCode_tenant_update" ON "oauthCode" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("oauthCode"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("oauthCode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthCode_tenant_delete" ON "oauthCode" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("oauthCode"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthToken_tenant_select" ON "oauthToken" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("oauthToken"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthToken_tenant_insert" ON "oauthToken" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("oauthToken"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthToken_tenant_update" ON "oauthToken" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("oauthToken"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("oauthToken"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "oauthToken_tenant_delete" ON "oauthToken" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("oauthToken"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "opportunity_tenant_select" ON "opportunity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("opportunity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "opportunity_tenant_insert" ON "opportunity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("opportunity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "opportunity_tenant_update" ON "opportunity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("opportunity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("opportunity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "opportunity_tenant_delete" ON "opportunity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("opportunity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "part_tenant_select" ON "part" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("part"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "part_tenant_insert" ON "part" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("part"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "part_tenant_update" ON "part" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("part"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("part"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "part_tenant_delete" ON "part" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("part"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "partner_tenant_select" ON "partner" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("partner"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "partner_tenant_insert" ON "partner" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("partner"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "partner_tenant_update" ON "partner" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("partner"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("partner"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "partner_tenant_delete" ON "partner" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("partner"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "paymentTerm_tenant_select" ON "paymentTerm" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("paymentTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "paymentTerm_tenant_insert" ON "paymentTerm" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("paymentTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "paymentTerm_tenant_update" ON "paymentTerm" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("paymentTerm"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("paymentTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "paymentTerm_tenant_delete" ON "paymentTerm" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("paymentTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pickMethod_tenant_select" ON "pickMethod" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("pickMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pickMethod_tenant_insert" ON "pickMethod" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("pickMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pickMethod_tenant_update" ON "pickMethod" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("pickMethod"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("pickMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pickMethod_tenant_delete" ON "pickMethod" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("pickMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pricingRule_tenant_select" ON "pricingRule" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("pricingRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pricingRule_tenant_insert" ON "pricingRule" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("pricingRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pricingRule_tenant_update" ON "pricingRule" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("pricingRule"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("pricingRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "pricingRule_tenant_delete" ON "pricingRule" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("pricingRule"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureParameter_tenant_select" ON "procedureParameter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("procedureParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureParameter_tenant_insert" ON "procedureParameter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("procedureParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureParameter_tenant_update" ON "procedureParameter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("procedureParameter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("procedureParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureParameter_tenant_delete" ON "procedureParameter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("procedureParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureStep_tenant_select" ON "procedureStep" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("procedureStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureStep_tenant_insert" ON "procedureStep" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("procedureStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureStep_tenant_update" ON "procedureStep" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("procedureStep"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("procedureStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedureStep_tenant_delete" ON "procedureStep" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("procedureStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedure_tenant_select" ON "procedure" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("procedure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedure_tenant_insert" ON "procedure" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("procedure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedure_tenant_update" ON "procedure" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("procedure"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("procedure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "procedure_tenant_delete" ON "procedure" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("procedure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "process_tenant_select" ON "process" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("process"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "process_tenant_insert" ON "process" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("process"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "process_tenant_update" ON "process" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("process"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("process"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "process_tenant_delete" ON "process" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("process"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionEvent_tenant_select" ON "productionEvent" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("productionEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionEvent_tenant_insert" ON "productionEvent" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("productionEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionEvent_tenant_update" ON "productionEvent" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("productionEvent"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("productionEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionEvent_tenant_delete" ON "productionEvent" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("productionEvent"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionQuantity_tenant_select" ON "productionQuantity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("productionQuantity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionQuantity_tenant_insert" ON "productionQuantity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("productionQuantity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionQuantity_tenant_update" ON "productionQuantity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("productionQuantity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("productionQuantity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "productionQuantity_tenant_delete" ON "productionQuantity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("productionQuantity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceDelivery_tenant_select" ON "purchaseInvoiceDelivery" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseInvoiceDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceDelivery_tenant_insert" ON "purchaseInvoiceDelivery" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseInvoiceDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceDelivery_tenant_update" ON "purchaseInvoiceDelivery" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseInvoiceDelivery"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseInvoiceDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceDelivery_tenant_delete" ON "purchaseInvoiceDelivery" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseInvoiceDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceLine_tenant_select" ON "purchaseInvoiceLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceLine_tenant_insert" ON "purchaseInvoiceLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceLine_tenant_update" ON "purchaseInvoiceLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseInvoiceLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoiceLine_tenant_delete" ON "purchaseInvoiceLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoice_tenant_select" ON "purchaseInvoice" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoice_tenant_insert" ON "purchaseInvoice" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoice_tenant_update" ON "purchaseInvoice" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseInvoice"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseInvoice_tenant_delete" ON "purchaseInvoice" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderDelivery_tenant_select" ON "purchaseOrderDelivery" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseOrderDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderDelivery_tenant_insert" ON "purchaseOrderDelivery" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseOrderDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderDelivery_tenant_update" ON "purchaseOrderDelivery" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseOrderDelivery"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseOrderDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderDelivery_tenant_delete" ON "purchaseOrderDelivery" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseOrderDelivery"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderLine_tenant_select" ON "purchaseOrderLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderLine_tenant_insert" ON "purchaseOrderLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderLine_tenant_update" ON "purchaseOrderLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseOrderLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderLine_tenant_delete" ON "purchaseOrderLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderPayment_tenant_select" ON "purchaseOrderPayment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderPayment_tenant_insert" ON "purchaseOrderPayment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderPayment_tenant_update" ON "purchaseOrderPayment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseOrderPayment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrderPayment_tenant_delete" ON "purchaseOrderPayment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrder_tenant_select" ON "purchaseOrder" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrder_tenant_insert" ON "purchaseOrder" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrder_tenant_update" ON "purchaseOrder" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchaseOrder"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchaseOrder_tenant_delete" ON "purchaseOrder" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasePayment_tenant_select" ON "purchasePayment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchasePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasePayment_tenant_insert" ON "purchasePayment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchasePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasePayment_tenant_update" ON "purchasePayment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchasePayment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchasePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasePayment_tenant_delete" ON "purchasePayment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchasePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqLine_tenant_select" ON "purchasingRfqLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchasingRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqLine_tenant_insert" ON "purchasingRfqLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchasingRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqLine_tenant_update" ON "purchasingRfqLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchasingRfqLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchasingRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqLine_tenant_delete" ON "purchasingRfqLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchasingRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqSupplier_tenant_select" ON "purchasingRfqSupplier" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchasingRfqSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqSupplier_tenant_insert" ON "purchasingRfqSupplier" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchasingRfqSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqSupplier_tenant_update" ON "purchasingRfqSupplier" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchasingRfqSupplier"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchasingRfqSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqSupplier_tenant_delete" ON "purchasingRfqSupplier" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchasingRfqSupplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfq_tenant_select" ON "purchasingRfq" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchasingRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfq_tenant_insert" ON "purchasingRfq" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchasingRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfq_tenant_update" ON "purchasingRfq" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchasingRfq"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchasingRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfq_tenant_delete" ON "purchasingRfq" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchasingRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToPurchaseOrder_tenant_select" ON "purchasingRfqToPurchaseOrder" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchasingRfqToPurchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToPurchaseOrder_tenant_insert" ON "purchasingRfqToPurchaseOrder" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchasingRfqToPurchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToPurchaseOrder_tenant_update" ON "purchasingRfqToPurchaseOrder" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchasingRfqToPurchaseOrder"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchasingRfqToPurchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToPurchaseOrder_tenant_delete" ON "purchasingRfqToPurchaseOrder" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchasingRfqToPurchaseOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToSupplierQuote_tenant_select" ON "purchasingRfqToSupplierQuote" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("purchasingRfqToSupplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToSupplierQuote_tenant_insert" ON "purchasingRfqToSupplierQuote" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("purchasingRfqToSupplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToSupplierQuote_tenant_update" ON "purchasingRfqToSupplierQuote" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("purchasingRfqToSupplierQuote"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("purchasingRfqToSupplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "purchasingRfqToSupplierQuote_tenant_delete" ON "purchasingRfqToSupplierQuote" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("purchasingRfqToSupplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocumentStep_tenant_select" ON "qualityDocumentStep" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("qualityDocumentStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocumentStep_tenant_insert" ON "qualityDocumentStep" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("qualityDocumentStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocumentStep_tenant_update" ON "qualityDocumentStep" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("qualityDocumentStep"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("qualityDocumentStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocumentStep_tenant_delete" ON "qualityDocumentStep" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("qualityDocumentStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocument_tenant_select" ON "qualityDocument" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("qualityDocument"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocument_tenant_insert" ON "qualityDocument" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("qualityDocument"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocument_tenant_update" ON "qualityDocument" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("qualityDocument"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("qualityDocument"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "qualityDocument_tenant_delete" ON "qualityDocument" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("qualityDocument"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteLine_tenant_select" ON "quoteLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteLine_tenant_insert" ON "quoteLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteLine_tenant_update" ON "quoteLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteLine_tenant_delete" ON "quoteLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMakeMethod_tenant_select" ON "quoteMakeMethod" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMakeMethod_tenant_insert" ON "quoteMakeMethod" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMakeMethod_tenant_update" ON "quoteMakeMethod" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteMakeMethod"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMakeMethod_tenant_delete" ON "quoteMakeMethod" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteMakeMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMaterial_tenant_select" ON "quoteMaterial" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMaterial_tenant_insert" ON "quoteMaterial" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMaterial_tenant_update" ON "quoteMaterial" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteMaterial"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteMaterial_tenant_delete" ON "quoteMaterial" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteMaterial"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationParameter_tenant_select" ON "quoteOperationParameter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationParameter_tenant_insert" ON "quoteOperationParameter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationParameter_tenant_update" ON "quoteOperationParameter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteOperationParameter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationParameter_tenant_delete" ON "quoteOperationParameter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteOperationParameter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationStep_tenant_select" ON "quoteOperationStep" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationStep_tenant_insert" ON "quoteOperationStep" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationStep_tenant_update" ON "quoteOperationStep" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteOperationStep"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationStep_tenant_delete" ON "quoteOperationStep" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteOperationStep"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperation_tenant_select" ON "quoteOperation" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperation_tenant_insert" ON "quoteOperation" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperation_tenant_update" ON "quoteOperation" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteOperation"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperation_tenant_delete" ON "quoteOperation" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteOperation"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationTool_tenant_select" ON "quoteOperationTool" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationTool_tenant_insert" ON "quoteOperationTool" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationTool_tenant_update" ON "quoteOperationTool" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteOperationTool"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteOperationTool_tenant_delete" ON "quoteOperationTool" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteOperationTool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quotePayment_tenant_select" ON "quotePayment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quotePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quotePayment_tenant_insert" ON "quotePayment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quotePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quotePayment_tenant_update" ON "quotePayment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quotePayment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quotePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quotePayment_tenant_delete" ON "quotePayment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quotePayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteShipment_tenant_select" ON "quoteShipment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quoteShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteShipment_tenant_insert" ON "quoteShipment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quoteShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteShipment_tenant_update" ON "quoteShipment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quoteShipment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quoteShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quoteShipment_tenant_delete" ON "quoteShipment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quoteShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quote_tenant_select" ON "quote" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("quote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quote_tenant_insert" ON "quote" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("quote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quote_tenant_update" ON "quote" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("quote"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("quote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "quote_tenant_delete" ON "quote" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("quote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receiptLine_tenant_select" ON "receiptLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("receiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receiptLine_tenant_insert" ON "receiptLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("receiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receiptLine_tenant_update" ON "receiptLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("receiptLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("receiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receiptLine_tenant_delete" ON "receiptLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("receiptLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receipt_tenant_select" ON "receipt" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("receipt"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receipt_tenant_insert" ON "receipt" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("receipt"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receipt_tenant_update" ON "receipt" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("receipt"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("receipt"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "receipt_tenant_delete" ON "receipt" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("receipt"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "riskRegister_tenant_select" ON "riskRegister" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("riskRegister"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "riskRegister_tenant_insert" ON "riskRegister" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("riskRegister"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "riskRegister_tenant_update" ON "riskRegister" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("riskRegister"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("riskRegister"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "riskRegister_tenant_delete" ON "riskRegister" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("riskRegister"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceLine_tenant_select" ON "salesInvoiceLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceLine_tenant_insert" ON "salesInvoiceLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceLine_tenant_update" ON "salesInvoiceLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesInvoiceLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceLine_tenant_delete" ON "salesInvoiceLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesInvoiceLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceShipment_tenant_select" ON "salesInvoiceShipment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesInvoiceShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceShipment_tenant_insert" ON "salesInvoiceShipment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesInvoiceShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceShipment_tenant_update" ON "salesInvoiceShipment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesInvoiceShipment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesInvoiceShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoiceShipment_tenant_delete" ON "salesInvoiceShipment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesInvoiceShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoice_tenant_select" ON "salesInvoice" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoice_tenant_insert" ON "salesInvoice" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoice_tenant_update" ON "salesInvoice" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesInvoice"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesInvoice_tenant_delete" ON "salesInvoice" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesInvoice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderLine_tenant_select" ON "salesOrderLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderLine_tenant_insert" ON "salesOrderLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderLine_tenant_update" ON "salesOrderLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesOrderLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderLine_tenant_delete" ON "salesOrderLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesOrderLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderPayment_tenant_select" ON "salesOrderPayment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderPayment_tenant_insert" ON "salesOrderPayment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderPayment_tenant_update" ON "salesOrderPayment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesOrderPayment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderPayment_tenant_delete" ON "salesOrderPayment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesOrderPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderShipment_tenant_select" ON "salesOrderShipment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesOrderShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderShipment_tenant_insert" ON "salesOrderShipment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesOrderShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderShipment_tenant_update" ON "salesOrderShipment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesOrderShipment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesOrderShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrderShipment_tenant_delete" ON "salesOrderShipment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesOrderShipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrder_tenant_select" ON "salesOrder" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrder_tenant_insert" ON "salesOrder" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrder_tenant_update" ON "salesOrder" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesOrder"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesOrder_tenant_delete" ON "salesOrder" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesOrder"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfqLine_tenant_select" ON "salesRfqLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfqLine_tenant_insert" ON "salesRfqLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfqLine_tenant_update" ON "salesRfqLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesRfqLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfqLine_tenant_delete" ON "salesRfqLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesRfqLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfq_tenant_select" ON "salesRfq" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("salesRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfq_tenant_insert" ON "salesRfq" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("salesRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfq_tenant_update" ON "salesRfq" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("salesRfq"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("salesRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "salesRfq_tenant_delete" ON "salesRfq" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("salesRfq"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "scrapReason_tenant_select" ON "scrapReason" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("scrapReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "scrapReason_tenant_insert" ON "scrapReason" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("scrapReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "scrapReason_tenant_update" ON "scrapReason" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("scrapReason"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("scrapReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "scrapReason_tenant_delete" ON "scrapReason" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("scrapReason"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "searchIndexRegistry_tenant_select" ON "searchIndexRegistry" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("searchIndexRegistry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "searchIndexRegistry_tenant_insert" ON "searchIndexRegistry" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("searchIndexRegistry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "searchIndexRegistry_tenant_update" ON "searchIndexRegistry" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("searchIndexRegistry"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("searchIndexRegistry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "searchIndexRegistry_tenant_delete" ON "searchIndexRegistry" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("searchIndexRegistry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "sequence_tenant_select" ON "sequence" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("sequence"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "sequence_tenant_insert" ON "sequence" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("sequence"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "sequence_tenant_update" ON "sequence" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("sequence"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("sequence"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "sequence_tenant_delete" ON "sequence" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("sequence"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "service_tenant_select" ON "service" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("service"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "service_tenant_insert" ON "service" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("service"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "service_tenant_update" ON "service" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("service"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("service"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "service_tenant_delete" ON "service" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("service"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shift_tenant_select" ON "shift" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("shift"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shift_tenant_insert" ON "shift" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("shift"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shift_tenant_update" ON "shift" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("shift"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("shift"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shift_tenant_delete" ON "shift" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("shift"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipmentLine_tenant_select" ON "shipmentLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("shipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipmentLine_tenant_insert" ON "shipmentLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("shipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipmentLine_tenant_update" ON "shipmentLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("shipmentLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("shipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipmentLine_tenant_delete" ON "shipmentLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("shipmentLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipment_tenant_select" ON "shipment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("shipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipment_tenant_insert" ON "shipment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("shipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipment_tenant_update" ON "shipment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("shipment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("shipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shipment_tenant_delete" ON "shipment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("shipment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingMethod_tenant_select" ON "shippingMethod" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("shippingMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingMethod_tenant_insert" ON "shippingMethod" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("shippingMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingMethod_tenant_update" ON "shippingMethod" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("shippingMethod"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("shippingMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingMethod_tenant_delete" ON "shippingMethod" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("shippingMethod"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingTerm_tenant_select" ON "shippingTerm" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("shippingTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingTerm_tenant_insert" ON "shippingTerm" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("shippingTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingTerm_tenant_update" ON "shippingTerm" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("shippingTerm"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("shippingTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "shippingTerm_tenant_delete" ON "shippingTerm" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("shippingTerm"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "slackDocumentThread_tenant_select" ON "slackDocumentThread" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("slackDocumentThread"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "slackDocumentThread_tenant_insert" ON "slackDocumentThread" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("slackDocumentThread"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "slackDocumentThread_tenant_update" ON "slackDocumentThread" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("slackDocumentThread"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("slackDocumentThread"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "slackDocumentThread_tenant_delete" ON "slackDocumentThread" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("slackDocumentThread"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransferLine_tenant_select" ON "stockTransferLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("stockTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransferLine_tenant_insert" ON "stockTransferLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("stockTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransferLine_tenant_update" ON "stockTransferLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("stockTransferLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("stockTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransferLine_tenant_delete" ON "stockTransferLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("stockTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransfer_tenant_select" ON "stockTransfer" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("stockTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransfer_tenant_insert" ON "stockTransfer" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("stockTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransfer_tenant_update" ON "stockTransfer" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("stockTransfer"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("stockTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "stockTransfer_tenant_delete" ON "stockTransfer" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("stockTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageType_tenant_select" ON "storageType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("storageType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageType_tenant_insert" ON "storageType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("storageType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageType_tenant_update" ON "storageType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("storageType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("storageType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageType_tenant_delete" ON "storageType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("storageType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageUnit_tenant_select" ON "storageUnit" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("storageUnit"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageUnit_tenant_insert" ON "storageUnit" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("storageUnit"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageUnit_tenant_update" ON "storageUnit" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("storageUnit"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("storageUnit"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "storageUnit_tenant_delete" ON "storageUnit" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("storageUnit"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "suggestion_tenant_select" ON "suggestion" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("suggestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "suggestion_tenant_insert" ON "suggestion" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("suggestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "suggestion_tenant_update" ON "suggestion" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("suggestion"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("suggestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "suggestion_tenant_delete" ON "suggestion" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("suggestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierAccount_tenant_select" ON "supplierAccount" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierAccount_tenant_insert" ON "supplierAccount" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierAccount_tenant_update" ON "supplierAccount" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierAccount"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierAccount_tenant_delete" ON "supplierAccount" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierAccount"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierInteraction_tenant_select" ON "supplierInteraction" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierInteraction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierInteraction_tenant_insert" ON "supplierInteraction" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierInteraction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierInteraction_tenant_update" ON "supplierInteraction" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierInteraction"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierInteraction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierInteraction_tenant_delete" ON "supplierInteraction" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierInteraction"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierLedger_tenant_select" ON "supplierLedger" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierLedger_tenant_insert" ON "supplierLedger" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierLedger_tenant_update" ON "supplierLedger" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierLedger"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierLedger_tenant_delete" ON "supplierLedger" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierLedger"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPartPrice_tenant_select" ON "supplierPartPrice" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierPartPrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPartPrice_tenant_insert" ON "supplierPartPrice" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierPartPrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPartPrice_tenant_update" ON "supplierPartPrice" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierPartPrice"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierPartPrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPartPrice_tenant_delete" ON "supplierPartPrice" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierPartPrice"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPart_tenant_select" ON "supplierPart" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPart_tenant_insert" ON "supplierPart" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPart_tenant_update" ON "supplierPart" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierPart"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPart_tenant_delete" ON "supplierPart" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPayment_tenant_select" ON "supplierPayment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPayment_tenant_insert" ON "supplierPayment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPayment_tenant_update" ON "supplierPayment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierPayment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierPayment_tenant_delete" ON "supplierPayment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierPayment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierProcess_tenant_select" ON "supplierProcess" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierProcess_tenant_insert" ON "supplierProcess" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierProcess_tenant_update" ON "supplierProcess" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierProcess"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierProcess_tenant_delete" ON "supplierProcess" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuoteLine_tenant_select" ON "supplierQuoteLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierQuoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuoteLine_tenant_insert" ON "supplierQuoteLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierQuoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuoteLine_tenant_update" ON "supplierQuoteLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierQuoteLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierQuoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuoteLine_tenant_delete" ON "supplierQuoteLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierQuoteLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuote_tenant_select" ON "supplierQuote" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuote_tenant_insert" ON "supplierQuote" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuote_tenant_update" ON "supplierQuote" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierQuote"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierQuote_tenant_delete" ON "supplierQuote" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierQuote"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierShipping_tenant_select" ON "supplierShipping" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierShipping_tenant_insert" ON "supplierShipping" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierShipping_tenant_update" ON "supplierShipping" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierShipping"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierShipping_tenant_delete" ON "supplierShipping" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierShipping"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplier_tenant_select" ON "supplier" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplier_tenant_insert" ON "supplier" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplier_tenant_update" ON "supplier" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplier"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplier_tenant_delete" ON "supplier" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplier"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierTax_tenant_select" ON "supplierTax" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierTax_tenant_insert" ON "supplierTax" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierTax_tenant_update" ON "supplierTax" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierTax"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierTax_tenant_delete" ON "supplierTax" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierTax"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierType_tenant_select" ON "supplierType" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplierType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierType_tenant_insert" ON "supplierType" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplierType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierType_tenant_update" ON "supplierType" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplierType"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplierType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplierType_tenant_delete" ON "supplierType" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplierType"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyActual_tenant_select" ON "supplyActual" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplyActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyActual_tenant_insert" ON "supplyActual" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplyActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyActual_tenant_update" ON "supplyActual" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplyActual"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplyActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyActual_tenant_delete" ON "supplyActual" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplyActual"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyForecast_tenant_select" ON "supplyForecast" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("supplyForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyForecast_tenant_insert" ON "supplyForecast" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("supplyForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyForecast_tenant_update" ON "supplyForecast" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("supplyForecast"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("supplyForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "supplyForecast_tenant_delete" ON "supplyForecast" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("supplyForecast"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tableView_tenant_select" ON "tableView" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("tableView"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tableView_tenant_insert" ON "tableView" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("tableView"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tableView_tenant_update" ON "tableView" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("tableView"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("tableView"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tableView_tenant_delete" ON "tableView" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("tableView"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tag_tenant_select" ON "tag" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("tag"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tag_tenant_insert" ON "tag" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("tag"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tag_tenant_update" ON "tag" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("tag"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("tag"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tag_tenant_delete" ON "tag" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("tag"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "timeCardEntry_tenant_select" ON "timeCardEntry" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("timeCardEntry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "timeCardEntry_tenant_insert" ON "timeCardEntry" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("timeCardEntry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "timeCardEntry_tenant_update" ON "timeCardEntry" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("timeCardEntry"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("timeCardEntry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "timeCardEntry_tenant_delete" ON "timeCardEntry" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("timeCardEntry"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tool_tenant_select" ON "tool" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("tool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tool_tenant_insert" ON "tool" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("tool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tool_tenant_update" ON "tool" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("tool"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("tool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "tool_tenant_delete" ON "tool" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("tool"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityInput_tenant_select" ON "trackedActivityInput" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trackedActivityInput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityInput_tenant_insert" ON "trackedActivityInput" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trackedActivityInput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityInput_tenant_update" ON "trackedActivityInput" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trackedActivityInput"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trackedActivityInput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityInput_tenant_delete" ON "trackedActivityInput" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trackedActivityInput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityOutput_tenant_select" ON "trackedActivityOutput" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trackedActivityOutput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityOutput_tenant_insert" ON "trackedActivityOutput" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trackedActivityOutput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityOutput_tenant_update" ON "trackedActivityOutput" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trackedActivityOutput"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trackedActivityOutput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivityOutput_tenant_delete" ON "trackedActivityOutput" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trackedActivityOutput"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivity_tenant_select" ON "trackedActivity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trackedActivity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivity_tenant_insert" ON "trackedActivity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trackedActivity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivity_tenant_update" ON "trackedActivity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trackedActivity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trackedActivity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedActivity_tenant_delete" ON "trackedActivity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trackedActivity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedEntity_tenant_select" ON "trackedEntity" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedEntity_tenant_insert" ON "trackedEntity" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedEntity_tenant_update" ON "trackedEntity" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trackedEntity"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trackedEntity_tenant_delete" ON "trackedEntity" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trackedEntity"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingAssignment_tenant_select" ON "trainingAssignment" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trainingAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingAssignment_tenant_insert" ON "trainingAssignment" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trainingAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingAssignment_tenant_update" ON "trainingAssignment" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trainingAssignment"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trainingAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingAssignment_tenant_delete" ON "trainingAssignment" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trainingAssignment"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingCompletion_tenant_select" ON "trainingCompletion" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trainingCompletion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingCompletion_tenant_insert" ON "trainingCompletion" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trainingCompletion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingCompletion_tenant_update" ON "trainingCompletion" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trainingCompletion"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trainingCompletion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingCompletion_tenant_delete" ON "trainingCompletion" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trainingCompletion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingQuestion_tenant_select" ON "trainingQuestion" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("trainingQuestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingQuestion_tenant_insert" ON "trainingQuestion" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("trainingQuestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingQuestion_tenant_update" ON "trainingQuestion" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("trainingQuestion"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("trainingQuestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "trainingQuestion_tenant_delete" ON "trainingQuestion" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("trainingQuestion"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "training_tenant_select" ON "training" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("training"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "training_tenant_insert" ON "training" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("training"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "training_tenant_update" ON "training" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("training"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("training"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "training_tenant_delete" ON "training" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("training"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "unitOfMeasure_tenant_select" ON "unitOfMeasure" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("unitOfMeasure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "unitOfMeasure_tenant_insert" ON "unitOfMeasure" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("unitOfMeasure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "unitOfMeasure_tenant_update" ON "unitOfMeasure" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("unitOfMeasure"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("unitOfMeasure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "unitOfMeasure_tenant_delete" ON "unitOfMeasure" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("unitOfMeasure"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userAttributeCategory_tenant_select" ON "userAttributeCategory" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("userAttributeCategory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userAttributeCategory_tenant_insert" ON "userAttributeCategory" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("userAttributeCategory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userAttributeCategory_tenant_update" ON "userAttributeCategory" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("userAttributeCategory"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("userAttributeCategory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userAttributeCategory_tenant_delete" ON "userAttributeCategory" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("userAttributeCategory"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userModulePreference_tenant_select" ON "userModulePreference" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("userModulePreference"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userModulePreference_tenant_insert" ON "userModulePreference" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("userModulePreference"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userModulePreference_tenant_update" ON "userModulePreference" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("userModulePreference"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("userModulePreference"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userModulePreference_tenant_delete" ON "userModulePreference" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("userModulePreference"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userToCompany_tenant_select" ON "userToCompany" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("userToCompany"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userToCompany_tenant_insert" ON "userToCompany" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("userToCompany"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userToCompany_tenant_update" ON "userToCompany" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("userToCompany"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("userToCompany"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "userToCompany_tenant_delete" ON "userToCompany" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("userToCompany"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouse_tenant_select" ON "warehouse" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("warehouse"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouse_tenant_insert" ON "warehouse" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("warehouse"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouse_tenant_update" ON "warehouse" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("warehouse"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("warehouse"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouse_tenant_delete" ON "warehouse" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("warehouse"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransferLine_tenant_select" ON "warehouseTransferLine" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("warehouseTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransferLine_tenant_insert" ON "warehouseTransferLine" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("warehouseTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransferLine_tenant_update" ON "warehouseTransferLine" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("warehouseTransferLine"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("warehouseTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransferLine_tenant_delete" ON "warehouseTransferLine" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("warehouseTransferLine"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransfer_tenant_select" ON "warehouseTransfer" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("warehouseTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransfer_tenant_insert" ON "warehouseTransfer" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("warehouseTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransfer_tenant_update" ON "warehouseTransfer" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("warehouseTransfer"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("warehouseTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "warehouseTransfer_tenant_delete" ON "warehouseTransfer" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("warehouseTransfer"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "webhook_tenant_select" ON "webhook" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("webhook"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "webhook_tenant_insert" ON "webhook" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("webhook"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "webhook_tenant_update" ON "webhook" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("webhook"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("webhook"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "webhook_tenant_delete" ON "webhook" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("webhook"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterProcess_tenant_select" ON "workCenterProcess" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("workCenterProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterProcess_tenant_insert" ON "workCenterProcess" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("workCenterProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterProcess_tenant_update" ON "workCenterProcess" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("workCenterProcess"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("workCenterProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterProcess_tenant_delete" ON "workCenterProcess" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("workCenterProcess"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterReplacementPart_tenant_select" ON "workCenterReplacementPart" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("workCenterReplacementPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterReplacementPart_tenant_insert" ON "workCenterReplacementPart" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("workCenterReplacementPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterReplacementPart_tenant_update" ON "workCenterReplacementPart" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("workCenterReplacementPart"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("workCenterReplacementPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenterReplacementPart_tenant_delete" ON "workCenterReplacementPart" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("workCenterReplacementPart"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenter_tenant_select" ON "workCenter" AS PERMISSIVE FOR SELECT TO "carbon_app" USING ("workCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenter_tenant_insert" ON "workCenter" AS PERMISSIVE FOR INSERT TO "carbon_app" WITH CHECK ("workCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenter_tenant_update" ON "workCenter" AS PERMISSIVE FOR UPDATE TO "carbon_app" USING ("workCenter"."companyId" = ANY(app_companies_for_context())) WITH CHECK ("workCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
CREATE POLICY "workCenter_tenant_delete" ON "workCenter" AS PERMISSIVE FOR DELETE TO "carbon_app" USING ("workCenter"."companyId" = ANY(app_companies_for_context()));--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO carbon_app, carbon_service;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carbon_app, carbon_service;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carbon_app, carbon_service;
