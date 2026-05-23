import { cn } from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { LuTable2 } from "react-icons/lu";
import { useApiDocsSchema } from "~/hooks/useApiDocsSchema";
import type { ValidLang } from "~/modules/api";
import { CodeSnippet, Snippets } from "~/modules/api";

type TableDocsProps = {
  endpoint: string;
  selectedLang: ValidLang;
  resourceId: string;
  apiKey?: string;
};

const TableDocs = ({
  endpoint,
  selectedLang,
  resourceId,
  apiKey
}: TableDocsProps) => {
  const apiDocsSchema = useApiDocsSchema();
  const resourcePaths = apiDocsSchema?.paths?.[`/${resourceId}`];
  const resourceDefinition = apiDocsSchema?.definitions?.[resourceId] as
    | { properties?: Record<string, any>; required?: string[] }
    | undefined;

  const methods = Object.keys(resourcePaths ?? {}).map((x) => x.toUpperCase());
  const properties = Object.entries(resourceDefinition?.properties ?? []).map(
    ([id, val]: any) => ({
      ...val,
      id,
      required: resourceDefinition?.required?.includes(id)
    })
  );

  if (
    !apiDocsSchema?.paths ||
    !apiDocsSchema?.definitions ||
    !apiDocsSchema
  )
    return null;

  return (
    <>
      <h2 className="doc-section__table-name text-foreground mt-0 flex items-center px-6 gap-2">
        <span className="bg-muted p-2 rounded-lg">
          <LuTable2 size={18} />
        </span>
        <span className="text-2xl font-bold">{resourceId}</span>
      </h2>

      <div className="doc-section">
        <article className="code"></article>
      </div>
      {properties.length > 0 && (
        <div>
          {properties.map((x) => (
            <div className="doc-section py-4" key={x.id}>
              <div className="code-column text-foreground">
                <Param
                  key={x.id}
                  name={x.id}
                  type={x.type}
                  format={x.format}
                  isOptional={!x.required}
                  metadata={{
                    table: resourceId,
                    column: x.id
                  }}
                />
              </div>
              <div className="code">
                <CodeSnippet
                  selectedLang={selectedLang}
                  snippet={Snippets.readColumns({
                    title: `Select ${x.id}`,
                    resourceId,
                    endpoint,
                    columnName: x.id,
                    apiKey
                  })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {methods.includes("GET") && (
        <>
          <h3 className="text-foreground mt-4 px-6">
            <Trans>Read rows</Trans>
          </h3>
          <div className="doc-section">
            <article className="code-column text-foreground">
              <p>
                <Trans>
                  To read rows in <code>{resourceId}</code>, use the{" "}
                  <code>select</code> method.
                </Trans>
              </p>
            </article>
            <article className="code">
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.readAll(resourceId, endpoint, apiKey)}
              />
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.readColumns({
                  resourceId,
                  endpoint,
                  apiKey
                })}
              />
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.readForeignTables(
                  resourceId,
                  endpoint,
                  apiKey
                )}
              />
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.readRange(resourceId, endpoint, apiKey)}
              />
            </article>
          </div>
          <div className="doc-section">
            <article className="code-column text-foreground">
              <h4 className="mt-0 text-white">
                <Trans>Filtering</Trans>
              </h4>
              <p>
                <Trans>Carbon provides a wide range of filters.</Trans>
              </p>
            </article>
            <article className="code">
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.readFilters(resourceId, endpoint, apiKey)}
              />
            </article>
          </div>
        </>
      )}
      {methods.includes("POST") && (
        <>
          <h3 className="text-foreground mt-4 px-6">
            <Trans>Insert rows</Trans>
          </h3>
          <div className="doc-section">
            <article className="code-column text-foreground">
              <p>
                <Trans>
                  <code>insert</code> lets you insert into your tables. You can
                  also insert in bulk and do UPSERT.
                </Trans>
              </p>
              <p>
                <Trans>
                  <code>insert</code> will also return the replaced values for
                  UPSERT.
                </Trans>
              </p>
            </article>
            <article className="code">
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.insertSingle(resourceId, endpoint, apiKey)}
              />
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.insertMany(resourceId, endpoint, apiKey)}
              />
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.upsert(resourceId, endpoint, apiKey)}
              />
            </article>
          </div>
        </>
      )}
      {methods.includes("PATCH") && (
        <>
          <h3 className="text-foreground mt-4 px-6">
            <Trans>Update rows</Trans>
          </h3>
          <div className="doc-section">
            <article className="code-column text-foreground">
              <p>
                <Trans>
                  <code>update</code> lets you update rows. <code>update</code>{" "}
                  will match all rows by default. You can update specific rows
                  using horizontal filters, e.g. <code>eq</code>,{" "}
                  <code>lt</code>, and <code>is</code>.
                </Trans>
              </p>
              <p>
                <Trans>
                  <code>update</code> will also return the replaced values for
                  UPDATE.
                </Trans>
              </p>
            </article>
            <article className="code">
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.update(resourceId, endpoint, apiKey)}
              />
            </article>
          </div>
        </>
      )}
      {methods.includes("DELETE") && (
        <>
          <h3 className="text-foreground mt-4 px-6">
            <Trans>Delete rows</Trans>
          </h3>
          <div className="doc-section">
            <article className="code-column text-foreground">
              <p>
                <Trans>
                  <code>delete</code> lets you delete rows. <code>delete</code>{" "}
                  will match all rows by default, so remember to specify your
                  filters!
                </Trans>
              </p>
            </article>
            <article className="code">
              <CodeSnippet
                selectedLang={selectedLang}
                snippet={Snippets.delete(resourceId, endpoint, apiKey)}
              />
            </article>
          </div>
        </>
      )}
    </>
  );
};

type ParamProps = {
  name?: string;
  type?: string;
  format?: string;
  required?: boolean;
  metadata?: { table: string; column: string };
  isOptional?: boolean;
  isPrimitive?: boolean;
  children?: React.ReactNode;
};

const Param = ({
  name,
  isOptional,
  type,
  format,
  children,
  isPrimitive
}: ParamProps) => {
  return (
    <>
      <div className="mb-4 flex items-center justify-between ">
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <label className="font-mono text-xs uppercase text-foreground-lighter  min-w-[55px]">
              <Trans>Column</Trans>
            </label>
            <div className="flex items-center gap-4">
              <span className="text-md text-foreground pb-0.5">{name}</span>
            </div>
          </div>
        </div>
        <div
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs",
            !isOptional && "border-amber-700 bg-amber-300 text-amber-900 "
          )}
        >
          {isOptional ? <Trans>Optional</Trans> : <Trans>Required</Trans>}
        </div>
      </div>
      <div className="grid gap-2 mt-6">
        <div className="mb-4 flex items-center gap-2">
          <label className="font-mono text-xs uppercase text-foreground-lighter min-w-[55px]">
            <Trans>Type</Trans>
          </label>
          <div>
            <span className="flex grow-0 bg-muted px-2 py-0.5 rounded-md text-foreground-light">
              <span className="flex items-center gap-2 text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <span>{type}</span>
              </span>
            </span>
          </div>
        </div>
        <div className="mb-4 flex items-center gap-2">
          <label className="font-mono text-xs uppercase text-foreground-lighter min-w-[55px]">
            <Trans>Format</Trans>
          </label>
          <div>
            <span className="flex grow-0 bg-muted px-2 py-0.5 rounded-md text-foreground-light">
              <span className="flex items-center gap-2 text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                </svg>
                <span>{format}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default TableDocs;
