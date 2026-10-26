import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  options:
    process.env.NODE_ENV === "test" &&
    /^studio_test_[a-z0-9]+$/.test(process.env.STUDIO_TEST_SCHEMA || "")
      ? `-c search_path=${process.env.STUDIO_TEST_SCHEMA}`
      : undefined,
});
export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
