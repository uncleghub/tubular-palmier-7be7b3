import { boundedRequest } from "@/lib/http";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, randomBytes } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { userId, demoSignIn, sameOrigin, rateLimit, adminId } from "@/lib/auth";
import { pool, transaction } from "@/lib/db";
import { getFreePreview } from "@/lib/free-preview";
import { demo } from "@/lib/config";
import { inputSchema, models } from "@/lib/catalog";
import { quote, reserveJob, finishJob } from "@/lib/wallet";
import { store, download, remove } from "@/lib/storage";
import { paddleWebhook } from "@/lib/paddle-sandbox";
import {
  getSubscription,
  createSubscriptionCheckout,
  simulateSubscriptionPayment,
  cancelSubscription,
  resumeSubscription,
  simulateSubscriptionRenewal,
  assertSubscriptionDeletionAllowed,
} from "@/lib/subscriptions";
import sharp from "sharp";
import { signPayment, receivePayment } from "@/lib/payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: Request, context: Context) {
  const { path } = await context.params;
  const route = path.join("/");
  try {
    if (req.method === "POST") {
      if (route !== "webhooks/paddle") sameOrigin(req);
      req = await boundedRequest(
        req,
        route === "uploads"
          ? 11 * 1024 * 1024
          : route === "webhooks/paddle"
            ? 1048576
            : 65536,
      );
    }
    if (route === "webhooks/paddle" && req.method === "POST") {
      try {
        if (Number(req.headers.get("content-length") || 0) > 1048576)
          return reply({ error: "Payload too large" }, 413);
        await paddleWebhook(
          await req.text(),
          req.headers.get("paddle-signature") || "",
        );
        return reply({ ok: true });
      } catch {
        return reply(
          { error: "Webhook verification failed; delivery may be retried." },
          400,
        );
      }
    }
    if (req.method === "POST") {
      sameOrigin(req);
    }
    if (route === "health") {
      await pool.query("SELECT 1");
      return reply({ ok: true, mode: demo ? "demo" : "production" });
    }
    if (route === "session" && req.method === "POST") {
      await rateLimit(
        "signin:" + (req.headers.get("x-forwarded-for") || "local"),
        10,
      );
      return reply({ id: await demoSignIn() });
    }
    if (route === "session" && req.method === "DELETE") {
      sameOrigin(req);
      (await cookies()).delete("studio_demo");
      return reply({ ok: true });
    }
    const user = await userId();
    await rateLimit("user:" + user, 120);
    if (route === "account" && req.method === "GET") {
      const w = await pool.query(
        "SELECT balance,reserved,created_at FROM users WHERE id=$1 AND deleted_at IS NULL",
        [user],
      );
      if (!w.rowCount) throw new Error("Sign in to continue.");
      const jobs = await pool.query(
        "SELECT id,model_id,input,credits,state,error,width,height,duration,created_at,funding_source FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user],
      );
      const purchases = await pool.query(
        "SELECT * FROM purchases WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user],
      );
      const ledger = await pool.query(
        "SELECT kind,amount,reason,created_at FROM ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user],
      );
      return reply({
        wallet: w.rows[0],
        jobs: jobs.rows,
        purchases: purchases.rows,
        ledger: ledger.rows,
        freePreview: await getFreePreview(user),
        subscription: await getSubscription(user),
        demo,
      });
    }
    if (route === "quote" && req.method === "POST")
      return reply(await quote(user, inputSchema.parse(await req.json())));
    if (route === "jobs" && req.method === "POST") {
      await rateLimit("generate:" + user, 10);
      return reply(
        await reserveJob(user, inputSchema.parse(await req.json())),
        202,
      );
    }
    if (route === "uploads" && req.method === "POST") {
      await rateLimit("upload:" + user, 10);
      if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
        throw new Error("Upload must be under 10 MB.");
      const data = await req.formData();
      const file = data.get("file");
      if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
        throw new Error("Upload must be under 10 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const t = await fileTypeFromBuffer(bytes);
      if (!t || !["image/png", "image/jpeg", "image/webp"].includes(t.mime))
        throw new Error("Upload a valid PNG, JPEG or WebP image.");
      const meta = await sharp(bytes, {
        limitInputPixels: 40000000,
      }).metadata();
      if (!meta.width || !meta.height || (meta.pages && meta.pages > 1))
        throw new Error("Upload a still image under 40 megapixels.");
      const id = randomUUID();
      const key = `references/${id}.${t.ext}`;
      await store(key, bytes, t.mime);
      await pool.query(
        "INSERT INTO uploads(id,user_id,object_key,mime) VALUES($1,$2,$3,$4)",
        [id, user, key, t.mime],
      );
      return reply({ id });
    }
    if (path[0] === "download" && req.method === "GET") {
      const id = z.uuid().parse(path[1]);
      const j = await pool.query(
        "SELECT output_key FROM jobs WHERE id=$1 AND user_id=$2 AND state='succeeded' AND created_at>now()-($3::int*interval '1 day')",
        [id, user, Number(process.env.MEDIA_RETENTION_DAYS || 30)],
      );
      if (!j.rowCount)
        throw new Error("Media not found or retention period ended.");
      const key = j.rows[0].output_key;
      const data = await download(key);
      if (data.url) return NextResponse.redirect(data.url);
      return new Response(new Uint8Array(data.bytes!), {
        headers: {
          "Content-Type": key.endsWith(".mp4") ? "video/mp4" : "image/svg+xml",
          "Content-Disposition": `attachment; filename="geez-${id}.${key.endsWith(".mp4") ? "mp4" : "svg"}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (route === "checkout" && req.method === "POST") {
      throw new Error(
        "One-time purchases are closed. Choose a monthly subscription.",
      );
    }
    if (route === "subscription/checkout" && req.method === "POST") {
      const { planId } = z
        .object({ planId: z.string() })
        .strict()
        .parse(await req.json());
      return reply(await createSubscriptionCheckout(user, planId));
    }
    if (route === "subscription/test-payment" && req.method === "POST") {
      const { checkoutId, outcome } = z
        .object({
          checkoutId: z.uuid(),
          outcome: z.enum(["paid", "failed", "canceled"]),
        })
        .strict()
        .parse(await req.json());
      await simulateSubscriptionPayment(user, checkoutId, outcome);
      return reply({ ok: true, mode: "simulated; no money charged" });
    }
    if (
      (route === "subscription/cancel" || route === "subscription/resume") &&
      req.method === "POST"
    ) {
      const { subscriptionId } = z
        .object({ subscriptionId: z.uuid() })
        .strict()
        .parse(await req.json());
      return reply(
        route === "subscription/cancel"
          ? await cancelSubscription(user, subscriptionId)
          : await resumeSubscription(user, subscriptionId),
      );
    }
    if (route === "subscription/test-renewal" && req.method === "POST") {
      const { subscriptionId, outcome } = z
        .object({
          subscriptionId: z.uuid(),
          outcome: z.enum(["paid", "failed"]),
        })
        .strict()
        .parse(await req.json());
      await simulateSubscriptionRenewal(user, subscriptionId, outcome);
      return reply({ ok: true, mode: "simulated; no money charged" });
    }
    if (route === "test-payment" && req.method === "POST") {
      if (!demo) throw new Error("Test checkout is disabled.");
      const { purchaseId, outcome } = z
        .object({
          purchaseId: z.uuid(),
          outcome: z.enum(["paid", "canceled", "failed"]),
        })
        .strict()
        .parse(await req.json());
      const r = await pool.query(
        "SELECT * FROM purchases WHERE id=$1 AND user_id=$2 AND mode='test'",
        [purchaseId, user],
      );
      if (!r.rowCount) throw new Error("Purchase not found.");
      if (outcome === "paid") {
        const body = JSON.stringify({
          eventId: "test:" + purchaseId,
          purchaseId,
          kind: "paid",
          cents: r.rows[0].cents,
          currency: "USD",
          timestamp: Math.floor(Date.now() / 1000),
        });
        const secret = randomBytes(32).toString("hex");
        await receivePayment(body, signPayment(body, secret), secret);
      } else {
        await pool.query(
          "UPDATE purchases SET status=$2 WHERE id=$1 AND status='pending'",
          [purchaseId, outcome],
        );
      }
      return reply({ ok: true, mode: "simulated; no money charged" });
    }
    if (route === "account/delete" && req.method === "POST") {
      await transaction(async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
        await assertSubscriptionDeletionAllowed(user, c);
        const active = await c.query(
          "SELECT id FROM jobs WHERE user_id=$1 AND state IN ('queued','running','uncertain')",
          [user],
        );
        if (active.rowCount)
          throw new Error(
            "Wait for active jobs to finish or contact support before deleting.",
          );
        const files = await c.query(
          "SELECT object_key AS key FROM uploads WHERE user_id=$1 UNION ALL SELECT output_key AS key FROM jobs WHERE user_id=$1 AND output_key IS NOT NULL",
          [user],
        );
        for (const f of files.rows) await remove(f.key);
        await c.query("DELETE FROM uploads WHERE user_id=$1", [user]);
        await c.query(
          "UPDATE jobs SET input='{}',output_key=NULL WHERE user_id=$1",
          [user],
        );
        await c.query("UPDATE users SET deleted_at=now() WHERE id=$1", [user]);
        await c.query("INSERT INTO audit VALUES($1,$2,$3,$4,now())", [
          randomUUID(),
          user,
          "account_deletion",
          { financialRecordsRetained: true },
        ]);
      });
      (await cookies()).delete("studio_demo");
      return reply({ ok: true });
    }
    if (route === "admin" && req.method === "GET") {
      await adminId();
      const tables = [
        "users",
        "purchases",
        "ledger",
        "jobs",
        "free_preview_allowances",
        "free_preview_events",
        "subscriptions",
        "subscription_periods",
        "subscription_events",
        "subscription_checkouts",
        "audit",
        "settings",
      ];
      const results = await Promise.all(
        tables.map((t) => pool.query(`SELECT * FROM ${t} LIMIT 200`)),
      );
      const summary = await pool.query(`SELECT
        (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS customers,
        (SELECT COALESCE(sum(cents),0)::bigint FROM purchases WHERE status='paid' AND mode IN ('test','paddle_sandbox')) AS test_gross_cents,
        0::bigint AS live_gross_cents,
        (SELECT COALESCE(sum(provider_cost_micros),0)::bigint FROM jobs) AS estimated_provider_micros,
        (SELECT count(*)::int FROM jobs WHERE state='failed') AS failures,
        (SELECT count(*)::int FROM jobs WHERE state='uncertain') AS uncertain`);
      return reply({
        ...Object.fromEntries(tables.map((t, i) => [t, results[i].rows])),
        summary: summary.rows,
        models,
      });
    }
    if (route === "admin" && req.method === "POST") {
      const actor = await adminId();
      const action = z
        .discriminatedUnion("action", [
          z.object({
            action: z.literal("disable"),
            model: z.string(),
            disabled: z.boolean(),
          }),
          z.object({
            action: z.literal("adjust"),
            user: z.string(),
            credits: z.number().int().min(-10000).max(10000),
            reason: z.string().min(10).max(500),
          }),
          z.object({
            action: z.literal("reconcile"),
            job: z.uuid(),
            confirmedFailed: z.literal(true),
            reason: z.string().min(10),
          }),
        ])
        .parse(await req.json());
      if (action.action === "reconcile") {
        if (!demo)
          throw new Error(
            "Confirm external provider outcome through the operating procedure first.",
          );
        await finishJob(
          action.job,
          false,
          undefined,
          "Reconciled confirmed failure",
        );
        await pool.query("INSERT INTO audit VALUES($1,$2,$3,$4,now())", [
          randomUUID(),
          actor,
          action.action,
          action,
        ]);
      } else
        await transaction(async (c) => {
          if (action.action === "disable") {
            if (
              action.model !== "all" &&
              !models.some((m) => m.id === action.model)
            )
              throw new Error("Unknown model.");
            await c.query(
              "INSERT INTO settings VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
              [
                action.model === "all"
                  ? "generation_disabled"
                  : "disabled:" + action.model,
                JSON.stringify(action.disabled),
              ],
            );
          } else {
            const r = await c.query(
              "UPDATE users SET balance=balance+$2 WHERE id=$1 AND balance+$2>=0 RETURNING id",
              [action.user, action.credits],
            );
            if (!r.rowCount)
              throw new Error("Adjustment would overdraw the wallet.");
            await c.query(
              "INSERT INTO ledger VALUES($1,$2,'adjustment',$3,$4,$5,now())",
              [
                randomUUID(),
                action.user,
                action.credits,
                "adjust:" + randomUUID(),
                action.reason,
              ],
            );
          }
          await c.query("INSERT INTO audit VALUES($1,$2,$3,$4,now())", [
            randomUUID(),
            actor,
            action.action,
            action,
          ]);
        });
      return reply({ ok: true });
    }
    return reply({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof z.ZodError)
      return reply({ error: "Check your inputs and try again." }, 400);
    const message = e instanceof Error ? e.message : "Unexpected error";
    const allowed =
      /^(Free Preview|Subscription|Monthly|Live subscriptions|One-time purchases|Sign in|This model|These settings|Reference image|Your quote|Insufficient|Daily generation|Generation is|Too many|Request could|Administrator|Upload|Media not|Purchases are|Choose a valid|Test checkout|Purchase not|Wait for|Adjustment would|Confirm external|Demo is|Unknown model)/;
    return reply(
      {
        error: allowed.test(message)
          ? message
          : "Something went wrong. Please try again.",
      },
      /Sign in/.test(message) ? 401 : /Administrator/.test(message) ? 403 : 400,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
