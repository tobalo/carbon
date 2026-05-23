import type { Pool } from "pg";
import { getPostgresConnectionPool } from "./postgres";

export type QueryError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  name?: string;
  statusCode?: string;
};

export type QueryRow = Record<string, any>;
export type QueryData = any[];
type MaybePromiseLike<T> = PromiseLike<T>;
type SingleQueryData<TData> = TData extends (infer TRow)[]
  ? TRow | null
  : TData | null;

export type QueryResult<TData = QueryData> = {
  data: TData;
  error: QueryError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};

export type QueryResponse<T> = QueryResult<T[]>;
export type QuerySingleResponse<T> = QueryResult<T | null>;
export type GenericSchema = Record<string, unknown>;

type GeneratedRelation = {
  Row: QueryRow;
  Insert?: Record<string, any>;
  Update?: Record<string, any>;
};

type SchemaFor<TDatabase, TSchemaName extends string> = [TDatabase] extends [
  Record<TSchemaName, infer TSchema>
]
  ? TSchema
  : {
      Tables: Record<string, GeneratedRelation>;
      Views: Record<string, GeneratedRelation>;
    };

type TablesFor<TDatabase, TSchemaName extends string> = SchemaFor<
  TDatabase,
  TSchemaName
> extends { Tables: infer TTables }
  ? TTables
  : Record<string, GeneratedRelation>;

type ViewsFor<TDatabase, TSchemaName extends string> = SchemaFor<
  TDatabase,
  TSchemaName
> extends { Views: infer TViews }
  ? TViews
  : Record<string, GeneratedRelation>;

type RelationFor<
  TDatabase,
  TSchemaName extends string,
  TRelation extends string
> = TRelation extends keyof TablesFor<TDatabase, TSchemaName>
  ? TablesFor<TDatabase, TSchemaName>[TRelation]
  : TRelation extends keyof ViewsFor<TDatabase, TSchemaName>
    ? ViewsFor<TDatabase, TSchemaName>[TRelation]
    : GeneratedRelation;

type RowFor<
  TDatabase,
  TSchemaName extends string,
  TRelation extends string
> = RelationFor<TDatabase, TSchemaName, TRelation> extends { Row: infer TRow }
  ? TRow
  : QueryRow;

type InsertFor<
  TDatabase,
  TSchemaName extends string,
  TRelation extends string
> = RelationFor<TDatabase, TSchemaName, TRelation> extends {
  Insert: infer TInsert;
}
  ? TInsert
  : Record<string, any>;

type UpdateFor<
  TDatabase,
  TSchemaName extends string,
  TRelation extends string
> = RelationFor<TDatabase, TSchemaName, TRelation> extends {
  Update: infer TUpdate;
}
  ? TUpdate
  : Record<string, any>;

export type QueryBuilder<TData = QueryData> = PromiseLike<
  QueryResult<TData>
> & {
  abortSignal(...args: any[]): QueryBuilder<TData>;
  containedBy(...args: any[]): QueryBuilder<TData>;
  contains(...args: any[]): QueryBuilder<TData>;
  eq(...args: any[]): QueryBuilder<TData>;
  explain(...args: any[]): QueryBuilder<TData>;
  filter(...args: any[]): QueryBuilder<TData>;
  gte(...args: any[]): QueryBuilder<TData>;
  gt(...args: any[]): QueryBuilder<TData>;
  ilike(...args: any[]): QueryBuilder<TData>;
  in(...args: any[]): QueryBuilder<TData>;
  is(...args: any[]): QueryBuilder<TData>;
  like(...args: any[]): QueryBuilder<TData>;
  limit(...args: any[]): QueryBuilder<TData>;
  lte(...args: any[]): QueryBuilder<TData>;
  lt(...args: any[]): QueryBuilder<TData>;
  match(...args: any[]): QueryBuilder<TData>;
  maybeSingle(): MaybePromiseLike<QueryResult<SingleQueryData<TData>>>;
  neq(...args: any[]): QueryBuilder<TData>;
  not(...args: any[]): QueryBuilder<TData>;
  order(...args: any[]): QueryBuilder<TData>;
  or(...args: any[]): QueryBuilder<TData>;
  overlaps(...args: any[]): QueryBuilder<TData>;
  range(...args: any[]): QueryBuilder<TData>;
  returns<T = TData>(): QueryBuilder<T>;
  select<TSelected = QueryData>(...args: any[]): QueryBuilder<TSelected>;
  single(): MaybePromiseLike<QueryResult<SingleQueryData<TData>>>;
  throwOnError(): QueryBuilder<TData>;
};

export type TableBuilder<
  _TData = QueryData,
  _TInsert = Record<string, any>,
  _TUpdate = Record<string, any>
> = {
  delete(...args: any[]): QueryBuilder<null>;
  insert(values: any, ...args: any[]): QueryBuilder<null>;
  select<TSelected = QueryData>(...args: any[]): QueryBuilder<TSelected>;
  update(values: any, ...args: any[]): QueryBuilder<null>;
  upsert(values: any, ...args: any[]): QueryBuilder<null>;
};

export type RpcClient = {
  rpc(
    fn: string,
    params?: Record<string, unknown>,
    options?: Record<string, unknown>
  ): any;
};

export type TableClient<
  TDatabase = unknown,
  TSchemaName extends string = "public"
> = {
  from<TRelation extends string>(
    table: TRelation
  ): TableBuilder<
    RowFor<TDatabase, TSchemaName, TRelation>[],
    InsertFor<TDatabase, TSchemaName, TRelation>,
    UpdateFor<TDatabase, TSchemaName, TRelation>
  >;
};

export type DatabaseQueryClient<
  TDatabase = unknown,
  TSchemaName extends string = "public"
> = RpcClient & TableClient<TDatabase, TSchemaName>;

export type CarbonDatabaseClient<
  _Database = unknown,
  _SchemaName extends string = "public"
> = DatabaseQueryClient<_Database, _SchemaName>;
export type QueryFilterBuilder<
  _Schema = GenericSchema,
  _Row extends Record<string, unknown> = Record<string, unknown>,
  TData = QueryData
> = QueryBuilder<TData>;

type Filter = {
  column: string;
  negated?: boolean;
  operator:
    | "="
    | "!="
    | ">"
    | ">="
    | "<"
    | "<="
    | "ilike"
    | "like"
    | "is"
    | "in"
    | "@>"
    | "<@"
    | "&&";
  value: unknown;
};

type Order = {
  column: string;
  ascending: boolean;
};

type Operation = "select" | "insert" | "update" | "delete" | "upsert";
type QueryAuthContext =
  | { kind: "user"; userId: string }
  | { kind: "apiKey"; apiKeyId: string };

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteDottedIdent(path: string) {
  return path.split(".").map(quoteIdent).join(".");
}

function quotePath(path: string) {
  const jsonOperatorPattern = /\s*(->>|->)\s*/;
  if (!jsonOperatorPattern.test(path)) {
    return quoteDottedIdent(path);
  }

  const [base = "", ...tokens] = path.split(jsonOperatorPattern);
  let expression = quoteDottedIdent(base.trim());

  for (let index = 0; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const key = tokens[index + 1]?.trim();
    if (!operator || !key) continue;

    expression += ` ${operator} ${quoteLiteral(key.replace(/^['"]|['"]$/g, ""))}`;
  }

  return expression;
}

function normalizeOperator(operator: string): Filter["operator"] {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "!=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "cs":
      return "@>";
    case "cd":
      return "<@";
    case "ov":
      return "&&";
    default:
      return operator as Filter["operator"];
  }
}

function normalizeError(error: unknown): QueryError {
  return {
    message: error instanceof Error ? error.message : String(error)
  };
}

function nullData<TData>() {
  return null as unknown as TData;
}

async function queryWithAuthContext(
  pool: Pool,
  authContext: QueryAuthContext | null,
  text: string,
  params: unknown[]
) {
  if (!authContext) {
    return pool.query(text, params);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (authContext.kind === "user") {
      await client.query("select set_config('app.user_id', $1, true)", [
        authContext.userId
      ]);
    } else {
      await client.query("select set_config('app.api_key_id', $1, true)", [
        authContext.apiKeyId
      ]);
    }
    const result = await client.query(text, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function selectColumns(columns?: string) {
  if (!columns || columns.trim() === "*") return "*";

  // Existing code still contains embedded relationship selectors. The direct
  // adapter intentionally does not emulate those; callers should issue explicit
  // joins or follow-up queries.
  if (columns.includes("(") || columns.includes("...")) return "*";

  return columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .map((column) => {
      const [source, alias] = column
        .split(/\s+as\s+/i)
        .map((part) => part.trim());
      if (!source) return "";
      const quoted = quotePath(source);
      return alias ? `${quoted} as ${quoteIdent(alias)}` : quoted;
    })
    .filter(Boolean)
    .join(", ");
}

class PgTableQueryBuilder<TData = QueryData> implements QueryBuilder<TData> {
  private columns = "*";
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private rowLimit?: number;
  private rowOffset?: number;
  private values: any;
  private shouldThrow = false;
  private returningColumns: string | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly table: string,
    private readonly operation: Operation,
    private readonly authContext: QueryAuthContext | null
  ) {}

  abortSignal() {
    return this;
  }

  containedBy(column: string, value: unknown) {
    this.filters.push({ column, operator: "<@", value });
    return this;
  }

  contains(column: string, value: unknown) {
    this.filters.push({ column, operator: "@>", value });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operator: "=", value });
    return this;
  }

  explain() {
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    this.filters.push({
      column,
      operator: normalizeOperator(operator),
      value
    });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, operator: ">=", value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, operator: ">", value });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ column, operator: "ilike", value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, operator: "in", value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ column, operator: "is", value });
    return this;
  }

  like(column: string, value: unknown) {
    this.filters.push({ column, operator: "like", value });
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, operator: "<=", value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, operator: "<", value });
    return this;
  }

  match(values: Record<string, unknown>) {
    for (const [column, value] of Object.entries(values)) {
      this.eq(column, value);
    }
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, operator: "!=", value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({
      column,
      operator: normalizeOperator(operator),
      value,
      negated: true
    });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  or() {
    return this;
  }

  overlaps(column: string, value: unknown) {
    this.filters.push({ column, operator: "&&", value });
    return this;
  }

  range(from: number, to: number) {
    this.rowOffset = from;
    this.rowLimit = to - from + 1;
    return this;
  }

  returns<T = TData>() {
    return this as unknown as QueryBuilder<T>;
  }

  select<TSelected = QueryData>(columns = "*") {
    const selectedColumns = selectColumns(columns);
    if (this.operation === "select") {
      this.columns = selectedColumns;
    } else {
      this.returningColumns = selectedColumns;
    }
    return this as unknown as QueryBuilder<TSelected>;
  }

  throwOnError() {
    this.shouldThrow = true;
    return this;
  }

  insert(values: unknown) {
    this.values = values;
    return this;
  }

  update(values: unknown) {
    this.values = values;
    return this;
  }

  upsert(values: unknown) {
    this.values = values;
    return this;
  }

  delete() {
    return this;
  }

  maybeSingle() {
    return this.executeSingle(false);
  }

  single() {
    return this.executeSingle(true);
  }

  then<TResult1 = QueryResult<TData>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<TData>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private addWhere(params: unknown[]) {
    if (this.filters.length === 0) return "";

    const clauses = this.filters.map((filter) => {
      let expression: string;

      if (filter.operator === "is") {
        expression =
          filter.value === null
            ? `${quotePath(filter.column)} is null`
            : `${quotePath(filter.column)} is not null`;
      } else if (filter.operator === "in") {
        const values = Array.isArray(filter.value) ? filter.value : [];
        if (values.length === 0) return filter.negated ? "true" : "false";
        const placeholders = values.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        expression = `${quotePath(filter.column)} in (${placeholders.join(", ")})`;
      } else {
        params.push(filter.value);
        expression = `${quotePath(filter.column)} ${filter.operator} $${params.length}`;
      }

      return filter.negated ? `not (${expression})` : expression;
    });

    return ` where ${clauses.join(" and ")}`;
  }

  private addOrderLimit(params: unknown[]) {
    const order =
      this.orders.length > 0
        ? ` order by ${this.orders
            .map(
              (entry) =>
                `${quotePath(entry.column)} ${entry.ascending ? "asc" : "desc"}`
            )
            .join(", ")}`
        : "";

    const limit =
      this.rowLimit === undefined
        ? ""
        : (() => {
            params.push(this.rowLimit);
            return ` limit $${params.length}`;
          })();
    const offset =
      this.rowOffset === undefined
        ? ""
        : (() => {
            params.push(this.rowOffset);
            return ` offset $${params.length}`;
          })();

    return `${order}${limit}${offset}`;
  }

  private buildMutationValues(params: unknown[]) {
    const rows = Array.isArray(this.values) ? this.values : [this.values ?? {}];
    const columns = Array.from(
      rows.reduce<Set<string>>((set, row) => {
        for (const key of Object.keys(row as Record<string, unknown>)) {
          set.add(key);
        }
        return set;
      }, new Set())
    );

    return { rows, columns };
  }

  private buildSql() {
    const params: unknown[] = [];
    const table = quotePath(this.table);
    const returning = this.returningColumns
      ? ` returning ${this.returningColumns}`
      : "";

    if (this.operation === "select") {
      const where = this.addWhere(params);
      const tail = this.addOrderLimit(params);
      return {
        text: `select ${this.columns} from ${table}${where}${tail}`,
        params
      };
    }

    if (this.operation === "delete") {
      const where = this.addWhere(params);
      return {
        text: `delete from ${table}${where}${returning}`,
        params
      };
    }

    if (this.operation === "update") {
      const values = this.values as Record<string, unknown>;
      const assignments = Object.keys(values).map((column) => {
        params.push(values[column]);
        return `${quotePath(column)} = $${params.length}`;
      });
      const where = this.addWhere(params);
      return {
        text: `update ${table} set ${assignments.join(", ")}${where}${returning}`,
        params
      };
    }

    const { rows, columns } = this.buildMutationValues(params);
    const tuples = rows.map((row) => {
      const placeholders = columns.map((column) => {
        params.push((row as Record<string, unknown>)[column]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const conflict =
      this.operation === "upsert" ? " on conflict do nothing" : "";

    return {
      text: `insert into ${table} (${columns
        .map(quotePath)
        .join(", ")}) values ${tuples.join(", ")}${conflict}${returning}`,
      params
    };
  }

  private async execute(): Promise<QueryResult<TData>> {
    const { text, params } = this.buildSql();

    try {
      const result = await queryWithAuthContext(
        this.pool,
        this.authContext,
        text,
        params
      );
      return {
        data:
          this.operation !== "select" && !this.returningColumns
            ? nullData<TData>()
            : (result.rows as TData),
        error: null,
        count: result.rowCount
      };
    } catch (error) {
      if (this.shouldThrow) throw error;
      return { data: nullData<TData>(), error: normalizeError(error) };
    }
  }

  private async executeSingle(
    required: boolean
  ): Promise<QueryResult<SingleQueryData<TData>>> {
    this.rowLimit = 1;
    const result = await this.execute();
    if (result.error) return result as QueryResult<SingleQueryData<TData>>;

    const rows = (result.data as QueryRow[]) ?? [];
    if (rows.length === 0 && required) {
      return {
        data: nullData<SingleQueryData<TData>>(),
        error: { message: "Row not found" }
      };
    }

    return {
      data: (rows[0] ?? null) as SingleQueryData<TData>,
      error: null,
      count: rows.length
    };
  }
}

class PgTableClient implements TableClient {
  constructor(
    protected readonly pool: Pool,
    protected readonly authContext: QueryAuthContext | null
  ) {}

  from<TRelation extends string>(
    table: TRelation
  ): TableBuilder<
    RowFor<unknown, "public", TRelation>[],
    InsertFor<unknown, "public", TRelation>,
    UpdateFor<unknown, "public", TRelation>
  > {
    return {
      delete: () =>
        new PgTableQueryBuilder<null>(
          this.pool,
          table,
          "delete",
          this.authContext
        ),
      insert: (values: unknown) =>
        new PgTableQueryBuilder<null>(
          this.pool,
          table,
          "insert",
          this.authContext
        ).insert(values),
      select: (columns = "*") =>
        new PgTableQueryBuilder(
          this.pool,
          table,
          "select",
          this.authContext
        ).select(columns),
      update: (values: unknown) =>
        new PgTableQueryBuilder<null>(
          this.pool,
          table,
          "update",
          this.authContext
        ).update(values),
      upsert: (values: unknown) =>
        new PgTableQueryBuilder<null>(
          this.pool,
          table,
          "upsert",
          this.authContext
        ).upsert(values)
    } as TableBuilder<
      RowFor<unknown, "public", TRelation>[],
      InsertFor<unknown, "public", TRelation>,
      UpdateFor<unknown, "public", TRelation>
    >;
  }
}

class PgDatabaseQueryClient
  extends PgTableClient
  implements DatabaseQueryClient
{
  constructor(pool: Pool, authContext: QueryAuthContext | null) {
    super(pool, authContext);
  }

  async rpc(fn: string, params: Record<string, unknown> = {}) {
    const values = Object.values(params);
    const assignments = Object.keys(params).map(
      (name, index) => `${quoteIdent(name)} => $${index + 1}`
    );

    try {
      const result = await queryWithAuthContext(
        this.pool,
        this.authContext,
        `select * from ${quotePath(fn)}(${assignments.join(", ")})`,
        values
      );
      const data =
        result.rows.length === 1 && Object.keys(result.rows[0]).length === 1
          ? Object.values(result.rows[0])[0]
          : result.rows;
      return { data, error: null, count: result.rowCount };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  }

}

let appClient: DatabaseQueryClient | null = null;
let serviceClient: DatabaseQueryClient | null = null;
let appPool: Pool | null = null;
let servicePool: Pool | null = null;

function getQueryPool(service = false) {
  if (service) {
    servicePool ??= getPostgresConnectionPool(
      Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
      { kind: "service" }
    );
    return servicePool;
  }

  appPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_POOL_SIZE ?? 10)
  );
  return appPool;
}

export function createDatabaseQueryClient(
  options: { service?: boolean; userId?: string; apiKeyId?: string } = {}
) {
  const authContext =
    options.userId !== undefined
      ? { kind: "user" as const, userId: options.userId }
      : options.apiKeyId !== undefined
        ? { kind: "apiKey" as const, apiKeyId: options.apiKeyId }
        : null;

  return new PgDatabaseQueryClient(getQueryPool(options.service), authContext);
}

export function getDatabaseQueryClient() {
  appClient ??= createDatabaseQueryClient();
  return appClient;
}

export function getServiceDatabaseQueryClient() {
  serviceClient ??= createDatabaseQueryClient({ service: true });
  return serviceClient;
}
