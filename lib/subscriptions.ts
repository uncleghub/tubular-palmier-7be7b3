import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { demo, packages } from "./config";
import { pool, transaction } from "./db";

type Connection = Pool | PoolClient;
type Outcome = "paid" | "failed" | "canceled";
const outcomeSchema = z.enum(["paid", "failed", "canceled"]);
// This is an explicit local demonstration, never proof of a real bank/card payment.
const localProofSchema = z
  .object({
    source: z.literal("local_demo"),
    mode: z.literal("test"),
    reference: z.string().min(1),
    outcome: outcomeSchema,
    cents: z.number().int().positive(),
    currency: z.literal("USD"),
  })
  .strict();

export type SubscriptionState = {
  id: string;
  planId: string;
  planName: string;
  status: "active" | "past_due" | "canceled" | "expired";
  cancelAtPeriodEnd: boolean;
  periodStart: string;
  periodEnd: string;
  credits: {
    total: number;
    remaining: number;
    reserved: number;
    spent: number;
  };
  mode: "test";
};

function requireDemo() {
  if (!demo) throw new Error("Subscription checkout is not open yet.");
}
async function lockUser(db: PoolClient, user: string) {
  const active = await db.query(
    "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
    [user],
  );
  if (!active.rowCount) throw new Error("Sign in to continue.");
}
function planFor(id: string) {
  const plan = packages.find((p) => p.id === id);
  if (!plan) throw new Error("Choose a valid monthly plan.");
  return plan;
}
async function state(
  db: Connection,
  user: string,
): Promise<SubscriptionState | null> {
  const result = await db.query(
    `SELECT s.*,p.period_start,p.period_end,p.total,p.available,p.reserved,p.spent,
       p.period_start<=now() AND p.period_end>now() AS in_period
     FROM subscriptions s JOIN users u ON u.id=s.user_id
     JOIN subscription_periods p ON p.id=s.current_period_id AND p.user_id=s.user_id
     WHERE s.user_id=$1 AND u.deleted_at IS NULL`,
    [user],
  );
  const row = result.rows[0];
  if (!row) return null;
  const live = row.in_period && ["active", "past_due"].includes(row.status);
  const status = live
    ? row.status
    : row.cancel_at_period_end || row.status === "canceled"
      ? "canceled"
      : row.status === "past_due"
        ? "past_due"
        : "expired";
  return {
    id: row.id,
    planId: row.plan_id,
    planName: packages.find((p) => p.id === row.plan_id)?.name || row.plan_id,
    status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    periodStart: row.period_start.toISOString(),
    periodEnd: row.period_end.toISOString(),
    credits: {
      total: row.total,
      remaining: live ? row.available : 0,
      reserved: row.reserved,
      spent: row.spent,
    },
    mode: "test",
  };
}
export async function getSubscription(user: string) {
  return state(pool, user);
}
async function ownSubscription(db: PoolClient, user: string, id: string) {
  const result = await db.query(
    "SELECT * FROM subscriptions WHERE id=$1 AND user_id=$2 AND mode='test' FOR UPDATE",
    [id, user],
  );
  if (!result.rowCount) throw new Error("Subscription not found.");
  return result.rows[0];
}
async function currentPeriod(
  db: PoolClient,
  subscription: { current_period_id: string },
) {
  const result = await db.query(
    "SELECT *,period_end>now() AS not_ended FROM subscription_periods WHERE id=$1 FOR UPDATE",
    [subscription.current_period_id],
  );
  if (!result.rowCount)
    throw new Error("Subscription billing period is unavailable.");
  return result.rows[0];
}
async function recordOutcome(
  db: PoolClient,
  user: string,
  sub: string | null,
  period: string | null,
  reference: string,
  outcome: Outcome,
  cents: number,
) {
  const proof = localProofSchema.parse({
    source: "local_demo",
    mode: "test",
    reference,
    outcome,
    cents,
    currency: "USD",
  });
  await db.query(
    "INSERT INTO subscription_events(id,user_id,subscription_id,period_id,kind,reference,proof) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(reference) DO NOTHING",
    [randomUUID(), user, sub, period, outcome, reference, proof],
  );
}
async function grantPeriod(
  db: PoolClient,
  user: string,
  sub: string,
  planId: string,
  cents: number,
  credits: number,
  reference: string,
) {
  const id = randomUUID();
  const result = await db.query(
    `INSERT INTO subscription_periods(id,subscription_id,user_id,plan_id,cents,total,available,period_start,period_end,payment_reference)
     VALUES($1,$2,$3,$4,$5,$6,$6,now(),now()+interval '1 month',$7)
     ON CONFLICT(payment_reference) DO NOTHING RETURNING id`,
    [id, sub, user, planId, cents, credits, reference],
  );
  const periodId =
    result.rows[0]?.id ||
    (
      await db.query(
        "SELECT id FROM subscription_periods WHERE payment_reference=$1 AND subscription_id=$2",
        [reference, sub],
      )
    ).rows[0]?.id;
  if (!periodId)
    throw new Error("Subscription payment could not be reconciled.");
  await db.query(
    "UPDATE subscriptions SET plan_id=$2,status='active',cancel_at_period_end=false,current_period_id=$3,updated_at=now() WHERE id=$1",
    [sub, planId, periodId],
  );
  await recordOutcome(db, user, sub, periodId, reference, "paid", cents);
  return periodId;
}

export async function createSubscriptionCheckout(user: string, planId: string) {
  requireDemo();
  const plan = planFor(planId);
  return transaction(async (db) => {
    await lockUser(db, user);
    const existing = await state(db, user);
    if (existing && new Date(existing.periodEnd).getTime() > Date.now())
      throw new Error(
        "Subscription already has a paid billing period. Manage your current plan in Settings.",
      );
    await db.query(
      "UPDATE subscription_checkouts SET status='canceled' WHERE user_id=$1 AND status='pending' AND (expires_at<=now() OR plan_id<>$2 OR cents<>$3 OR credits<>$4)",
      [user, planId, plan.cents, plan.credits],
    );
    const pending = await db.query(
      "SELECT id FROM subscription_checkouts WHERE user_id=$1 AND status='pending' AND expires_at>now()",
      [user],
    );
    if (pending.rowCount)
      return { id: pending.rows[0].id as string, package: plan };
    const id = randomUUID();
    await db.query(
      "INSERT INTO subscription_checkouts(id,user_id,plan_id,cents,credits) VALUES($1,$2,$3,$4,$5)",
      [id, user, plan.id, plan.cents, plan.credits],
    );
    return { id, package: plan };
  });
}

export async function simulateSubscriptionPayment(
  user: string,
  checkoutId: string,
  outcome: Outcome,
) {
  requireDemo();
  outcomeSchema.parse(outcome);
  return transaction(async (db) => {
    await lockUser(db, user);
    const result = await db.query(
      "SELECT *,expires_at>now() AS valid FROM subscription_checkouts WHERE id=$1 AND user_id=$2 AND mode='test' FOR UPDATE",
      [checkoutId, user],
    );
    const checkout = result.rows[0];
    if (!checkout) throw new Error("Subscription checkout not found.");
    if (checkout.status !== "pending") return state(db, user);
    if (!checkout.valid)
      throw new Error("Subscription checkout expired. Choose your plan again.");
    if (outcome !== "paid") {
      await db.query(
        "UPDATE subscription_checkouts SET status=$2 WHERE id=$1",
        [checkoutId, outcome],
      );
      await recordOutcome(
        db,
        user,
        null,
        null,
        `test:checkout:${checkoutId}:${outcome}`,
        outcome,
        checkout.cents,
      );
      return state(db, user);
    }
    const existing = await state(db, user);
    if (existing && new Date(existing.periodEnd).getTime() > Date.now())
      throw new Error("Subscription already has a paid billing period.");
    const created = await db.query(
      "INSERT INTO subscriptions(id,user_id,plan_id,status) VALUES($1,$2,$3,'active') ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id",
      [randomUUID(), user, checkout.plan_id],
    );
    const subId = created.rows[0].id;
    const periodId = await grantPeriod(
      db,
      user,
      subId,
      checkout.plan_id,
      checkout.cents,
      checkout.credits,
      `test:checkout:${checkoutId}:paid`,
    );
    await db.query(
      "UPDATE subscription_checkouts SET status='paid',subscription_id=$2,period_id=$3 WHERE id=$1",
      [checkoutId, subId, periodId],
    );
    return state(db, user);
  });
}

export async function cancelSubscription(user: string, id: string) {
  requireDemo();
  return transaction(async (db) => {
    await lockUser(db, user);
    const sub = await ownSubscription(db, user, id);
    const period = await currentPeriod(db, sub);
    if (sub.cancel_at_period_end) return state(db, user);
    await db.query(
      "UPDATE subscriptions SET cancel_at_period_end=true,status=CASE WHEN $2 THEN status ELSE 'canceled' END,updated_at=now() WHERE id=$1",
      [id, period.not_ended],
    );
    await db.query(
      "INSERT INTO subscription_events(id,user_id,subscription_id,period_id,kind,reference) VALUES($1,$2,$3,$4,'cancel_scheduled',$5) ON CONFLICT(reference) DO NOTHING",
      [randomUUID(), user, id, period.id, `test:cancel:${id}:${randomUUID()}`],
    );
    return state(db, user);
  });
}
export async function resumeSubscription(user: string, id: string) {
  requireDemo();
  return transaction(async (db) => {
    await lockUser(db, user);
    const sub = await ownSubscription(db, user, id);
    const period = await currentPeriod(db, sub);
    if (!period.not_ended || sub.status !== "active")
      throw new Error(
        "Subscription has ended. Choose a monthly plan to start again.",
      );
    if (!sub.cancel_at_period_end) return state(db, user);
    await db.query(
      "UPDATE subscriptions SET cancel_at_period_end=false,updated_at=now() WHERE id=$1",
      [id],
    );
    await db.query(
      "INSERT INTO subscription_events(id,user_id,subscription_id,period_id,kind,reference) VALUES($1,$2,$3,$4,'resumed',$5) ON CONFLICT(reference) DO NOTHING",
      [randomUUID(), user, id, period.id, `test:resume:${id}:${randomUUID()}`],
    );
    return state(db, user);
  });
}
export async function simulateSubscriptionRenewal(
  user: string,
  id: string,
  outcome: Outcome,
) {
  requireDemo();
  outcomeSchema.parse(outcome);
  return transaction(async (db) => {
    await lockUser(db, user);
    const sub = await ownSubscription(db, user, id);
    const period = await currentPeriod(db, sub);
    if (sub.cancel_at_period_end || sub.status === "canceled")
      throw new Error(
        "Subscription renewal is canceled. Choose a monthly plan to start again.",
      );
    // Re-delivery before the new period expires is harmless and cannot grant twice.
    if (period.not_ended) return state(db, user);
    const reference = `test:renewal:${id}:${period.id}:${outcome}`;
    if (outcome === "paid") {
      await grantPeriod(
        db,
        user,
        id,
        period.plan_id,
        period.cents,
        period.total,
        reference,
      );
    } else {
      await db.query(
        "UPDATE subscriptions SET status=$2,cancel_at_period_end=$3,updated_at=now() WHERE id=$1",
        [
          id,
          outcome === "failed" ? "past_due" : "canceled",
          outcome === "canceled",
        ],
      );
      await recordOutcome(
        db,
        user,
        id,
        period.id,
        reference,
        outcome,
        period.cents,
      );
    }
    return state(db, user);
  });
}

export async function assertSubscriptionDeletionAllowed(
  user: string,
  db: Connection = pool,
) {
  const result = await db.query(
    `SELECT 1 FROM subscription_checkouts WHERE user_id=$1 AND status='pending' AND expires_at>now()
     UNION ALL SELECT 1 FROM subscriptions s JOIN subscription_periods p ON p.id=s.current_period_id
     WHERE s.user_id=$1 AND (p.period_end>now() OR (NOT s.cancel_at_period_end AND s.status IN ('active','past_due')))
     UNION ALL SELECT 1 FROM subscription_periods WHERE user_id=$1 AND reserved>0 LIMIT 1`,
    [user],
  );
  if (result.rowCount)
    throw new Error(
      "Subscription must be canceled and its paid period ended before deleting your account. Close any pending checkout first.",
    );
}

export async function checkSubscriptionAllowance(
  user: string,
  credits: number,
) {
  requireDemo();
  const result = await pool.query(
    `SELECT p.id FROM subscriptions s JOIN subscription_periods p ON p.id=s.current_period_id AND p.user_id=s.user_id
     JOIN users u ON u.id=s.user_id WHERE s.user_id=$1 AND u.deleted_at IS NULL
     AND s.status IN ('active','past_due') AND p.period_start<=now() AND p.period_end>now() AND p.available>=$2`,
    [user, credits],
  );
  if (!result.rowCount)
    throw new Error(
      "Subscription monthly allowance is unavailable or insufficient. Choose an active monthly plan or use another funding option.",
    );
  return result.rows[0].id as string;
}
export async function reserveSubscriptionAllowance(
  db: PoolClient,
  user: string,
  period: string | null,
  credits: number,
) {
  requireDemo();
  const result = await db.query(
    `UPDATE subscription_periods p SET available=available-$3,reserved=reserved+$3
     FROM subscriptions s WHERE p.id=$2 AND p.user_id=$1 AND s.id=p.subscription_id AND s.user_id=$1
     AND s.current_period_id=p.id AND s.status IN ('active','past_due')
     AND p.period_start<=now() AND p.period_end>now() AND p.available>=$3 RETURNING p.id`,
    [user, period, credits],
  );
  if (!result.rowCount)
    throw new Error(
      "Subscription billing period changed, expired or has insufficient credits. Get a new quote.",
    );
}
export async function recordSubscriptionReservation(
  db: PoolClient,
  user: string,
  job: string,
  period: string,
  credits: number,
) {
  await db.query(
    "INSERT INTO subscription_events(id,user_id,subscription_id,period_id,job_id,kind,reference,amount) SELECT $1,$2,subscription_id,id,$3,'reservation',$4,$5 FROM subscription_periods WHERE id=$6 AND user_id=$2",
    [randomUUID(), user, job, `subscription:reserve:${job}`, -credits, period],
  );
}
export async function settleSubscriptionAllowance(
  db: PoolClient,
  job: {
    id: string;
    user_id: string;
    subscription_period_id: string;
    credits: number;
  },
  success: boolean,
) {
  // Match cancellation/renewal/deletion lock order before touching a period.
  // The job lock is already held; other subscription mutations never lock jobs.
  await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [job.user_id]);
  const result = await db.query(
    "UPDATE subscription_periods SET reserved=reserved-$3,available=available+$4,spent=spent+$5 WHERE id=$1 AND user_id=$2 AND reserved>=$3 RETURNING subscription_id",
    [
      job.subscription_period_id,
      job.user_id,
      job.credits,
      success ? 0 : job.credits,
      success ? job.credits : 0,
    ],
  );
  if (!result.rowCount)
    throw new Error("Subscription reservation could not be reconciled.");
  await db.query(
    "INSERT INTO subscription_events(id,user_id,subscription_id,period_id,job_id,kind,reference,amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      randomUUID(),
      job.user_id,
      result.rows[0].subscription_id,
      job.subscription_period_id,
      job.id,
      success ? "spend" : "release",
      `subscription:finish:${job.id}`,
      success ? -job.credits : job.credits,
    ],
  );
}
