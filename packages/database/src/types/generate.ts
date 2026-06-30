import { copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import pg from "pg";

const DEFAULT_SCHEMAS = ["public", "storage", "graphql_public"];
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

dotenv.config({ path: resolve(REPO_ROOT, ".env") });
dotenv.config({ path: resolve(REPO_ROOT, ".env.local"), override: true });

type CliOptions = {
  connectionString: string;
  edgeTypesPath?: string;
  outputPath: string;
  schemas: string[];
};

type TypeInfo = {
  baseOid: string | null;
  elementOid: string | null;
  kind: string;
  name: string;
  oid: string;
  schema: string;
};

type EnumDef = {
  labels: string[];
  name: string;
  schema: string;
};

type ColumnDef = {
  generated: boolean;
  hasDefault: boolean;
  identity: boolean;
  name: string;
  nullable: boolean;
  type: string;
  updatable: boolean;
};

type RelationKind = "Tables" | "Views";

type RelationDef = {
  columns: ColumnDef[];
  kind: RelationKind;
  name: string;
  relationships: RelationshipDef[];
  schema: string;
};

type RelationshipDef = {
  columns: string[];
  foreignKeyName: string;
  isOneToOne: boolean;
  referencedColumns: string[];
  referencedRelation: string;
};

type FunctionArg = {
  mode: string;
  name: string | null;
  ordinal: number;
  typeOid: string;
};

type FunctionSignature = {
  args: FunctionArg[];
  defaultArgCount: number;
  name: string;
  oid: string;
  outputArgs: FunctionArg[];
  returnSet: boolean;
  returnTypeOid: string;
  schema: string;
};

type CompositeDef = {
  columns: ColumnDef[];
  name: string;
  schema: string;
};

type Catalog = {
  composites: CompositeDef[];
  enums: EnumDef[];
  functions: FunctionSignature[];
  relations: RelationDef[];
  schemas: string[];
  types: Map<string, TypeInfo>;
};

type EnumRow = {
  label: string;
  name: string;
  schema: string;
};

type TypeRow = {
  base_oid: string | null;
  element_oid: string | null;
  kind: string;
  name: string;
  oid: string;
  schema: string;
};

type RelationRow = {
  attgenerated: string;
  attidentity: string;
  column_name: string;
  default_value: string | null;
  is_nullable: boolean;
  is_updatable: boolean | null;
  relation_kind: string;
  relation_name: string;
  schema_name: string;
  type_oid: string;
};

type RelationshipRow = {
  columns: string[] | string;
  foreign_key_name: string;
  referenced_columns: string[] | string;
  referenced_relation: string;
  source_relation: string;
  source_schema: string;
};

type FunctionRow = {
  arg_mode: string | null;
  arg_name: string | null;
  arg_ordinal: string | null;
  arg_type_oid: string | null;
  default_arg_count: number;
  function_oid: string;
  function_name: string;
  return_set: boolean;
  return_type_oid: string;
  schema_name: string;
};

type CompositeRow = {
  attgenerated: string;
  attidentity: string;
  column_name: string;
  composite_name: string;
  default_value: string | null;
  is_nullable: boolean;
  schema_name: string;
  type_oid: string;
};

export async function generateDatabaseTypes(options: CliOptions) {
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();

  try {
    const catalog = await introspectCatalog(client, options.schemas);
    const output = renderDatabaseTypes(catalog);
    await writeFile(options.outputPath, output);
    if (options.edgeTypesPath) {
      await copyFile(options.outputPath, options.edgeTypesPath);
    }
  } finally {
    await client.end();
  }
}

async function introspectCatalog(
  client: pg.Client,
  schemas: string[]
): Promise<Catalog> {
  const types = await loadTypes(client);
  const enums = await loadEnums(client, schemas);
  const relations = await loadRelations(client, schemas, types);
  const relationships = await loadRelationships(client, schemas);
  const functions = await loadFunctions(client, schemas);
  const composites = await loadComposites(client, schemas, types);

  for (const relation of relations) {
    relation.relationships = relationships.filter(
      (relationship) =>
        relationship.source_schema === relation.schema &&
        relationship.source_relation === relation.name
    );
  }

  return {
    composites,
    enums,
    functions,
    relations,
    schemas,
    types
  };
}

async function loadTypes(client: pg.Client) {
  const result = await client.query<TypeRow>(`
    SELECT
      t.oid::text AS oid,
      n.nspname AS schema,
      t.typname AS name,
      t.typtype AS kind,
      NULLIF(t.typelem, 0::oid)::text AS element_oid,
      NULLIF(t.typbasetype, 0::oid)::text AS base_oid
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  `);

  return new Map(
    result.rows.map((row) => [
      row.oid,
      {
        baseOid: row.base_oid,
        elementOid: row.element_oid,
        kind: row.kind,
        name: row.name,
        oid: row.oid,
        schema: row.schema
      }
    ])
  );
}

async function loadEnums(client: pg.Client, schemas: string[]) {
  const result = await client.query<EnumRow>(
    `
    SELECT
      n.nspname AS schema,
      t.typname AS name,
      e.enumlabel AS label
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY array_position($1::text[], n.nspname), t.typname, e.enumsortorder
    `,
    [schemas]
  );

  const enums = new Map<string, EnumDef>();
  for (const row of result.rows) {
    const key = `${row.schema}.${row.name}`;
    const definition =
      enums.get(key) ??
      ({
        labels: [],
        name: row.name,
        schema: row.schema
      } satisfies EnumDef);
    definition.labels.push(row.label);
    enums.set(key, definition);
  }

  return [...enums.values()];
}

async function loadRelations(
  client: pg.Client,
  schemas: string[],
  types: Map<string, TypeInfo>
) {
  const result = await client.query<RelationRow>(
    `
    SELECT
      n.nspname AS schema_name,
      c.relname AS relation_name,
      c.relkind AS relation_kind,
      a.attname AS column_name,
      a.atttypid::text AS type_oid,
      a.attnotnull IS NOT TRUE AS is_nullable,
      a.attidentity AS attidentity,
      a.attgenerated AS attgenerated,
      pg_get_expr(ad.adbin, ad.adrelid) AS default_value,
      CASE
        WHEN c.relkind IN ('v', 'm') THEN cols.is_updatable = 'YES'
        ELSE TRUE
      END AS is_updatable
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_catalog.pg_attrdef ad
      ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    LEFT JOIN information_schema.columns cols
      ON cols.table_schema = n.nspname
      AND cols.table_name = c.relname
      AND cols.column_name = a.attname
    WHERE n.nspname = ANY($1::text[])
      AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
      AND a.attnum > 0
      AND a.attisdropped IS FALSE
    ORDER BY
      array_position($1::text[], n.nspname),
      CASE WHEN c.relkind IN ('v', 'm') THEN 1 ELSE 0 END,
      c.relname,
      a.attnum
    `,
    [schemas]
  );

  const relations = new Map<string, RelationDef>();
  for (const row of result.rows) {
    const kind: RelationKind =
      row.relation_kind === "v" || row.relation_kind === "m"
        ? "Views"
        : "Tables";
    const key = `${row.schema_name}.${kind}.${row.relation_name}`;
    const relation =
      relations.get(key) ??
      ({
        columns: [],
        kind,
        name: row.relation_name,
        relationships: [],
        schema: row.schema_name
      } satisfies RelationDef);

    relation.columns.push({
      generated: row.attgenerated !== "",
      hasDefault: row.default_value !== null,
      identity: row.attidentity !== "",
      name: row.column_name,
      nullable: row.is_nullable,
      type: renderType(row.type_oid, types, schemas),
      updatable: row.is_updatable !== false
    });
    relations.set(key, relation);
  }

  return [...relations.values()];
}

async function loadRelationships(client: pg.Client, schemas: string[]) {
  const result = await client.query<RelationshipRow>(
    `
    SELECT
      source_ns.nspname AS source_schema,
      source.relname AS source_relation,
      con.conname AS foreign_key_name,
      array_agg(source_att.attname::text ORDER BY keys.ordinality)::text[] AS columns,
      target.relname AS referenced_relation,
      array_agg(target_att.attname::text ORDER BY keys.ordinality)::text[] AS referenced_columns
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class source ON source.oid = con.conrelid
    JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source.relnamespace
    JOIN pg_catalog.pg_class target ON target.oid = con.confrelid
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
      WITH ORDINALITY AS keys(source_attnum, target_attnum, ordinality)
    JOIN pg_catalog.pg_attribute source_att
      ON source_att.attrelid = source.oid
      AND source_att.attnum = keys.source_attnum
    JOIN pg_catalog.pg_attribute target_att
      ON target_att.attrelid = target.oid
      AND target_att.attnum = keys.target_attnum
    WHERE con.contype = 'f'
      AND source_ns.nspname = ANY($1::text[])
    GROUP BY source_ns.nspname, source.relname, con.conname, target.relname
    ORDER BY source_ns.nspname, source.relname, con.conname
    `,
    [schemas]
  );

  return result.rows.map((row) => ({
    columns: parsePgTextArray(row.columns),
    foreignKeyName: row.foreign_key_name,
    isOneToOne: false,
    referencedColumns: parsePgTextArray(row.referenced_columns),
    referencedRelation: row.referenced_relation,
    source_relation: row.source_relation,
    source_schema: row.source_schema
  }));
}

function parsePgTextArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [value];
  const inner = trimmed.slice(1, -1);
  if (!inner) return [];
  return inner.split(",").map((part) => part.replace(/^"|"$/g, ""));
}

async function loadFunctions(client: pg.Client, schemas: string[]) {
  const result = await client.query<FunctionRow>(
    `
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      p.oid::text AS function_oid,
      p.proretset AS return_set,
      p.prorettype::text AS return_type_oid,
      p.pronargdefaults AS default_arg_count,
      args.ordinality::text AS arg_ordinal,
      args.type_oid::text AS arg_type_oid,
      COALESCE(p.proargmodes[args.ordinality], 'i')::text AS arg_mode,
      p.proargnames[args.ordinality] AS arg_name
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN LATERAL unnest(
      CASE
        WHEN p.proallargtypes IS NOT NULL THEN p.proallargtypes
        WHEN p.pronargs = 0 THEN ARRAY[]::oid[]
        ELSE string_to_array(p.proargtypes::text, ' ')::oid[]
      END
    ) WITH ORDINALITY AS args(type_oid, ordinality) ON TRUE
    WHERE n.nspname = ANY($1::text[])
      AND p.prokind = 'f'
    ORDER BY array_position($1::text[], n.nspname), p.proname, p.oid::text, args.ordinality
    `,
    [schemas]
  );

  const functions = new Map<string, FunctionSignature>();
  for (const row of result.rows) {
    const mapKey = `${row.schema_name}.${row.function_oid}`;
    const signature =
      functions.get(mapKey) ??
      ({
        args: [],
        defaultArgCount: row.default_arg_count,
        name: row.function_name,
        oid: row.function_oid,
        outputArgs: [],
        returnSet: row.return_set,
        returnTypeOid: row.return_type_oid,
        schema: row.schema_name
      } satisfies FunctionSignature);

    if (row.arg_ordinal && row.arg_type_oid && row.arg_mode) {
      const arg = {
        mode: row.arg_mode,
        name: row.arg_name,
        ordinal: Number(row.arg_ordinal),
        typeOid: row.arg_type_oid
      };
      if (["i", "b", "v"].includes(row.arg_mode)) {
        signature.args.push(arg);
      }
      if (["o", "b", "t"].includes(row.arg_mode)) {
        signature.outputArgs.push(arg);
      }
    }

    functions.set(mapKey, signature);
  }

  return [...functions.values()];
}

async function loadComposites(
  client: pg.Client,
  schemas: string[],
  types: Map<string, TypeInfo>
) {
  const result = await client.query<CompositeRow>(
    `
    SELECT
      n.nspname AS schema_name,
      t.typname AS composite_name,
      a.attname AS column_name,
      a.atttypid::text AS type_oid,
      a.attnotnull IS NOT TRUE AS is_nullable,
      a.attidentity AS attidentity,
      a.attgenerated AS attgenerated,
      pg_get_expr(ad.adbin, ad.adrelid) AS default_value
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_catalog.pg_class c ON c.oid = t.typrelid
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_catalog.pg_attrdef ad
      ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = ANY($1::text[])
      AND t.typtype = 'c'
      AND c.relkind = 'c'
      AND a.attnum > 0
      AND a.attisdropped IS FALSE
    ORDER BY array_position($1::text[], n.nspname), t.typname, a.attnum
    `,
    [schemas]
  );

  const composites = new Map<string, CompositeDef>();
  for (const row of result.rows) {
    const key = `${row.schema_name}.${row.composite_name}`;
    const composite =
      composites.get(key) ??
      ({
        columns: [],
        name: row.composite_name,
        schema: row.schema_name
      } satisfies CompositeDef);
    composite.columns.push({
      generated: row.attgenerated !== "",
      hasDefault: row.default_value !== null,
      identity: row.attidentity !== "",
      name: row.column_name,
      nullable: row.is_nullable,
      type: renderType(row.type_oid, types, schemas),
      updatable: true
    });
    composites.set(key, composite);
  }

  return [...composites.values()];
}

function renderDatabaseTypes(catalog: Catalog) {
  const lines: string[] = [];
  lines.push("export type Json =");
  lines.push("  | string");
  lines.push("  | number");
  lines.push("  | boolean");
  lines.push("  | null");
  lines.push("  | { [key: string]: Json | undefined }");
  lines.push("  | Json[]");
  lines.push("");
  lines.push("export type Database = {");

  for (const schema of catalog.schemas) {
    renderSchema(lines, catalog, schema, 1);
  }

  lines.push("}");
  lines.push("");
  renderHelperTypes(lines);
  lines.push("");
  renderConstants(lines, catalog);
  return `${lines.join("\n")}\n`;
}

function renderSchema(
  lines: string[],
  catalog: Catalog,
  schema: string,
  depth: number
) {
  const schemaRelations = catalog.relations.filter(
    (relation) => relation.schema === schema
  );
  const schemaFunctions = catalog.functions.filter(
    (signature) => signature.schema === schema
  );
  const schemaEnums = catalog.enums.filter((entry) => entry.schema === schema);
  const schemaComposites = catalog.composites.filter(
    (entry) => entry.schema === schema
  );

  lines.push(`${indent(depth)}${propertyName(schema)}: {`);
  renderRelations(
    lines,
    "Tables",
    schemaRelations.filter((relation) => relation.kind === "Tables"),
    depth + 1
  );
  renderRelations(
    lines,
    "Views",
    schemaRelations.filter((relation) => relation.kind === "Views"),
    depth + 1
  );
  renderFunctions(
    lines,
    schemaFunctions,
    catalog.types,
    catalog.schemas,
    depth + 1
  );
  renderEnums(lines, schemaEnums, depth + 1);
  renderCompositeTypes(lines, schemaComposites, depth + 1);
  lines.push(`${indent(depth)}}`);
}

function renderRelations(
  lines: string[],
  section: RelationKind,
  relations: RelationDef[],
  depth: number
) {
  lines.push(`${indent(depth)}${section}: {`);
  if (relations.length === 0) {
    lines.push(`${indent(depth + 1)}[_ in never]: never`);
    lines.push(`${indent(depth)}}`);
    return;
  }

  for (const relation of relations) {
    lines.push(`${indent(depth + 1)}${propertyName(relation.name)}: {`);
    renderColumnShape(lines, "Row", relation, depth + 2);
    renderColumnShape(lines, "Insert", relation, depth + 2);
    renderColumnShape(lines, "Update", relation, depth + 2);
    renderRelationships(lines, relation.relationships, depth + 2);
    lines.push(`${indent(depth + 1)}}`);
  }
  lines.push(`${indent(depth)}}`);
}

function renderColumnShape(
  lines: string[],
  shape: "Row" | "Insert" | "Update",
  relation: RelationDef,
  depth: number
) {
  lines.push(`${indent(depth)}${shape}: {`);
  for (const column of relation.columns) {
    const access = columnAccess(shape, relation.kind, column);
    lines.push(
      `${indent(depth + 1)}${propertyName(column.name)}${access.optional ? "?" : ""}: ${access.type}`
    );
  }
  lines.push(`${indent(depth)}}`);
}

function columnAccess(
  shape: "Row" | "Insert" | "Update",
  relationKind: RelationKind,
  column: ColumnDef
) {
  if (shape === "Row") {
    return {
      optional: false,
      type: column.nullable ? `${column.type} | null` : column.type
    };
  }

  const readOnly = column.generated || column.updatable === false;
  if (readOnly) {
    return { optional: true, type: "never" };
  }

  const type = column.nullable ? `${column.type} | null` : column.type;
  if (shape === "Update") {
    return { optional: true, type };
  }

  return {
    optional:
      relationKind === "Views" ||
      column.nullable ||
      column.hasDefault ||
      column.identity,
    type
  };
}

function renderRelationships(
  lines: string[],
  relationships: RelationshipDef[],
  depth: number
) {
  if (relationships.length === 0) {
    lines.push(`${indent(depth)}Relationships: []`);
    return;
  }

  lines.push(`${indent(depth)}Relationships: [`);
  relationships.forEach((relationship, index) => {
    lines.push(`${indent(depth + 1)}{`);
    lines.push(
      `${indent(depth + 2)}foreignKeyName: ${JSON.stringify(
        relationship.foreignKeyName
      )}`
    );
    lines.push(
      `${indent(depth + 2)}columns: [${relationship.columns
        .map((column) => JSON.stringify(column))
        .join(", ")}]`
    );
    lines.push(`${indent(depth + 2)}isOneToOne: ${relationship.isOneToOne}`);
    lines.push(
      `${indent(depth + 2)}referencedRelation: ${JSON.stringify(
        relationship.referencedRelation
      )}`
    );
    lines.push(
      `${indent(depth + 2)}referencedColumns: [${relationship.referencedColumns
        .map((column) => JSON.stringify(column))
        .join(", ")}]`
    );
    lines.push(
      `${indent(depth + 1)}}${index < relationships.length - 1 ? "," : ""}`
    );
  });
  lines.push(`${indent(depth)}]`);
}

function renderFunctions(
  lines: string[],
  functions: FunctionSignature[],
  types: Map<string, TypeInfo>,
  schemas: string[],
  depth: number
) {
  lines.push(`${indent(depth)}Functions: {`);
  if (functions.length === 0) {
    lines.push(`${indent(depth + 1)}[_ in never]: never`);
    lines.push(`${indent(depth)}}`);
    return;
  }

  const byName = groupBy(functions, (signature) => signature.name);
  for (const [name, signatures] of byName) {
    const [firstSignature] = signatures;
    if (!firstSignature) continue;
    if (signatures.length === 1) {
      lines.push(`${indent(depth + 1)}${propertyName(name)}: {`);
      renderFunctionSignature(lines, firstSignature, types, schemas, depth + 2);
      lines.push(`${indent(depth + 1)}}`);
      continue;
    }

    lines.push(`${indent(depth + 1)}${propertyName(name)}:`);
    for (const signature of signatures) {
      lines.push(`${indent(depth + 2)}| {`);
      renderFunctionSignature(lines, signature, types, schemas, depth + 3);
      lines.push(`${indent(depth + 2)}}`);
    }
  }

  lines.push(`${indent(depth)}}`);
}

function renderFunctionSignature(
  lines: string[],
  signature: FunctionSignature,
  types: Map<string, TypeInfo>,
  schemas: string[],
  depth: number
) {
  const inputArgs = signature.args.sort((a, b) => a.ordinal - b.ordinal);
  if (inputArgs.length === 0) {
    lines.push(`${indent(depth)}Args: never`);
  } else {
    lines.push(`${indent(depth)}Args: {`);
    const requiredInputCount = Math.max(
      0,
      inputArgs.length - signature.defaultArgCount
    );
    inputArgs.forEach((arg, index) => {
      const optional = index >= requiredInputCount;
      const name = arg.name || `_${index + 1}`;
      lines.push(
        `${indent(depth + 1)}${propertyName(name)}${optional ? "?" : ""}: ${renderType(
          arg.typeOid,
          types,
          schemas
        )}`
      );
    });
    lines.push(`${indent(depth)}}`);
  }

  const returnType = renderFunctionReturn(signature, types, schemas, depth);
  lines.push(`${indent(depth)}Returns: ${returnType}`);
}

function renderFunctionReturn(
  signature: FunctionSignature,
  types: Map<string, TypeInfo>,
  schemas: string[],
  depth: number
) {
  if (signature.outputArgs.length === 0) {
    const scalar = renderType(signature.returnTypeOid, types, schemas);
    return signature.returnSet ? `${scalar}[]` : scalar;
  }

  const lines = ["{"];
  for (const arg of signature.outputArgs.sort(
    (a, b) => a.ordinal - b.ordinal
  )) {
    const name = arg.name || `_${arg.ordinal}`;
    lines.push(
      `${indent(depth + 1)}${propertyName(name)}: ${renderType(
        arg.typeOid,
        types,
        schemas
      )}`
    );
  }
  lines.push(`${indent(depth)}}${signature.returnSet ? "[]" : ""}`);
  return lines.join(`\n${indent(depth)}`);
}

function renderEnums(lines: string[], enums: EnumDef[], depth: number) {
  lines.push(`${indent(depth)}Enums: {`);
  if (enums.length === 0) {
    lines.push(`${indent(depth + 1)}[_ in never]: never`);
    lines.push(`${indent(depth)}}`);
    return;
  }

  for (const entry of enums) {
    lines.push(
      `${indent(depth + 1)}${propertyName(entry.name)}: ${entry.labels
        .map((label) => JSON.stringify(label))
        .join(" | ")}`
    );
  }
  lines.push(`${indent(depth)}}`);
}

function renderCompositeTypes(
  lines: string[],
  composites: CompositeDef[],
  depth: number
) {
  lines.push(`${indent(depth)}CompositeTypes: {`);
  if (composites.length === 0) {
    lines.push(`${indent(depth + 1)}[_ in never]: never`);
    lines.push(`${indent(depth)}}`);
    return;
  }

  for (const composite of composites) {
    lines.push(`${indent(depth + 1)}${propertyName(composite.name)}: {`);
    for (const column of composite.columns) {
      lines.push(
        `${indent(depth + 2)}${propertyName(column.name)}: ${
          column.nullable ? `${column.type} | null` : column.type
        }`
      );
    }
    lines.push(`${indent(depth + 1)}}`);
  }
  lines.push(`${indent(depth)}}`);
}

function renderHelperTypes(lines: string[]) {
  lines.push("type DatabaseSchemas = Database");
  lines.push("");
  lines.push(
    'type DefaultSchema = DatabaseSchemas[Extract<keyof Database, "public">]'
  );
  lines.push("");
  lines.push("export type Tables<");
  lines.push("  DefaultSchemaTableNameOrOptions extends");
  lines.push('    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])');
  lines.push("    | { schema: keyof DatabaseSchemas },");
  lines.push("  TableName extends DefaultSchemaTableNameOrOptions extends {");
  lines.push("    schema: keyof DatabaseSchemas");
  lines.push("  }");
  lines.push(
    '    ? keyof (DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &'
  );
  lines.push(
    '        DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Views"])'
  );
  lines.push("    : never = never,");
  lines.push("> = DefaultSchemaTableNameOrOptions extends {");
  lines.push("  schema: keyof DatabaseSchemas");
  lines.push("}");
  lines.push(
    '  ? (DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &'
  );
  lines.push(
    '      DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {'
  );
  lines.push("      Row: infer R");
  lines.push("    }");
  lines.push("    ? R");
  lines.push("    : never");
  lines.push(
    '  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &'
  );
  lines.push('        DefaultSchema["Views"])');
  lines.push('    ? (DefaultSchema["Tables"] &');
  lines.push(
    '        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {'
  );
  lines.push("        Row: infer R");
  lines.push("      }");
  lines.push("      ? R");
  lines.push("      : never");
  lines.push("    : never");
  lines.push("");
  lines.push("export type TablesInsert<");
  lines.push("  DefaultSchemaTableNameOrOptions extends");
  lines.push('    | keyof DefaultSchema["Tables"]');
  lines.push("    | { schema: keyof DatabaseSchemas },");
  lines.push("  TableName extends DefaultSchemaTableNameOrOptions extends {");
  lines.push("    schema: keyof DatabaseSchemas");
  lines.push("  }");
  lines.push(
    '    ? keyof DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]'
  );
  lines.push("    : never = never,");
  lines.push("> = DefaultSchemaTableNameOrOptions extends {");
  lines.push("  schema: keyof DatabaseSchemas");
  lines.push("}");
  lines.push(
    '  ? DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {'
  );
  lines.push("      Insert: infer I");
  lines.push("    }");
  lines.push("    ? I");
  lines.push("    : never");
  lines.push(
    '  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]'
  );
  lines.push(
    '    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {'
  );
  lines.push("        Insert: infer I");
  lines.push("      }");
  lines.push("      ? I");
  lines.push("      : never");
  lines.push("    : never");
  lines.push("");
  lines.push("export type TablesUpdate<");
  lines.push("  DefaultSchemaTableNameOrOptions extends");
  lines.push('    | keyof DefaultSchema["Tables"]');
  lines.push("    | { schema: keyof DatabaseSchemas },");
  lines.push("  TableName extends DefaultSchemaTableNameOrOptions extends {");
  lines.push("    schema: keyof DatabaseSchemas");
  lines.push("  }");
  lines.push(
    '    ? keyof DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]'
  );
  lines.push("    : never = never,");
  lines.push("> = DefaultSchemaTableNameOrOptions extends {");
  lines.push("  schema: keyof DatabaseSchemas");
  lines.push("}");
  lines.push(
    '  ? DatabaseSchemas[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {'
  );
  lines.push("      Update: infer U");
  lines.push("    }");
  lines.push("    ? U");
  lines.push("    : never");
  lines.push(
    '  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]'
  );
  lines.push(
    '    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {'
  );
  lines.push("        Update: infer U");
  lines.push("      }");
  lines.push("      ? U");
  lines.push("      : never");
  lines.push("    : never");
  lines.push("");
  lines.push("export type Enums<");
  lines.push("  DefaultSchemaEnumNameOrOptions extends");
  lines.push('    | keyof DefaultSchema["Enums"]');
  lines.push("    | { schema: keyof DatabaseSchemas },");
  lines.push("  EnumName extends DefaultSchemaEnumNameOrOptions extends {");
  lines.push("    schema: keyof DatabaseSchemas");
  lines.push("  }");
  lines.push(
    '    ? keyof DatabaseSchemas[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]'
  );
  lines.push("    : never = never,");
  lines.push("> = DefaultSchemaEnumNameOrOptions extends {");
  lines.push("  schema: keyof DatabaseSchemas");
  lines.push("}");
  lines.push(
    '  ? DatabaseSchemas[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]'
  );
  lines.push(
    '  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]'
  );
  lines.push('    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]');
  lines.push("    : never");
  lines.push("");
  lines.push("export type CompositeTypes<");
  lines.push("  PublicCompositeTypeNameOrOptions extends");
  lines.push('    | keyof DefaultSchema["CompositeTypes"]');
  lines.push("    | { schema: keyof DatabaseSchemas },");
  lines.push(
    "  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {"
  );
  lines.push("    schema: keyof DatabaseSchemas");
  lines.push("  }");
  lines.push(
    '    ? keyof DatabaseSchemas[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]'
  );
  lines.push("    : never = never,");
  lines.push("> = PublicCompositeTypeNameOrOptions extends {");
  lines.push("  schema: keyof DatabaseSchemas");
  lines.push("}");
  lines.push(
    '  ? DatabaseSchemas[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]'
  );
  lines.push(
    '  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]'
  );
  lines.push(
    '    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]'
  );
  lines.push("    : never");
}

function renderConstants(lines: string[], catalog: Catalog) {
  lines.push("export const Constants = {");
  for (const schema of catalog.schemas) {
    const enums = catalog.enums.filter((entry) => entry.schema === schema);
    lines.push(`${indent(1)}${propertyName(schema)}: {`);
    lines.push(`${indent(2)}Enums: {`);
    for (const entry of enums) {
      lines.push(
        `${indent(3)}${propertyName(entry.name)}: [${entry.labels
          .map((label) => JSON.stringify(label))
          .join(", ")}],`
      );
    }
    lines.push(`${indent(2)}},`);
    lines.push(`${indent(1)}},`);
  }
  lines.push("} as const");
}

function renderType(
  oid: string | null | undefined,
  types: Map<string, TypeInfo>,
  schemas: string[]
): string {
  if (!oid) return "unknown";
  const type = types.get(oid);
  if (!type) return "unknown";

  if (type.kind === "d" && type.baseOid) {
    return renderType(type.baseOid, types, schemas);
  }

  if (type.elementOid && type.elementOid !== "0" && type.name.startsWith("_")) {
    const element = renderType(type.elementOid, types, schemas);
    return element.includes(" | ") ? `(${element})[]` : `${element}[]`;
  }

  if (type.kind === "e") {
    if (schemas.includes(type.schema)) {
      return `Database[${JSON.stringify(type.schema)}]["Enums"][${JSON.stringify(
        type.name
      )}]`;
    }
    return "string";
  }

  const builtIn = renderBuiltInType(type.name);
  if (builtIn) return builtIn;

  if (type.kind === "c" && schemas.includes(type.schema)) {
    return `Database[${JSON.stringify(type.schema)}]["CompositeTypes"][${JSON.stringify(
      type.name
    )}]`;
  }

  return "unknown";
}

function renderBuiltInType(typeName: string) {
  switch (typeName) {
    case "bool":
      return "boolean";
    case "bytea":
      return "string";
    case "date":
    case "inet":
    case "interval":
    case "macaddr":
    case "macaddr8":
    case "name":
    case "text":
    case "time":
    case "timetz":
    case "timestamp":
    case "timestamptz":
    case "uuid":
    case "varchar":
    case "xml":
    case "bpchar":
    case "char":
      return "string";
    case "float4":
    case "float8":
    case "int2":
    case "int4":
    case "int8":
    case "money":
    case "numeric":
    case "oid":
      return "number";
    case "json":
    case "jsonb":
      return "Json";
    case "trigger":
    case "void":
      return "undefined";
    default:
      return undefined;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const schemas: string[] = [];
  let connectionString: string | undefined;
  let outputPath = resolve(PACKAGE_ROOT, "src", "types.ts");
  let edgeTypesPath: string | undefined;
  let allowNonLocal = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    switch (arg) {
      case "--allow-non-local":
        allowNonLocal = true;
        break;
      case "--db-url":
        connectionString = requireArg(argv, ++i, arg);
        break;
      case "--edge-types-out":
        edgeTypesPath = resolvePath(requireArg(argv, ++i, arg));
        break;
      case "--out":
        outputPath = resolvePath(requireArg(argv, ++i, arg));
        break;
      case "--schema":
        schemas.push(
          ...requireArg(argv, ++i, arg)
            .split(",")
            .map((schema) => schema.trim())
            .filter(Boolean)
        );
        break;
      case "--skip-edge-types":
        edgeTypesPath = undefined;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  connectionString ??=
    process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(
      "CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required"
    );
  }

  if (!allowNonLocal) {
    assertLocalConnection(connectionString);
  }

  return {
    connectionString,
    edgeTypesPath,
    outputPath,
    schemas: schemas.length > 0 ? unique(schemas) : DEFAULT_SCHEMAS
  };
}

function requireArg(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function resolvePath(path: string) {
  return resolve(process.cwd(), path);
}

function assertLocalConnection(connectionString: string) {
  const url = new URL(connectionString);
  if (
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "::1" &&
    url.hostname !== "0.0.0.0"
  ) {
    throw new Error(
      `Refusing to generate types against non-local DB: ${redactConnectionString(
        connectionString
      )}`
    );
  }
}

function redactConnectionString(connectionString: string) {
  return connectionString.replace(/:[^:@/]+@/u, ":***@");
}

function propertyName(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : JSON.stringify(name);
}

function groupBy<T>(values: T[], getKey: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function indent(depth: number) {
  return "  ".repeat(depth);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await generateDatabaseTypes(options);
  console.log(`wrote ${options.outputPath}`);
  if (options.edgeTypesPath) {
    console.log(`wrote ${options.edgeTypesPath}`);
  }
}

if (process.argv[1]?.endsWith("generate.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
