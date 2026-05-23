import * as schema from "./schema/index";

type ApiDocsColumn = {
  type: string;
  format?: string;
  enum?: string[];
  items?: { type: string; format?: string };
};

type ApiDocsDefinition = {
  type: "object";
  required?: string[];
  properties: Record<string, ApiDocsColumn>;
};

type ApiDocsPath = Partial<
  Record<
    "get" | "post" | "patch" | "delete",
    {
      summary: string;
      tags: string[];
    }
  >
>;

export type ApiDocsSchema = {
  openapi: "3.1.0";
  info: {
    title: string;
    description: string;
    version: string;
  };
  paths: Record<string, ApiDocsPath>;
  definitions: Record<string, ApiDocsDefinition>;
};

const tableNameSymbol = Symbol.for("drizzle:Name");
const tableColumnsSymbol = Symbol.for("drizzle:Columns");
const isTableSymbol = Symbol.for("drizzle:IsDrizzleTable");
const isViewSymbol = Symbol.for("drizzle:IsDrizzleView");
const viewConfigSymbol = Symbol.for("drizzle:ViewBaseConfig");

const apiDocsSchema: ApiDocsSchema = {
  openapi: "3.1.0",
  info: {
    title: "Carbon API schema",
    description: "Schema metadata derived from Carbon's Drizzle declarations.",
    version: "1.0.0"
  },
  paths: {},
  definitions: {}
};

for (const entry of apiResources()) {
  apiDocsSchema.definitions[entry.name] = definitionFor(entry.columns);
  apiDocsSchema.paths[`/${entry.name}`] = entry.readOnly
    ? {
        get: {
          summary: `Read ${entry.name}`,
          tags: [entry.name]
        }
      }
    : {
        get: {
          summary: `Read ${entry.name}`,
          tags: [entry.name]
        },
        post: {
          summary: `Create ${entry.name}`,
          tags: [entry.name]
        },
        patch: {
          summary: `Update ${entry.name}`,
          tags: [entry.name]
        },
        delete: {
          summary: `Delete ${entry.name}`,
          tags: [entry.name]
        }
      };
}

export default apiDocsSchema;

function apiResources() {
  return Object.values(schema)
    .flatMap((value) => {
      const candidate = value as Record<PropertyKey, unknown>;
      if (candidate[isTableSymbol]) {
        return [
          {
            name: candidate[tableNameSymbol] as string,
            columns: candidate[tableColumnsSymbol] as Record<string, unknown>,
            readOnly: false
          }
        ];
      }

      if (candidate[isViewSymbol]) {
        const config = candidate[viewConfigSymbol] as
          | { name?: string; selectedFields?: Record<string, unknown> }
          | undefined;
        if (!config?.name || !config.selectedFields) return [];
        return [
          {
            name: config.name,
            columns: config.selectedFields,
            readOnly: true
          }
        ];
      }

      return [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function definitionFor(columns: Record<string, unknown>): ApiDocsDefinition {
  const properties: Record<string, ApiDocsColumn> = {};
  const required: string[] = [];

  for (const [propertyName, rawColumn] of Object.entries(columns).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const column = rawColumn as {
      name?: string;
      notNull?: boolean;
      hasDefault?: boolean;
      dataType?: string;
      columnType?: string;
      enumValues?: string[];
      baseColumn?: unknown;
    };
    const name = column.name ?? propertyName;
    properties[name] = columnSchema(column);
    if (column.notNull && !column.hasDefault) {
      required.push(name);
    }
  }

  return {
    type: "object",
    ...(required.length > 0 ? { required } : {}),
    properties
  };
}

function columnSchema(column: {
  dataType?: string;
  columnType?: string;
  enumValues?: string[];
  baseColumn?: unknown;
}): ApiDocsColumn {
  if (column.enumValues) {
    return { type: "string", enum: column.enumValues };
  }

  if (column.dataType === "array") {
    return {
      type: "array",
      items: columnSchema(column.baseColumn as { dataType?: string; columnType?: string })
    };
  }

  switch (column.dataType) {
    case "boolean":
      return { type: "boolean" };
    case "number":
      return { type: "number" };
    case "bigint":
      return { type: "integer" };
    case "json":
      return { type: "object" };
    case "date":
      return { type: "string", format: "date" };
    case "string":
      return stringColumnSchema(column.columnType);
    default:
      return { type: "string", format: column.columnType };
  }
}

function stringColumnSchema(columnType?: string): ApiDocsColumn {
  switch (columnType) {
    case "PgDateString":
      return { type: "string", format: "date" };
    case "PgTimestamp":
    case "PgTimestampString":
      return { type: "string", format: "date-time" };
    case "PgUUID":
      return { type: "string", format: "uuid" };
    default:
      return { type: "string" };
  }
}
