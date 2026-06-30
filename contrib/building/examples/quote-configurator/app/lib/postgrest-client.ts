export type PostgrestError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  name?: string;
};

type PostgrestResult<T = any> = {
  data: T | null;
  error: PostgrestError | null;
  status: number;
  statusText: string;
};

type ClientOptions = {
  apiUrl: string;
  publicKey: string;
  carbonKey: string;
};

type QueryMethod = "GET" | "POST" | "PATCH" | "DELETE";

const emptyResult = <T>(
  status: number,
  statusText: string
): PostgrestResult<T> => ({
  data: null,
  error: null,
  status,
  statusText
});

class PostgrestQuery<T = any> implements PromiseLike<PostgrestResult<T>> {
  private body: unknown;
  private method: QueryMethod = "GET";
  private readonly params = new URLSearchParams();
  private returnRepresentation = false;
  private singular = false;
  private maybeSingular = false;

  constructor(
    private readonly options: ClientOptions,
    private readonly table: string
  ) {}

  select(columns = "*") {
    this.params.set("select", columns);
    if (this.method !== "GET") this.returnRepresentation = true;
    return this;
  }

  insert(body: unknown) {
    this.method = "POST";
    this.body = body;
    return this;
  }

  update(body: unknown) {
    this.method = "PATCH";
    this.body = body;
    return this;
  }

  delete() {
    this.method = "DELETE";
    return this;
  }

  eq(column: string, value: string) {
    this.params.set(column, `eq.${value}`);
    return this;
  }

  single() {
    this.singular = true;
    return this.execute();
  }

  maybeSingle() {
    this.singular = true;
    this.maybeSingular = true;
    return this.execute();
  }

  then<TResult1 = PostgrestResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: PostgrestResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PostgrestResult<T>> {
    const url = new URL(
      `/rest/v1/${this.table}`,
      this.options.apiUrl.replace(/\/$/, "")
    );
    this.params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    const headers: Record<string, string> = {
      apikey: this.options.publicKey,
      authorization: `Bearer ${this.options.publicKey}`,
      "carbon-key": this.options.carbonKey
    };

    if (this.body !== undefined) headers["content-type"] = "application/json";
    if (this.singular) headers.accept = "application/vnd.pgrst.object+json";
    if (this.returnRepresentation) headers.prefer = "return=representation";

    const response = await fetch(url, {
      method: this.method,
      headers,
      body: this.body === undefined ? undefined : JSON.stringify(this.body)
    });

    if (response.status === 204) {
      return emptyResult(response.status, response.statusText);
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      if (this.maybeSingular && response.status === 406) {
        return emptyResult(response.status, response.statusText);
      }

      return {
        data: null,
        error: payload as PostgrestError,
        status: response.status,
        statusText: response.statusText
      };
    }

    return {
      data: payload,
      error: null,
      status: response.status,
      statusText: response.statusText
    };
  }
}

export function createPostgrestClient(options: ClientOptions) {
  return {
    from(table: string) {
      return new PostgrestQuery(options, table);
    },
    async rpc<T = any>(
      functionName: string,
      body?: Record<string, unknown>
    ): Promise<PostgrestResult<T>> {
      const url = new URL(
        `/rest/v1/rpc/${functionName}`,
        options.apiUrl.replace(/\/$/, "")
      );
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: options.publicKey,
          authorization: `Bearer ${options.publicKey}`,
          "carbon-key": options.carbonKey,
          "content-type": "application/json"
        },
        body: JSON.stringify(body ?? {})
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        return {
          data: null,
          error: payload as PostgrestError,
          status: response.status,
          statusText: response.statusText
        };
      }

      return {
        data: payload,
        error: null,
        status: response.status,
        statusText: response.statusText
      };
    },
    async invokeFunction<T = any>(
      functionName: string,
      options_: { body?: unknown } = {}
    ): Promise<PostgrestResult<T>> {
      const url = new URL(
        `/functions/v1/${functionName}`,
        options.apiUrl.replace(/\/$/, "")
      );
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: options.publicKey,
          authorization: `Bearer ${options.publicKey}`,
          "carbon-key": options.carbonKey,
          "content-type": "application/json"
        },
        body: JSON.stringify(options_.body ?? {})
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        return {
          data: null,
          error: payload as PostgrestError,
          status: response.status,
          statusText: response.statusText
        };
      }

      return {
        data: payload,
        error: null,
        status: response.status,
        statusText: response.statusText
      };
    }
  };
}

export type PostgrestClient = ReturnType<typeof createPostgrestClient>;
