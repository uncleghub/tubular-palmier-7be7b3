import { pool } from "../lib/db";
import { remove } from "../lib/storage";
const days = Number(process.env.MEDIA_RETENTION_DAYS || 30);
if (!Number.isInteger(days) || days < 1)
  throw new Error("Retention must be at least one day");
const outputs = await pool.query(
  "SELECT id,output_key FROM jobs WHERE output_key IS NOT NULL AND state='succeeded' AND created_at<now()-($1::int*interval '1 day')",
  [days],
);
for (const j of outputs.rows) {
  await remove(j.output_key);
  await pool.query("UPDATE jobs SET output_key=NULL WHERE id=$1", [j.id]);
}
const refs = await pool.query(
  "SELECT id,object_key FROM uploads WHERE created_at<now()-($1::int*interval '1 day') AND NOT EXISTS(SELECT 1 FROM jobs WHERE input->>'referenceId'=uploads.id::text AND state IN ('queued','running','uncertain'))",
  [days],
);
for (const u of refs.rows) {
  await remove(u.object_key);
  await pool.query("DELETE FROM uploads WHERE id=$1", [u.id]);
}
await pool.query(
  "DELETE FROM rate_limits WHERE reset_at<now()-interval '1 day'",
);
await pool.query("DELETE FROM quotes WHERE expires_at<now()-interval '1 day'");
console.log(
  "Retention cleanup complete:",
  outputs.rowCount,
  "outputs,",
  refs.rowCount,
  "references",
);
await pool.end();
