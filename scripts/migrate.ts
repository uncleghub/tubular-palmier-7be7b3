import { pool } from "../lib/db";
import { applyMigrations } from "../lib/migrations";
try {
  await applyMigrations(pool);
  console.log("Database migrations complete");
} finally {
  await pool.end();
}
