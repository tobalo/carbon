# Examples

This folder contains examples for interacting with Carbon through the API to accomplish different things.

Examples are intended to be as small as possible so that the behavior can be composed by you.

In most examples, we first define an API client like this, and then selectively add methods. Each example will have different methods to accomplish some task. For more details, we recommend checking out the `.service.ts` files in the `/apps` repo.

```ts
import {
  CARBON_API_KEY,
  CARBON_API_URL,
  CARBON_APP_URL,
  CARBON_COMPANY_ID,
  CARBON_PUBLIC_KEY,
} from "~/config";
import {
  createPostgrestClient,
  type PostgrestClient,
} from "~/lib/postgrest-client";

class CarbonClient {
  private readonly appUrl: string = CARBON_APP_URL;
  private readonly client: PostgrestClient;
  private readonly companyId: string = CARBON_COMPANY_ID;
  constructor() {
    this.client = createPostgrestClient({
      apiUrl: CARBON_API_URL,
      carbonKey: CARBON_API_KEY,
      publicKey: CARBON_PUBLIC_KEY,
    });
  }
}

const carbon = new CarbonClient();
export { carbon };
```
