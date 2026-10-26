import { Paddle, Environment, EventName } from "@paddle/paddle-node-sdk";
import { randomUUID } from "node:crypto";
import { packages } from "./config";
import { pool } from "./db";
import { fulfillPurchase } from "./wallet";
// Sandbox only. Merchant eligibility and live underwriting have NOT been established.
const client = () =>
  new Paddle(process.env.PADDLE_SANDBOX_API_KEY || "", {
    environment: Environment.sandbox,
  });
export const sandboxAvailable = () => !!process.env.PADDLE_SANDBOX_API_KEY;
export async function sandboxCheckout(user: string, packageId: string) {
  const pack = packages.find((p) => p.id === packageId);
  if (!pack) throw new Error("Choose a valid credit package.");
  const priceId = process.env["PADDLE_SANDBOX_PRICE_" + pack.id.toUpperCase()];
  if (!priceId) throw new Error("Test checkout is not configured.");
  const sdk = client();
  const price = await sdk.prices.get(priceId);
  if (
    price.status !== "active" ||
    price.billingCycle ||
    price.trialPeriod ||
    price.unitPrice.currencyCode !== "USD" ||
    price.unitPrice.amount !== String(pack.cents) ||
    price.unitPriceOverrides.length
  )
    throw new Error("Test checkout price does not match the package.");
  const id = randomUUID();
  await pool.query(
    "INSERT INTO purchases(id,user_id,package_id,cents,credits,mode) VALUES($1,$2,$3,$4,$5,'paddle_sandbox')",
    [id, user, pack.id, pack.cents, pack.credits],
  );
  const txn = await sdk.transactions.create({
    items: [{ priceId, quantity: 1 }],
    currencyCode: "USD",
    collectionMode: "automatic",
    customData: { purchaseId: id },
  });
  await pool.query("UPDATE purchases SET provider_transaction=$2 WHERE id=$1", [
    id,
    txn.id,
  ]);
  if (!txn.checkout?.url)
    throw new Error(
      "Test checkout has no payment link. Configure an approved default payment link in your Paddle sandbox.",
    );
  const url = new URL(txn.checkout.url);
  const approvedOrigin = process.env.PADDLE_SANDBOX_CHECKOUT_ORIGIN;
  if (
    url.protocol !== "https:" ||
    !approvedOrigin ||
    url.origin !== new URL(approvedOrigin).origin
  )
    throw new Error("Test checkout origin is not configured.");
  return { id, url: url.toString(), provider: "paddle_sandbox", package: pack };
}
export async function paddleWebhook(raw: string, signature: string) {
  const secret = process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;
  if (!secret || !sandboxAvailable())
    throw new Error("Webhook is not configured.");
  const sdk = client();
  const event = await sdk.webhooks.unmarshal(raw, secret, signature);
  if (event.eventType === EventName.TransactionCompleted) {
    const txn = await sdk.transactions.get(event.data.id);
    const p = (
      await pool.query(
        "SELECT * FROM purchases WHERE provider_transaction=$1 AND mode='paddle_sandbox'",
        [txn.id],
      )
    ).rows[0];
    if (!p) throw new Error("Unknown transaction.");
    const pack = packages.find((x) => x.id === p.package_id)!;
    const priceId =
      process.env["PADDLE_SANDBOX_PRICE_" + pack.id.toUpperCase()];
    if (
      txn.status !== "completed" ||
      txn.currencyCode !== "USD" ||
      txn.subscriptionId ||
      txn.discountId ||
      !txn.details?.totals ||
      Number(txn.details.totals.total) < p.cents ||
      txn.customData?.purchaseId !== p.id ||
      txn.items.length !== 1 ||
      txn.items[0].price?.id !== priceId ||
      txn.items[0].quantity !== 1 ||
      txn.items[0].price?.unitPrice.amount !== String(p.cents)
    )
      throw new Error("Transaction verification failed.");
    await fulfillPurchase(event.eventId, p.id, "paid", p.cents);
  } else if (
    event.eventType === EventName.TransactionCanceled ||
    event.eventType === EventName.TransactionPaymentFailed
  ) {
    await pool.query(
      "UPDATE purchases SET status=$2 WHERE provider_transaction=$1 AND mode='paddle_sandbox' AND status='pending'",
      [
        event.data.id,
        event.eventType === EventName.TransactionCanceled
          ? "canceled"
          : "failed",
      ],
    );
  } else if (
    event.eventType === EventName.AdjustmentCreated ||
    event.eventType === EventName.AdjustmentUpdated
  ) {
    const a = event.data;
    if (a.status !== "approved") return;
    if (a.currencyCode !== "USD")
      throw new Error("Adjustment currency mismatch.");
    const p = (
      await pool.query(
        "SELECT * FROM purchases WHERE provider_transaction=$1 AND mode='paddle_sandbox'",
        [a.transactionId],
      )
    ).rows[0];
    if (!p) return;
    if (a.type !== "full") {
      await pool.query("INSERT INTO audit VALUES($1,$2,$3,$4,now())", [
        randomUUID(),
        "paddle-sandbox",
        "partial_adjustment_review",
        { purchase: p.id, adjustment: a.id },
      ]);
      return;
    }
    if (a.action === "refund" || a.action === "chargeback")
      await fulfillPurchase(
        event.eventId,
        p.id,
        a.action === "refund" ? "refund" : "dispute",
        p.cents,
      );
  }
}
