import { checkDatabaseHealth } from "~/services/database.server";

export async function loader() {
  try {
    await checkDatabaseHealth();
    return new Response("OK");
  } catch (error: unknown) {
    console.log("health ❌", { error });
    return new Response("ERROR", { status: 500 });
  }
}
