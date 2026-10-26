import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
export async function applyMigrations(db: Pool) {
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(812404)");
    for (const file of files)
      await client.query(await readFile(new URL(file, directory), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
