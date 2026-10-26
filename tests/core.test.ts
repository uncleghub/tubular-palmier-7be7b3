import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { quote, reserveJob, finishJob, fulfillPurchase } from "../lib/wallet";
import { validateModel, creditCost, inputSchema } from "../lib/catalog";
import { receivePayment, signPayment } from "../lib/payments";
import { reconcileLostLeases } from "../lib/queue";
import { sampleAdapter } from "../lib/providers";
const ids: string[] = [];
async function user(balance = 100) {
  const id = "test_" + randomUUID();
  ids.push(id);
  await pool.query("INSERT INTO users(id,balance) VALUES($1,$2)", [
    id,
    balance,
  ]);
  return id;
}
function input(extra = {}) {
  return {
    modelId: "sample-image",
    prompt: "A beautiful imaginary world",
    ratio: "1:1",
    resolution: "1024",
    requestId: randomUUID(),
    ...extra,
  };
}
async function job(u: string, extra = {}) {
  const i = input(extra);
  const q = await quote(u, i);
  return reserveJob(u, { ...i, quoteId: q.id });
}
async function wallet(u: string) {
  return (
    await pool.query("SELECT balance,reserved FROM users WHERE id=$1", [u])
  ).rows[0];
}
after(async () => {
  for (const id of ids) {
    await pool.query(
      "DELETE FROM payment_events WHERE purchase_id IN(SELECT id FROM purchases WHERE user_id=$1)",
      [id],
    );
    for (const table of ["quotes", "ledger", "jobs", "purchases", "uploads"])
      await pool.query(`DELETE FROM ${table} WHERE user_id=$1`, [id]);
    await pool.query("DELETE FROM users WHERE id=$1", [id]);
  }
  await pool.end();
});
test("unsupported settings and unavailable models fail closed", () => {
  assert.throws(() => validateModel(input({ duration: 8 }), true));
  assert.throws(() => validateModel(input({ modelId: "veo" }), true));
  assert.throws(() => validateModel(input({ ratio: "8:3" }), true));
  assert.throws(() => validateModel(input(), false));
  assert.throws(() => inputSchema.parse({ ...input(), credits: 1 }));
});
test("integer pricing honors overhead, fees and margin", () => {
  assert.equal(creditCost(20000, 500, 10000, 6000), 9);
  assert.throws(() => creditCost(1, 5000, 1, 6000));
});
test("parallel spending cannot overdraw and releases exactly once", async () => {
  const u = await user(12);
  const results = await Promise.allSettled([job(u), job(u)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await wallet(u), { balance: 0, reserved: 12 });
  const j = results.find((r) => r.status === "fulfilled")!;
  if (j.status === "fulfilled") {
    await Promise.all([
      finishJob(j.value.id, false),
      finishJob(j.value.id, false),
    ]);
  }
  assert.deepEqual(await wallet(u), { balance: 12, reserved: 0 });
});
test("quote charge is locked and duplicate submissions create one job", async () => {
  const u = await user();
  const i = input();
  const q = await quote(u, i);
  const [a, b] = await Promise.all([
    reserveJob(u, { ...i, quoteId: q.id }),
    reserveJob(u, { ...i, quoteId: q.id }),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.credits, 12);
  assert.deepEqual(await wallet(u), { balance: 88, reserved: 12 });
  await finishJob(a.id, true, {
    key: "outputs/test.svg",
    width: 1024,
    height: 1024,
  });
  await finishJob(a.id, true, {
    key: "outputs/test.svg",
    width: 1024,
    height: 1024,
  });
  assert.deepEqual(await wallet(u), { balance: 88, reserved: 0 });
});
test("quote ownership, settings changes, and reference ownership are enforced", async () => {
  const a = await user(),
    b = await user();
  const i = input();
  const q = await quote(a, i);
  await assert.rejects(reserveJob(b, { ...i, quoteId: q.id }));
  await assert.rejects(
    reserveJob(a, { ...i, prompt: "A different idea", quoteId: q.id }),
  );
  await assert.rejects(quote(a, input({ referenceId: randomUUID() })));
  assert.deepEqual(await wallet(a), { balance: 100, reserved: 0 });
});
test("expired quotes are not accepted", async () => {
  const u = await user(),
    i = input(),
    q = await quote(u, i);
  await pool.query(
    "UPDATE quotes SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [q.id],
  );
  await assert.rejects(reserveJob(u, { ...i, quoteId: q.id }));
});
test("signed payment fulfillment ignores duplicate events and refunds exactly once", async () => {
  const u = await user(0),
    id = randomUUID();
  await pool.query(
    "INSERT INTO purchases(id,user_id,package_id,cents,credits,mode) VALUES($1,$2,'starter',500,500,'test')",
    [id, u],
  );
  const body = JSON.stringify({
      eventId: "test:" + randomUUID(),
      purchaseId: id,
      kind: "paid",
      cents: 500,
      currency: "USD",
      timestamp: Math.floor(Date.now() / 1000),
    }),
    secret = "a".repeat(64);
  await assert.rejects(receivePayment(body, "bad", secret));
  await Promise.all([
    receivePayment(body, signPayment(body, secret), secret),
    receivePayment(body, signPayment(body, secret), secret),
  ]);
  await fulfillPurchase("different:" + randomUUID(), id, "paid", 500);
  assert.equal((await wallet(u)).balance, 500);
  await assert.rejects(
    fulfillPurchase("wrong:" + randomUUID(), id, "refund", 100),
  );
  await fulfillPurchase("refund:" + randomUUID(), id, "refund", 500);
  await fulfillPurchase("refund-again:" + randomUUID(), id, "refund", 500);
  assert.equal((await wallet(u)).balance, 0);
});
test("refund of spent credits is flagged for review without negative balance", async () => {
  const u = await user(0),
    id = randomUUID();
  await pool.query(
    "INSERT INTO purchases(id,user_id,package_id,cents,credits,mode) VALUES($1,$2,'starter',500,500,'test')",
    [id, u],
  );
  await fulfillPurchase("paid:" + randomUUID(), id, "paid", 500);
  await pool.query("UPDATE users SET balance=0 WHERE id=$1", [u]);
  await fulfillPurchase("refund:" + randomUUID(), id, "refund", 500);
  assert.equal((await wallet(u)).balance, 0);
  assert.equal(
    (await pool.query("SELECT status FROM purchases WHERE id=$1", [id])).rows[0]
      .status,
    "review_required",
  );
});
test("lost leases become uncertain and are not queued for automatic retry", async () => {
  const u = await user(),
    j = await job(u);
  await pool.query(
    "UPDATE jobs SET state='running',lease_until=now()-interval '1 minute' WHERE id=$1",
    [j.id],
  );
  await reconcileLostLeases();
  assert.equal(
    (await pool.query("SELECT state FROM jobs WHERE id=$1", [j.id])).rows[0]
      .state,
    "uncertain",
  );
  assert.equal((await wallet(u)).reserved, 12);
  await finishJob(j.id, false);
  assert.equal((await wallet(u)).balance, 100);
});
test("confirmed provider failure returns all reserved credits", async () => {
  const u = await user(),
    j = await job(u, { prompt: "[simulate failure]" });
  await assert.rejects(sampleAdapter.generate(j));
  await finishJob(j.id, false);
  assert.deepEqual(await wallet(u), { balance: 100, reserved: 0 });
});
test("tampered and stale payment payloads are rejected", async () => {
  const secret = "z".repeat(64);
  const body = JSON.stringify({
    eventId: "event-123456",
    purchaseId: randomUUID(),
    kind: "paid",
    cents: 500,
    currency: "USD",
    timestamp: 1,
  });
  await assert.rejects(
    receivePayment(body, signPayment(body, secret), secret),
    /expired/,
  );
  await assert.rejects(
    receivePayment(body + " ", signPayment(body, secret), secret),
    /signature/,
  );
});

test("delayed completed payments and out-of-order reversals converge safely", async () => {
  const u = await user(0);
  for (const status of ["failed", "canceled", "pending"]) {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO purchases(id,user_id,package_id,cents,credits,mode,status) VALUES($1,$2,'starter',500,500,'test',$3)",
      [id, u, status],
    );
    if (status === "pending")
      await fulfillPurchase("early-refund:" + randomUUID(), id, "refund", 500);
    await fulfillPurchase("late-payment:" + randomUUID(), id, "paid", 500);
    await fulfillPurchase(
      "late-payment-duplicate:" + randomUUID(),
      id,
      "paid",
      500,
    );
  }
  assert.equal((await wallet(u)).balance, 1000);
});

test("billable transport submits once after an unknown network outcome", async () => {
  const { ReplicateTransport, UnknownProviderOutcome } =
    await import("../lib/replicate-adapter");
  let calls = 0;
  const transport = new ReplicateTransport(
    "test-not-a-credential",
    async () => {
      calls++;
      throw new Error("network timeout");
    },
  );
  await assert.rejects(
    transport.submit("a".repeat(64), { prompt: "test" }),
    UnknownProviderOutcome,
  );
  assert.equal(calls, 1);
});
test("provider reconciliation performs reads without another billable submission", async () => {
  const { ReplicateTransport } = await import("../lib/replicate-adapter");
  const methods: string[] = [];
  const transport = new ReplicateTransport(
    "test-not-a-credential",
    async (_url, init) => {
      methods.push(init?.method || "GET");
      return Response.json({
        id: "pred_123",
        status: "succeeded",
        output: ["https://replicate.delivery/example.png"],
      });
    },
  );
  const result = await transport.reconcile("pred_123");
  assert.equal(result.state, "succeeded");
  assert.deepEqual(methods, ["GET"]);
});

test("global pause and admission limits prevent reservations", async () => {
  const u = await user(100);
  await pool.query("INSERT INTO settings VALUES('generation_disabled','true')");
  try {
    await assert.rejects(job(u), /paused/);
  } finally {
    await pool.query("DELETE FROM settings WHERE key='generation_disabled'");
  }
  const old = process.env.USER_DAILY_JOB_LIMIT;
  process.env.USER_DAILY_JOB_LIMIT = "0";
  try {
    await assert.rejects(job(u), /limit/);
  } finally {
    if (old === undefined) delete process.env.USER_DAILY_JOB_LIMIT;
    else process.env.USER_DAILY_JOB_LIMIT = old;
  }
  assert.deepEqual(await wallet(u), { balance: 100, reserved: 0 });
});
