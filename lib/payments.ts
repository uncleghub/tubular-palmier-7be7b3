import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fulfillPurchase } from "./wallet";
const schema = z
  .object({
    eventId: z.string().min(8).max(200),
    purchaseId: z.string().uuid(),
    kind: z.enum(["paid", "refund", "dispute"]),
    cents: z.number().int().positive(),
    currency: z.literal("USD"),
    timestamp: z.number().int(),
  })
  .strict();
export function signPayment(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}
export async function receivePayment(
  body: string,
  signature: string,
  secret: string,
) {
  if (secret.length < 32)
    throw new Error("Payment verification is not configured.");
  const expected = Buffer.from(signPayment(body, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Payment signature is invalid.");
  const event = schema.parse(JSON.parse(body));
  if (Math.abs(Date.now() / 1000 - event.timestamp) > 300)
    throw new Error("Payment event has expired.");
  await fulfillPurchase(
    event.eventId,
    event.purchaseId,
    event.kind,
    event.cents,
  );
}
