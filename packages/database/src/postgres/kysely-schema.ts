import type { ColumnType } from "kysely";

type SystemSchema = "graphql_public" | "storage";
type SchemaLike = {
  Tables?: Record<string, unknown>;
  Views?: Record<string, unknown>;
};

type PublicSchema<GeneratedDatabase> = GeneratedDatabase extends {
  public: infer Schema;
}
  ? Schema
  : never;

type TablesFor<Schema> = Schema extends { Tables: infer Tables } ? Tables : {};
type ViewsFor<Schema> = Schema extends { Views: infer Views } ? Views : {};

type GeneratedTable = {
  Row: Record<string, unknown>;
  Insert?: Record<string, unknown>;
  Update?: Record<string, unknown>;
};

type InsertValue<Table, Column extends PropertyKey> = Table extends {
  Insert: infer Insert;
}
  ? Column extends keyof Insert
    ? Insert[Column]
    : never
  : never;

type UpdateValue<Table, Column extends PropertyKey> = Table extends {
  Update: infer Update;
}
  ? Column extends keyof Update
    ? Update[Column]
    : never
  : never;

export type KyselyTableFromGenerated<Table> = Table extends GeneratedTable
  ? {
      [Column in keyof Table["Row"]]: ColumnType<
        undefined extends Table["Row"][Column]
          ? Exclude<Table["Row"][Column], undefined> | null
          : Table["Row"][Column],
        InsertValue<Table, Column>,
        UpdateValue<Table, Column>
      >;
    }
  : never;

export type KyselySingleSchemaDatabase<GeneratedDatabase> =
  PublicSchema<GeneratedDatabase> extends SchemaLike
    ? {
        [TableName in keyof TablesFor<
          PublicSchema<GeneratedDatabase>
        >]: KyselyTableFromGenerated<
          TablesFor<PublicSchema<GeneratedDatabase>>[TableName]
        >;
      } & {
        [ViewName in keyof ViewsFor<
          PublicSchema<GeneratedDatabase>
        >]: KyselyTableFromGenerated<
          ViewsFor<PublicSchema<GeneratedDatabase>>[ViewName]
        >;
      }
    : never;

type SchemaTableAndViewNames<GeneratedDatabase> = {
  [SchemaName in Exclude<keyof GeneratedDatabase, SystemSchema>]:
    | (GeneratedDatabase[SchemaName] extends { Tables: infer Tables }
        ? `${SchemaName & string}.${keyof Tables & string}`
        : never)
    | (GeneratedDatabase[SchemaName] extends { Views: infer Views }
        ? `${SchemaName & string}.${keyof Views & string}`
        : never);
}[Exclude<keyof GeneratedDatabase, SystemSchema>];

export type KyselyMultiSchemaDatabase<GeneratedDatabase> = {
  [Name in SchemaTableAndViewNames<GeneratedDatabase>]: Name extends `${infer SchemaName extends keyof GeneratedDatabase & string}.${infer ObjectName}`
    ? GeneratedDatabase[SchemaName] extends { Tables: infer Tables }
      ? ObjectName extends keyof Tables
        ? KyselyTableFromGenerated<Tables[ObjectName]>
        : GeneratedDatabase[SchemaName] extends { Views: infer Views }
          ? ObjectName extends keyof Views
            ? KyselyTableFromGenerated<Views[ObjectName]>
            : never
          : never
      : never
    : never;
};

export type KyselyDatabaseFromGenerated<GeneratedDatabase> =
  keyof GeneratedDatabase extends "public" | SystemSchema
    ? KyselySingleSchemaDatabase<GeneratedDatabase>
    : KyselySingleSchemaDatabase<GeneratedDatabase> &
        KyselyMultiSchemaDatabase<GeneratedDatabase>;
