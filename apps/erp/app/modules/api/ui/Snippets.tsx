// ─── Types ───────────────────────────────────────────────────────────────────

type SnippetLanguage = { language: string; code: string };

type Snippet = {
  title?: string;
  bash: SnippetLanguage | null;
  js?: SnippetLanguage;
};

// ─── Snippet Helpers ─────────────────────────────────────────────────────────

function defineSnippet(
  title: string | undefined,
  languages: Omit<Snippet, "title">
): Snippet {
  return { title, ...languages };
}

function createBashSnippet(code: string): SnippetLanguage {
  return { language: "bash", code };
}

function createJsSnippet(code: string): SnippetLanguage {
  return { language: "js", code };
}

function schemaOnlySnippet(title: string, resourceId: string): Snippet {
  const message = [
    `${resourceId} is listed here for schema metadata.`,
    "Use the app-owned /api/* routes or MCP tools for supported operations."
  ].join(" ");

  return defineSnippet(title, {
    bash: createBashSnippet(`# ${message}`),
    js: createJsSnippet(`// ${message}`)
  });
}

const snippets = {
  // ── Setup ────────────────────────────────────────────────────────────────

  endpoint: (endpoint: string) => ({
    title: "API URL",
    bash: createBashSnippet(endpoint),
    js: { language: "bash", code: endpoint }
  }),

  install: () => ({
    title: "Install",
    bash: null,
    js: createBashSnippet(`# No SDK is required. Use the HTTP API directly.`)
  }),

  env: ({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) =>
    defineSnippet(undefined, {
      bash: createBashSnippet(
        [
          `export CARBON_API_URL="${apiUrl}"`,
          `export CARBON_API_KEY="${apiKey}"`
        ].join("\n")
      ),
      js: createJsSnippet(
        [
          `// .env`,
          `CARBON_API_URL = "${apiUrl}"`,
          `CARBON_API_KEY = "${apiKey}"`
        ].join("\n")
      )
    }),

  init: (_endpoint: string) =>
    defineSnippet(undefined, {
      bash: createBashSnippet(`# No client library required for Bash.`),
      js: createJsSnippet(`
const apiUrl = process.env.CARBON_API_URL
const apiKey = process.env.CARBON_API_KEY

async function carbonFetch(path, init = {}) {
  const headers = {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
    ...(init.headers ?? {})
  }

  const response = await fetch(\`\${apiUrl}\${path}\`, { ...init, headers })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.message ?? \`Carbon API request failed with \${response.status}\`)
  }

  return data
}`)
    }),

  // ── Table Schema ────────────────────────────────────────────────────────

  readAll: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("Read rows", resourceId),

  readColumns: ({
    title = "Read specific columns",
    resourceId
  }: {
    title?: string;
    resourceId: string;
    endpoint: string;
    columnName?: string;
    apiKey?: string;
  }) => schemaOnlySnippet(title, resourceId),

  readForeignTables: (
    resourceId: string,
    _endpoint?: string,
    _apiKey?: string
  ) =>
    schemaOnlySnippet("Read referenced tables", resourceId),

  readRange: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("With pagination", resourceId),

  readFilters: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("With filtering", resourceId),

  insertSingle: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("Insert a row", resourceId),

  insertMany: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("Insert many rows", resourceId),

  upsert: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("Upsert matching rows", resourceId),

  update: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("Update matching rows", resourceId),

  delete: (resourceId: string, _endpoint?: string, _apiKey?: string) =>
    schemaOnlySnippet("Delete matching rows", resourceId)
};

export default snippets;
