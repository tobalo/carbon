import { Pool } from "pg";
import { CARBON_CONTROL_DATABASE_URL } from "./env";

const pool = new Pool({
  connectionString: CARBON_CONTROL_DATABASE_URL
});

export async function fetchWorkspaces<T>(columns = "*") {
  const result = await pool.query<T>(
    `select ${columns} from workspaces order by id`
  );
  return result.rows;
}

export async function markWorkspaceSeeded(id: number) {
  await pool.query("update workspaces set seeded = true where id = $1", [id]);
}
