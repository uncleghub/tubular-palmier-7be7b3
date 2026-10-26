import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db";
import { validateModel, GenerationInput } from "./catalog";
import { demo } from "./config";
export async function quote(user: string, input: GenerationInput) {
  const m = validateModel(input, demo);
  if (input.referenceId) {
    const r = await pool.query(
      "SELECT id FROM uploads WHERE id=$1 AND user_id=$2",
      [input.referenceId, user],
    );
    if (!r.rowCount) throw new Error("Reference image not found.");
  }
  const id = randomUUID();
  const clean = { ...input };
  delete clean.quoteId;
  await pool.query(
    "INSERT INTO quotes(id,user_id,input,credits,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
    [id, user, clean, m.credits],
  );
  return { id, credits: m.credits, expiresIn: 300 };
}
export async function reserveJob(user: string, input: GenerationInput) {
  const m = validateModel(input, demo);
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [user],
    );
    const old = await c.query(
      "SELECT * FROM jobs WHERE user_id=$1 AND request_id=$2",
      [user, input.requestId],
    );
    if (old.rowCount) return old.rows[0];
    const flags = await c.query(
      "SELECT key,value FROM settings WHERE key IN ('generation_disabled',$1)",
      ["disabled:" + m.id],
    );
    if (flags.rows.some((r) => r.value === true))
      throw new Error("Generation is temporarily paused.");
    // Serialize the global cap check across all users as well as per-wallet reservations.
    await c.query("SELECT pg_advisory_xact_lock(812403)");
    const usage = await c.query(
      "SELECT COALESCE(sum(credits),0)::int AS credits,COALESCE(sum(provider_cost_micros),0)::bigint AS provider_micros,count(*) FILTER(WHERE user_id=$1)::int AS personal,count(*) FILTER(WHERE model_id=$2)::int AS model FROM jobs WHERE created_at>date_trunc('day',now())",
      [user, m.id],
    );
    const u = usage.rows[0];
    const q = await c.query(
      "SELECT * FROM quotes WHERE id=$1 AND user_id=$2 AND expires_at>now() AND consumed=false FOR UPDATE",
      [input.quoteId, user],
    );
    const clean = { ...input };
    delete clean.quoteId;
    if (
      !q.rowCount ||
      JSON.stringify(q.rows[0].input, Object.keys(q.rows[0].input).sort()) !==
        JSON.stringify(clean, Object.keys(clean).sort())
    )
      throw new Error(
        "Your quote expired or settings changed. Get a new quote.",
      );
    const credits = q.rows[0].credits;
    if (
      Number(u.provider_micros) + m.providerCostMicros! >
        Number(process.env.GLOBAL_DAILY_PROVIDER_MICROS || 10000000) ||
      u.credits + credits >
        Number(process.env.GLOBAL_DAILY_CREDIT_LIMIT || 100000) ||
      u.personal >= Number(process.env.USER_DAILY_JOB_LIMIT || 50) ||
      u.model >= Number(process.env.MODEL_DAILY_JOB_LIMIT || 500)
    )
      throw new Error("Daily generation limit reached.");
    const wallet = await c.query(
      "UPDATE users SET balance=balance-$2,reserved=reserved+$2 WHERE id=$1 AND balance >= $2 AND deleted_at IS NULL RETURNING id",
      [user, credits],
    );
    if (!wallet.rowCount)
      throw new Error(
        "Insufficient credits. Choose a credit package to continue.",
      );
    const id = randomUUID();
    await c.query("UPDATE quotes SET consumed=true WHERE id=$1", [
      input.quoteId,
    ]);
    await c.query(
      "INSERT INTO ledger(id,user_id,kind,amount,reference,reason) VALUES($1,$2,'reservation',$3,$4,'Generation quote accepted')",
      [randomUUID(), user, -credits, "reserve:" + id],
    );
    const job = await c.query(
      "INSERT INTO jobs(id,user_id,request_id,model_id,input,credits,provider_cost_micros,state) VALUES($1,$2,$3,$4,$5,$6,$7,'queued') RETURNING *",
      [id, user, input.requestId, m.id, input, credits, m.providerCostMicros],
    );
    return job.rows[0];
  });
}
export async function finishJob(
  id: string,
  success: boolean,
  output?: { key: string; width: number; height: number; duration?: number },
  error?: string,
) {
  return transaction(async (c) => {
    const r = await c.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [id]);
    const j = r.rows[0];
    if (!j || ["succeeded", "failed"].includes(j.state)) return;
    await c.query(
      "UPDATE users SET reserved=reserved-$2,balance=balance+$3 WHERE id=$1",
      [j.user_id, j.credits, success ? 0 : j.credits],
    );
    await c.query(
      "INSERT INTO ledger(id,user_id,kind,amount,reference,reason) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        j.user_id,
        success ? "spend" : "release",
        success ? -j.credits : j.credits,
        "finish:" + id,
        success
          ? "Generation completed"
          : "Confirmed failure; reservation released",
      ],
    );
    await c.query(
      "UPDATE jobs SET state=$2,output_key=$3,width=$4,height=$5,duration=$6,error=$7,updated_at=now() WHERE id=$1",
      [
        id,
        success ? "succeeded" : "failed",
        output?.key,
        output?.width,
        output?.height,
        output?.duration,
        error,
      ],
    );
  });
}
export async function fulfillPurchase(
  eventId: string,
  purchaseId: string,
  kind: "paid" | "refund" | "dispute",
  cents: number,
) {
  return transaction(async (c) => {
    const r = await c.query("SELECT * FROM purchases WHERE id=$1 FOR UPDATE", [
      purchaseId,
    ]);
    const p = r.rows[0];
    if (!p || p.cents !== cents)
      throw new Error("Payment does not match purchase.");
    const event = await c.query(
      "INSERT INTO payment_events(id,purchase_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
      [eventId, purchaseId, kind],
    );
    if (!event.rowCount) return;
    if (kind === "paid") {
      if (
        ["paid", "refunded", "disputed", "review_required"].includes(p.status)
      )
        return;
      if (["refund_pending", "dispute_pending"].includes(p.status)) {
        await c.query(
          "INSERT INTO ledger VALUES($1,$2,'purchase',$3,$4,'Verified payment received after reversal',now())",
          [randomUUID(), p.user_id, p.credits, "purchase:" + p.id],
        );
        await c.query(
          "INSERT INTO ledger VALUES($1,$2,'refund',$3,$4,'Earlier verified reversal applied',now())",
          [randomUUID(), p.user_id, -p.credits, "refund:" + p.id],
        );
        await c.query("UPDATE purchases SET status=$2 WHERE id=$1", [
          p.id,
          p.status === "refund_pending" ? "refunded" : "disputed",
        ]);
        return;
      }
      await c.query("UPDATE users SET balance=balance+$2 WHERE id=$1", [
        p.user_id,
        p.credits,
      ]);
      await c.query("UPDATE purchases SET status='paid' WHERE id=$1", [p.id]);
      await c.query(
        "INSERT INTO ledger VALUES($1,$2,'purchase',$3,$4,'Verified test payment',now())",
        [randomUUID(), p.user_id, p.credits, "purchase:" + p.id],
      );
    } else {
      if (["pending", "failed", "canceled"].includes(p.status)) {
        await c.query("UPDATE purchases SET status=$2 WHERE id=$1", [
          p.id,
          kind === "refund" ? "refund_pending" : "dispute_pending",
        ]);
        return;
      }
      if (p.status !== "paid") return;
      const w = await c.query(
        "UPDATE users SET balance=balance-$2 WHERE id=$1 AND balance >= $2 RETURNING id",
        [p.user_id, p.credits],
      );
      if (!w.rowCount) {
        await c.query(
          "UPDATE purchases SET status='review_required' WHERE id=$1",
          [p.id],
        );
        await c.query("INSERT INTO audit VALUES($1,$2,$3,$4,now())", [
          randomUUID(),
          "payment-system",
          "refund_review",
          { purchase: p.id, kind },
        ]);
        return;
      }
      await c.query("UPDATE purchases SET status=$2 WHERE id=$1", [
        p.id,
        kind === "refund" ? "refunded" : "disputed",
      ]);
      await c.query(
        "INSERT INTO ledger VALUES($1,$2,'refund',$3,$4,'Credits reversed after refund or dispute',now())",
        [randomUUID(), p.user_id, -p.credits, "refund:" + p.id],
      );
    }
  });
}
