type FunctionError = {
  message: string;
};

export type FunctionInvocationResult<T> = {
  data: T | null;
  error: FunctionError | null;
};

type InvokeFunctionOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

export async function invokeFunction<T = any>(
  name: string,
  options: InvokeFunctionOptions = {}
): Promise<FunctionInvocationResult<T>> {
  const baseUrl =
    process.env.CARBON_FUNCTIONS_URL ??
    process.env.CARBON_API_URL ??
    process.env.ERP_URL;

  if (!baseUrl) {
    return {
      data: null,
      error: {
        message: "CARBON_FUNCTIONS_URL, CARBON_API_URL, or ERP_URL is not set"
      }
    };
  }

  const url = new URL(`/api/functions/${name}`, baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers
  };

  if (process.env.CARBON_FUNCTIONS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.CARBON_FUNCTIONS_TOKEN}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(options.body ?? {})
    });

    const contentType = response.headers.get("Content-Type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return {
        data: null,
        error: {
          message:
            typeof payload === "object" && payload && "message" in payload
              ? String(payload.message)
              : `Function ${name} failed with ${response.status}`
        }
      };
    }

    return {
      data: (payload && typeof payload === "object" && "data" in payload
        ? payload.data
        : payload) as T,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
