import type { QueryError } from "./query-client.ts";
import type { SchemaObjectName } from "./schema";

const BATCH_SIZE = 1000;

export type PaginatedResult<T> =
  | {
      data: T[];
      count: number;
      error: null;
    }
  | {
      data: null;
      count: null;
      error: QueryError;
    };

/**
 * Fetches all records from a table by automatically handling pagination
 * to work around provider API row limit per request
 */
export async function fetchAllRecords<T extends object>(
  baseQuery: {
    range(start: number, end: number): Promise<{
      data: T[] | null;
      error: QueryError | null;
      count?: number | null;
    }>;
  }
): Promise<PaginatedResult<T>> {
  const allData: T[] = [];
  let offset = 0;
  let totalCount: number = 0;
  let hasMore = true;

  while (hasMore) {
    // Clone the query and add range for this batch
    const query = baseQuery.range(offset, offset + BATCH_SIZE - 1);

    const result = await query;

    if (result.error) {
      return {
        data: null,
        count: null,
        error: result.error
      };
    }

    if (result.data) {
      allData.push(...result.data);
    }

    // Set total count from first request
    if (offset === 0) {
      totalCount = result.count ?? 0;
    }

    // Check if we have more data to fetch
    hasMore = Boolean(result.data && result.data.length === BATCH_SIZE);
    offset += BATCH_SIZE;
  }

  return {
    data: allData,
    count: totalCount,
    error: null
  };
}

/**
 * Helper function for simple table queries that need all records
 */
export async function fetchAllFromTable<T extends object>(
  client: {
    from(table: string): any;
  },
  tableName: SchemaObjectName,
  selectColumns: string = "*",
  filterFn?: (query: any) => any
): Promise<PaginatedResult<T>> {
  let baseQuery = client
    .from(String(tableName))
    .select(selectColumns, { count: "exact" });

  if (filterFn) {
    baseQuery = filterFn(baseQuery);
  }

  return fetchAllRecords(
    baseQuery as Parameters<typeof fetchAllRecords<T>>[0]
  );
}

/**
 * Fetches records with automatic batching for queries that might exceed 1000 rows
 * Used when you need all records but want to process them in batches
 */
export async function* fetchRecordsInBatches<T extends object>(
  baseQuery: {
    range(start: number, end: number): Promise<{
      data: T[] | null;
      error: QueryError | null;
    }>;
  },
  batchSize: number = BATCH_SIZE
): AsyncGenerator<{ data: T[]; batch: number; hasMore: boolean }> {
  let offset = 0;
  let batch = 0;
  let hasMore = true;

  while (hasMore) {
    const query = baseQuery.range(offset, offset + batchSize - 1);
    const result = await query;

    if (result.error) {
      throw new Error(`Batch query failed: ${result.error.message}`);
    }

    hasMore = Boolean(result.data && result.data.length === batchSize);
    batch++;

    yield {
      data: result.data || [],
      batch,
      hasMore
    };

    offset += batchSize;
  }
}
