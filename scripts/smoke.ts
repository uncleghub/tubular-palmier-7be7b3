import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = new URL(process.env.APP_URL || "http://localhost:3000").origin;
const health = await fetch(origin + "/api/health");
assert.equal(health.status, 200);
const status = await health.json();
assert.equal(status.ok, true);
if (status.mode !== "demo")
  throw new Error(
    "This no-spend smoke workflow only runs in demo mode. Use read-only health and credentialed staging checks for production.",
  );
const session = await fetch(origin + "/api/session", {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(session.status, 200);
const cookie = session.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function call(path: string, body?: unknown) {
  const r = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { origin, cookie: cookie!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  return data;
}
const input = {
  modelId: "sample-image",
  prompt: "Startup smoke check: local illustrative sample",
  ratio: "1:1",
  resolution: "1024",
  requestId: randomUUID(),
};
const q = await call("quote", input);
assert.equal(q.credits, 12);
const job = await call("jobs", { ...input, quoteId: q.id });
let complete = false;
for (let attempt = 0; attempt < 60; attempt++) {
  const a = await call("account");
  const j = a.jobs.find((j: { id: string }) => j.id === job.id);
  if (j.state === "succeeded") {
    complete = true;
    assert.equal(a.wallet.balance, 988);
    assert.equal(a.wallet.reserved, 0);
    break;
  }
  if (["failed", "uncertain"].includes(j.state))
    throw new Error("Smoke job did not succeed: " + j.state);
  await new Promise((r) => setTimeout(r, 500));
}
assert.ok(complete, "Worker did not finish the demo job within 30 seconds");
const media = await fetch(origin + "/api/download/" + job.id, {
  headers: { cookie: cookie! },
});
assert.equal(media.status, 200);
assert.match(await media.text(), /<svg/);
await call("account/delete", {});
console.log(
  "PASS: database health, demo session, quote, reservation, worker, settlement, private download and deletion. No paid services used.",
);
