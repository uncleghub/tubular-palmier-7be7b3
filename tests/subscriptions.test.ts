import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { quote, reserveJob, finishJob } from "../lib/wallet";
import { getFreePreview } from "../lib/free-preview";
import {
  getSubscription,
  createSubscriptionCheckout,
  simulateSubscriptionPayment,
  simulateSubscriptionRenewal,
  cancelSubscription,
  resumeSubscription,
  assertSubscriptionDeletionAllowed,
} from "../lib/subscriptions";
import type { GenerationInput } from "../lib/catalog";

async function customer(balance = 0) {
  const id = "test_subscription_" + randomUUID();
  await pool.query("INSERT INTO users(id,balance) VALUES($1,$2)", [
    id,
    balance,
  ]);
  return id;
}

function imageInput(extra: Partial<GenerationInput> = {}): GenerationInput {
  return {
    modelId: "sample-image",
    prompt: "A cinematic portrait in a monthly creative workspace",
    ratio: "1:1",
    resolution: "1024",
    requestId: randomUUID(),
    fundingSource: "subscription",
    ...extra,
  };
}

async function subscribe(user: string, planId = "starter") {
  const checkout = await createSubscriptionCheckout(user, planId);
  await simulateSubscriptionPayment(user, checkout.id, "paid");
  const subscription = await getSubscription(user);
  assert.ok(subscription);
  return subscription;
}

async function reserveMonthly(user: string, input = imageInput()) {
  const accepted = await quote(user, input);
  return reserveJob(user, { ...input, quoteId: accepted.id });
}

async function wallet(user: string) {
  return (
    await pool.query("SELECT balance,reserved FROM users WHERE id=$1", [user])
  ).rows[0];
}

async function succeed(id: string) {
  await finishJob(id, true, {
    key: `outputs/${id}.svg`,
    width: 1024,
    height: 1024,
  });
}

async function expirePeriod(subscription: string) {
  await pool.query(
    "UPDATE subscription_periods SET period_start=now()-interval '2 months',period_end=now()-interval '1 month' WHERE id=(SELECT current_period_id FROM subscriptions WHERE id=$1)",
    [subscription],
  );
}

async function periods(subscription: string) {
  return (
    await pool.query(
      "SELECT * FROM subscription_periods WHERE subscription_id=$1 ORDER BY period_start,id",
      [subscription],
    )
  ).rows;
}

test("a paid monthly checkout grants one allowance and preserves wallet and free preview", async () => {
  const user = await customer(123);
  const freeBefore = await getFreePreview(user);
  const checkout = await createSubscriptionCheckout(user, "starter");
  assert.equal(await getSubscription(user), null);
  await Promise.all([
    simulateSubscriptionPayment(user, checkout.id, "paid"),
    simulateSubscriptionPayment(user, checkout.id, "paid"),
  ]);
  await simulateSubscriptionPayment(user, checkout.id, "paid");
  const subscription = await getSubscription(user);
  assert.ok(subscription);
  assert.equal(subscription.planId, "starter");
  assert.equal(subscription.mode, "test");
  assert.equal(subscription.cancelAtPeriodEnd, false);
  assert.deepEqual(subscription.credits, {
    total: 500,
    remaining: 500,
    reserved: 0,
    spent: 0,
  });
  assert.deepEqual(await wallet(user), { balance: 123, reserved: 0 });
  assert.deepEqual(await getFreePreview(user), freeBefore);
  assert.equal((await periods(subscription.id)).length, 1);
  const events = (
    await pool.query(
      "SELECT proof FROM subscription_events WHERE subscription_id=$1 AND kind='paid'",
      [subscription.id],
    )
  ).rows;
  assert.equal(events.length, 1);
  assert.equal(events[0].proof.source, "local_demo");
  assert.equal(events[0].proof.mode, "test");
});

test("failed and abandoned monthly checkouts grant no subscription credits", async () => {
  for (const outcome of ["failed", "canceled"] as const) {
    const user = await customer(0);
    const checkout = await createSubscriptionCheckout(user, "starter");
    await simulateSubscriptionPayment(user, checkout.id, outcome);
    assert.equal(await getSubscription(user), null);
    await assert.rejects(quote(user, imageInput()));
    assert.deepEqual(await wallet(user), { balance: 0, reserved: 0 });
  }
});

test("monthly checkout, cancellation and resumption enforce account ownership", async () => {
  const owner = await customer();
  const stranger = await customer();
  const checkout = await createSubscriptionCheckout(owner, "creator");
  await assert.rejects(
    simulateSubscriptionPayment(stranger, checkout.id, "paid"),
  );
  assert.equal(await getSubscription(owner), null);
  await simulateSubscriptionPayment(owner, checkout.id, "paid");
  const subscription = await getSubscription(owner);
  assert.ok(subscription);
  await assert.rejects(cancelSubscription(stranger, subscription.id));
  await cancelSubscription(owner, subscription.id);
  await assert.rejects(resumeSubscription(stranger, subscription.id));
  const owned = await getSubscription(owner);
  assert.ok(owned);
  assert.equal(owned.cancelAtPeriodEnd, true);
  assert.equal(owned.credits.remaining, 1000);
  assert.equal(await getSubscription(stranger), null);
});

test("duplicate monthly jobs and settlements spend a single allowance reservation", async () => {
  const user = await customer(200);
  await subscribe(user);
  const input = imageInput();
  const accepted = await quote(user, input);
  assert.equal(accepted.credits, 12);
  assert.equal(accepted.fundingSource, "subscription");
  const [first, duplicate] = await Promise.all([
    reserveJob(user, { ...input, quoteId: accepted.id }),
    reserveJob(user, { ...input, quoteId: accepted.id }),
  ]);
  assert.equal(first.id, duplicate.id);
  assert.equal(first.funding_source, "subscription");
  assert.ok(first.subscription_period_id);
  assert.deepEqual((await getSubscription(user))!.credits, {
    total: 500,
    remaining: 488,
    reserved: 12,
    spent: 0,
  });
  await Promise.all([succeed(first.id), succeed(first.id)]);
  await finishJob(first.id, false, undefined, "Late duplicate failure");
  assert.deepEqual((await getSubscription(user))!.credits, {
    total: 500,
    remaining: 488,
    reserved: 0,
    spent: 12,
  });
  assert.deepEqual(await wallet(user), { balance: 200, reserved: 0 });
});

test("cancellation is idempotent and preserves paid access until the period ends", async () => {
  const user = await customer();
  const initial = await subscribe(user);
  await Promise.all([
    cancelSubscription(user, initial.id),
    cancelSubscription(user, initial.id),
  ]);
  const canceled = await getSubscription(user);
  assert.ok(canceled);
  assert.equal(canceled.cancelAtPeriodEnd, true);
  assert.equal(canceled.periodEnd, initial.periodEnd);
  assert.equal(canceled.credits.remaining, 500);
  const job = await reserveMonthly(user);
  await finishJob(
    job.id,
    false,
    undefined,
    "Confirmed failure during paid access",
  );
  assert.equal((await getSubscription(user))!.credits.remaining, 500);
  await resumeSubscription(user, initial.id);
  await resumeSubscription(user, initial.id);
  assert.equal((await getSubscription(user))!.cancelAtPeriodEnd, false);
  assert.equal((await getSubscription(user))!.periodEnd, initial.periodEnd);
  await Promise.all([
    cancelSubscription(user, initial.id),
    cancelSubscription(user, initial.id),
  ]);
  assert.equal((await getSubscription(user))!.cancelAtPeriodEnd, true);
  const transitions = (
    await pool.query(
      "SELECT kind,count(*)::int AS count FROM subscription_events WHERE subscription_id=$1 AND kind IN ('cancel_scheduled','resumed') GROUP BY kind",
      [initial.id],
    )
  ).rows;
  assert.deepEqual(
    Object.fromEntries(transitions.map((event) => [event.kind, event.count])),
    { cancel_scheduled: 2, resumed: 1 },
  );
});

test("active monthly billing blocks account deletion even after cancellation is scheduled", async () => {
  const user = await customer();
  await assertSubscriptionDeletionAllowed(user);
  const subscription = await subscribe(user);
  await assert.rejects(assertSubscriptionDeletionAllowed(user));
  await cancelSubscription(user, subscription.id);
  await assert.rejects(assertSubscriptionDeletionAllowed(user));
});

test(
  "a simultaneous monthly failure release and cancellation both complete safely",
  { timeout: 10000 },
  async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const user = await customer(45);
      const subscription = await subscribe(user);
      const job = await reserveMonthly(user);
      await Promise.all([
        finishJob(job.id, false, undefined, "Confirmed concurrent failure"),
        cancelSubscription(user, subscription.id),
      ]);
      const result = await getSubscription(user);
      assert.ok(result);
      assert.equal(result.cancelAtPeriodEnd, true);
      assert.deepEqual(result.credits, {
        total: 500,
        remaining: 500,
        reserved: 0,
        spent: 0,
      });
      assert.equal(
        (await pool.query("SELECT state FROM jobs WHERE id=$1", [job.id]))
          .rows[0].state,
        "failed",
      );
      assert.deepEqual(await wallet(user), { balance: 45, reserved: 0 });
    }
  },
);

test("an expired past-due subscription can be canceled before account deletion", async () => {
  const user = await customer();
  const subscription = await subscribe(user);
  await expirePeriod(subscription.id);
  await simulateSubscriptionRenewal(user, subscription.id, "failed");
  assert.equal((await getSubscription(user))!.status, "past_due");
  await assert.rejects(assertSubscriptionDeletionAllowed(user));
  await cancelSubscription(user, subscription.id);
  const canceled = await getSubscription(user);
  assert.ok(canceled);
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.cancelAtPeriodEnd, true);
  assert.equal(canceled.credits.remaining, 0);
  await assertSubscriptionDeletionAllowed(user);
  await assert.rejects(quote(user, imageInput()));
  assert.equal((await periods(subscription.id)).length, 1);
});

test("unpaid accounts cannot spend monthly credits or silently debit a legacy wallet", async () => {
  const user = await customer(1000);
  await assert.rejects(quote(user, imageInput()));
  assert.deepEqual(await wallet(user), { balance: 1000, reserved: 0 });
});

test("deleted accounts cannot start or pay a monthly subscription", async () => {
  const user = await customer();
  const checkout = await createSubscriptionCheckout(user, "starter");
  await pool.query("UPDATE users SET deleted_at=now() WHERE id=$1", [user]);
  await assert.rejects(createSubscriptionCheckout(user, "starter"));
  await assert.rejects(simulateSubscriptionPayment(user, checkout.id, "paid"));
  assert.equal(await getSubscription(user), null);
});

test("concurrent monthly submissions cannot overdraw the remaining period allowance", async () => {
  const user = await customer(400);
  const subscription = await subscribe(user);
  await pool.query(
    "UPDATE subscription_periods SET available=12,spent=488 WHERE subscription_id=$1",
    [subscription.id],
  );
  const inputs = [imageInput(), imageInput(), imageInput()];
  const accepted = await Promise.all(inputs.map((input) => quote(user, input)));
  const results = await Promise.allSettled(
    inputs.map((input, i) =>
      reserveJob(user, { ...input, quoteId: accepted[i].id }),
    ),
  );
  const admitted = results.filter(
    (
      result,
    ): result is PromiseFulfilledResult<
      Awaited<ReturnType<typeof reserveJob>>
    > => result.status === "fulfilled",
  );
  assert.equal(admitted.length, 1);
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    2,
  );
  assert.deepEqual((await getSubscription(user))!.credits, {
    total: 500,
    remaining: 0,
    reserved: 12,
    spent: 488,
  });
  await finishJob(admitted[0].value.id, false);
  await finishJob(admitted[0].value.id, false);
  assert.deepEqual((await getSubscription(user))!.credits, {
    total: 500,
    remaining: 12,
    reserved: 0,
    spent: 488,
  });
  assert.deepEqual(await wallet(user), { balance: 400, reserved: 0 });
});

test("expired periods grant nothing automatically and invalidate outstanding quotes", async () => {
  const user = await customer(300);
  const subscription = await subscribe(user);
  const input = imageInput();
  const accepted = await quote(user, input);
  const period = (await periods(subscription.id))[0];
  assert.equal(
    (
      await pool.query(
        "SELECT subscription_period_id FROM quotes WHERE id=$1",
        [accepted.id],
      )
    ).rows[0].subscription_period_id,
    period.id,
  );
  await expirePeriod(subscription.id);
  await getSubscription(user);
  await getSubscription(user);
  await assert.rejects(quote(user, imageInput()));
  await assert.rejects(reserveJob(user, { ...input, quoteId: accepted.id }));
  assert.equal((await periods(subscription.id)).length, 1);
  assert.deepEqual(await wallet(user), { balance: 300, reserved: 0 });
});

test("a failed monthly renewal adds no allowance and paid renewal grants only once", async () => {
  const user = await customer();
  const subscription = await subscribe(user);
  await expirePeriod(subscription.id);
  await simulateSubscriptionRenewal(user, subscription.id, "failed");
  assert.equal((await periods(subscription.id)).length, 1);
  await assert.rejects(quote(user, imageInput()));
  const result = await Promise.allSettled([
    simulateSubscriptionRenewal(user, subscription.id, "paid"),
    simulateSubscriptionRenewal(user, subscription.id, "paid"),
  ]);
  assert.ok(result.some((item) => item.status === "fulfilled"));
  assert.equal((await periods(subscription.id)).length, 2);
  assert.deepEqual((await getSubscription(user))!.credits, {
    total: 500,
    remaining: 500,
    reserved: 0,
    spent: 0,
  });
  assert.deepEqual(await wallet(user), { balance: 0, reserved: 0 });
});

test("an old quote cannot consume a new paid billing period", async () => {
  const user = await customer();
  const subscription = await subscribe(user);
  const input = imageInput();
  const accepted = await quote(user, input);
  await expirePeriod(subscription.id);
  await simulateSubscriptionRenewal(user, subscription.id, "paid");
  await assert.rejects(reserveJob(user, { ...input, quoteId: accepted.id }));
  assert.equal((await getSubscription(user))!.credits.remaining, 500);
  assert.equal((await getSubscription(user))!.credits.reserved, 0);
  const fresh = await reserveMonthly(user);
  const storedQuote = (
    await pool.query("SELECT subscription_period_id FROM quotes WHERE id=$1", [
      accepted.id,
    ])
  ).rows[0];
  assert.notEqual(
    fresh.subscription_period_id,
    storedQuote.subscription_period_id,
  );
  await finishJob(fresh.id, false);
});

test("late failures restore the original period without increasing the next month's allowance", async () => {
  const user = await customer(60);
  const subscription = await subscribe(user);
  const job = await reserveMonthly(user);
  await expirePeriod(subscription.id);
  await simulateSubscriptionRenewal(user, subscription.id, "paid");
  await Promise.all([
    finishJob(job.id, false, undefined, "Confirmed late provider failure"),
    finishJob(job.id, false, undefined, "Repeated failure event"),
  ]);
  const stored = await periods(subscription.id);
  assert.equal(stored.length, 2);
  const original = stored.find(
    (period) => period.id === job.subscription_period_id,
  )!;
  assert.equal(original.available, 500);
  assert.equal(original.reserved, 0);
  assert.equal(original.spent, 0);
  assert.deepEqual((await getSubscription(user))!.credits, {
    total: 500,
    remaining: 500,
    reserved: 0,
    spent: 0,
  });
  assert.deepEqual(await wallet(user), { balance: 60, reserved: 0 });
});

test("canceled subscriptions stop at the paid-through date and cannot renew or resume after expiry", async () => {
  const user = await customer(90);
  const subscription = await subscribe(user);
  await cancelSubscription(user, subscription.id);
  await expirePeriod(subscription.id);
  await assert.rejects(
    simulateSubscriptionRenewal(user, subscription.id, "paid"),
  );
  await assert.rejects(resumeSubscription(user, subscription.id));
  await assert.rejects(quote(user, imageInput()));
  assert.equal((await periods(subscription.id)).length, 1);
  await assertSubscriptionDeletionAllowed(user);
  assert.deepEqual(await wallet(user), { balance: 90, reserved: 0 });
});

test("an unexpired monthly plan cannot be charged for another simulated renewal", async () => {
  const user = await customer();
  const subscription = await subscribe(user);
  await simulateSubscriptionRenewal(user, subscription.id, "paid");
  await simulateSubscriptionRenewal(user, subscription.id, "failed");
  assert.equal((await periods(subscription.id)).length, 1);
  assert.equal((await getSubscription(user))!.status, "active");
  assert.equal((await getSubscription(user))!.credits.remaining, 500);
});

test("an expired checkout cannot grant monthly access", async () => {
  const user = await customer();
  const checkout = await createSubscriptionCheckout(user, "starter");
  await pool.query(
    "UPDATE subscription_checkouts SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [checkout.id],
  );
  await assert.rejects(simulateSubscriptionPayment(user, checkout.id, "paid"));
  assert.equal(await getSubscription(user), null);
  const replacement = await createSubscriptionCheckout(user, "starter");
  assert.notEqual(replacement.id, checkout.id);
  await simulateSubscriptionPayment(user, replacement.id, "paid");
  assert.equal((await getSubscription(user))!.credits.remaining, 500);
});

test("a pending checkout with an outdated price snapshot is replaced before payment", async () => {
  const user = await customer();
  const initial = await createSubscriptionCheckout(user, "starter");
  await pool.query("UPDATE subscription_checkouts SET cents=499 WHERE id=$1", [
    initial.id,
  ]);
  const replacement = await createSubscriptionCheckout(user, "starter");
  assert.notEqual(replacement.id, initial.id);
  assert.equal(replacement.package.cents, 500);
  const snapshots = (
    await pool.query(
      "SELECT id,cents,status FROM subscription_checkouts WHERE user_id=$1",
      [user],
    )
  ).rows;
  assert.equal(
    snapshots.find((checkout) => checkout.id === initial.id)!.status,
    "canceled",
  );
  assert.equal(
    snapshots.find((checkout) => checkout.id === replacement.id)!.cents,
    500,
  );
  await simulateSubscriptionPayment(user, initial.id, "paid");
  assert.equal(await getSubscription(user), null);
  await simulateSubscriptionPayment(user, replacement.id, "paid");
  assert.equal((await getSubscription(user))!.credits.remaining, 500);
});

test("a new paid checkout can restart an expired canceled subscription without restoring old allowance", async () => {
  const user = await customer(85);
  const initial = await subscribe(user, "starter");
  const job = await reserveMonthly(user);
  await succeed(job.id);
  await cancelSubscription(user, initial.id);
  await expirePeriod(initial.id);
  const checkout = await createSubscriptionCheckout(user, "creator");
  assert.equal((await getSubscription(user))!.credits.remaining, 0);
  await simulateSubscriptionPayment(user, checkout.id, "paid");
  const resumed = await getSubscription(user);
  assert.ok(resumed);
  assert.equal(resumed.planId, "creator");
  assert.equal(resumed.cancelAtPeriodEnd, false);
  assert.equal(resumed.status, "active");
  assert.deepEqual(resumed.credits, {
    total: 1000,
    remaining: 1000,
    reserved: 0,
    spent: 0,
  });
  const stored = await periods(resumed.id);
  assert.equal(stored.length, 2);
  assert.equal(
    stored.find((period) => period.id === job.subscription_period_id)!.spent,
    12,
  );
  assert.deepEqual(await wallet(user), { balance: 85, reserved: 0 });
});

after(async () => {
  // scripts/test.ts drops this entire isolated test schema after the process.
  await pool.end();
});
