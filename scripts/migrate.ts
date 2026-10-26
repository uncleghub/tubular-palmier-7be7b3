import { readFile } from "node:fs/promises";
import { pool } from "../lib/db";
await pool.query(
  await readFile(new URL("../migrations/001.sql", import.meta.url), "utf8"),
);
console.log("Database migration complete");
await pool.end();
