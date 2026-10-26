import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
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
    await setup.query(
      await readFile(new URL("../migrations/001.sql", import.meta.url), "utf8"),
    );
  } finally {
    await setup.end();
  }
  const files = (await readdir(new URL("../tests/", import.meta.url)))
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => "tests/" + f);
  code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", ...files],
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
