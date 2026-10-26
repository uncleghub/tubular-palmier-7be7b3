import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { applyMigrations } from "../lib/migrations";
import pg from "pg";
const schema = "studio_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let code = 1;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const setup = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  try {
    await applyMigrations(setup);
  } finally {
    await setup.end();
  }
  const files = (await readdir(new URL("../tests/", import.meta.url)))
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => "tests/" + f);
  code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: "test",
          APP_MODE: "demo",
          STUDIO_TEST_SCHEMA: schema,
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (c) => resolve(c ?? 1));
  });
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
process.exitCode = code;
