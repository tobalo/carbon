CREATE OR REPLACE FUNCTION items_search(
  query_embedding vector,
  match_threshold float,
  match_count int,
  p_company_id text
)
RETURNS TABLE (
  id text,
  "readableId" text,
  name text,
  description text,
  similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    item.id,
    item."readableId",
    item.name,
    item.description,
    1 - (item.embedding <=> query_embedding) AS similarity
  FROM item
  WHERE 1 - (item.embedding <=> query_embedding) > match_threshold
    AND "companyId" = p_company_id
  ORDER BY (item.embedding <=> query_embedding) ASC
  LIMIT LEAST(match_count, 10);
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION suppliers_search(
  query_embedding vector,
  match_threshold float,
  match_count int,
  p_company_id text
)
RETURNS TABLE (
  id text,
  name text,
  similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    supplier.id,
    supplier.name,
    1 - (supplier.embedding <=> query_embedding) AS similarity
  FROM supplier
  WHERE 1 - (supplier.embedding <=> query_embedding) > match_threshold
    AND "companyId" = p_company_id
  ORDER BY (supplier.embedding <=> query_embedding) ASC
  LIMIT LEAST(match_count, 10);
$$;
