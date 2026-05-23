DROP FUNCTION IF EXISTS get_opportunity_with_related_records(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_opportunity_with_related_records(opportunity_id text, company_id text)
RETURNS TABLE (
  "id" text,
  "companyId" text,
  "customerId" text,
  "purchaseOrderDocumentPath" text,
  "requestForQuoteDocumentPath" text,
  "salesRfqs" jsonb,
  "quotes" jsonb,
  "salesOrders" jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o."id",
    o."companyId",
    o."customerId",
    o."purchaseOrderDocumentPath",
    o."requestForQuoteDocumentPath",
    (
      SELECT COALESCE(jsonb_agg(rfq.* ORDER BY rfq."revisionId" DESC), '[]'::jsonb)
      FROM "salesRfq" rfq
      WHERE rfq."opportunityId" = o.id
        AND rfq."companyId" = company_id
    ) AS "salesRfqs",
    (
      SELECT COALESCE(jsonb_agg(q.* ORDER BY q."revisionId" DESC), '[]'::jsonb)
      FROM "quote" q
      WHERE q."opportunityId" = o.id
        AND q."companyId" = company_id
    ) AS "quotes",
    (
      SELECT COALESCE(jsonb_agg(so.* ORDER BY so."revisionId" DESC), '[]'::jsonb)
      FROM "salesOrder" so
      WHERE so."opportunityId" = o.id
        AND so."companyId" = company_id
    ) AS "salesOrders"
  FROM "opportunity" o
  WHERE o.id = opportunity_id
    AND o."companyId" = company_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_supplier_interaction_with_related_records(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_supplier_interaction_with_related_records(
  supplier_interaction_id text,
  company_id text
)
RETURNS TABLE (
  "id" text,
  "companyId" text,
  "supplierId" text,
  "purchasingRfq" jsonb,
  "supplierQuotes" jsonb,
  "purchaseOrders" jsonb,
  "purchaseInvoices" jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    si."id",
    si."companyId",
    si."supplierId",
    (
      SELECT to_jsonb(jsonb_build_object(
        'id', rfq."id",
        'rfqId', rfq."rfqId",
        'status', rfq."status"
      ))
      FROM "purchasingRfqToSupplierQuote" link
      JOIN "supplierQuote" sq ON sq."id" = link."supplierQuoteId"
      JOIN "purchasingRfq" rfq ON rfq."id" = link."purchasingRfqId"
      WHERE sq."supplierInteractionId" = si.id
        AND link."companyId" = company_id
        AND sq."companyId" = company_id
        AND rfq."companyId" = company_id
      LIMIT 1
    ) AS "purchasingRfq",
    (
      SELECT COALESCE(jsonb_agg(sq.* ORDER BY sq."supplierQuoteId" DESC), '[]'::jsonb)
      FROM "supplierQuote" sq
      WHERE sq."supplierInteractionId" = si.id
        AND sq."companyId" = company_id
    ) AS "supplierQuotes",
    (
      SELECT COALESCE(jsonb_agg(po.* ORDER BY po."purchaseOrderId" DESC), '[]'::jsonb)
      FROM "purchaseOrder" po
      WHERE po."supplierInteractionId" = si.id
        AND po."companyId" = company_id
    ) AS "purchaseOrders",
    (
      SELECT COALESCE(jsonb_agg(pi.* ORDER BY pi."invoiceId" DESC), '[]'::jsonb)
      FROM "purchaseInvoice" pi
      WHERE pi."supplierInteractionId" = si.id
        AND pi."companyId" = company_id
    ) AS "purchaseInvoices"
  FROM "supplierInteraction" si
  WHERE si.id = supplier_interaction_id
    AND si."companyId" = company_id;
END;
$$;
