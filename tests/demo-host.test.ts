import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEnvironment } from "../scripts/host-demo.mjs";

test("hosted demo derives a trusted public origin from Render", () => {
  const env = demoEnvironment({
    APP_MODE: "demo",
    DATABASE_URL: "postgresql://test.invalid/demo",
    RENDER_EXTERNAL_URL: "https://studio-example.onrender.com/",
  });
  assert.equal(env.APP_URL, "https://studio-example.onrender.com");
});
test("hosted demo rejects production mode and missing prerequisites", () => {
  assert.throws(() => demoEnvironment({ APP_MODE: "production" }), /APP_MODE/);
  assert.throws(() => demoEnvironment({ APP_MODE: "demo" }), /DATABASE_URL/);
  assert.throws(
    () =>
      demoEnvironment({
        APP_MODE: "demo",
        DATABASE_URL: "postgresql://test.invalid/demo",
      }),
    /APP_URL/,
  );
  assert.throws(
    () =>
      demoEnvironment({
        APP_MODE: "demo",
        DATABASE_URL: "postgresql://test.invalid/demo",
        APP_URL: "ftp://example.com",
      }),
    /HTTP/,
  );
});
