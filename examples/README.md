# Examples

This folder contains examples for interacting with Carbon through the API to accomplish different things.

Examples are intended to be as small as possible so that the behavior can be composed by you.

In most examples, we first define an API client like this, and then selectively add methods. Each example will have different methods to accomplish some task. For more details, we recommend checking out the `.service.ts` files in the `/apps` repo.

```ts
import {
  getServiceDatabaseQueryClient,
  type DatabaseQueryClient,
} from "@carbon/database/query-client";
import {
  CARBON_APP_URL,
  CARBON_COMPANY_ID,
} from "~/config";

class CarbonClient {
  private readonly appUrl: string = CARBON_APP_URL;
  private readonly client: DatabaseQueryClient;
  private readonly companyId: string = CARBON_COMPANY_ID;

  constructor() {
    this.client = getServiceDatabaseQueryClient();
  }
}

const carbon = new CarbonClient();
export { carbon };
```
