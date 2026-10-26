import { cookies } from "next/headers";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { demo } from "./config";
import { pool, transaction } from "./db";
export async function userId() {
  if (demo) {
    const id = (await cookies()).get("studio_demo")?.value;
    if (!id || !/^demo_[a-f0-9-]{36}$/.test(id))
      throw new Error("Sign in to continue.");
    const active = await pool.query(
      "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL",
      [id],
    );
    if (!active.rowCount) throw new Error("Sign in to continue.");
    return id;
  }
  const a = await auth();
  if (!a.userId) throw new Error("Sign in to continue.");
  const client = await clerkClient();
  const profile = await client.users.getUser(a.userId);
  if (
    !profile.emailAddresses.some(
      (e) =>
        e.id === profile.primaryEmailAddressId &&
        e.verification?.status === "verified",
    )
  )
    throw new Error("Sign in with a verified email to continue.");
  await pool.query("INSERT INTO users(id) VALUES($1) ON CONFLICT DO NOTHING", [
    a.userId,
  ]);
  const active = await pool.query(
    "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL",
    [a.userId],
  );
  if (!active.rowCount) throw new Error("Sign in to continue.");
  return a.userId;
}
export async function demoSignIn() {
  if (!demo) throw new Error("Demo is disabled.");
  const id = "demo_" + randomUUID();
  await transaction(async (c) => {
    await c.query("INSERT INTO users(id,balance) VALUES($1,1000)", [id]);
    await c.query(
      "INSERT INTO ledger(id,user_id,kind,amount,reference,reason) VALUES($1,$2,'adjustment',1000,$3,'Welcome demo credits; no cash value')",
      [randomUUID(), id, "welcome:" + id],
    );
  });
  (await cookies()).set("studio_demo", id, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.APP_URL?.startsWith("https:") === true,
    path: "/",
    maxAge: 86400 * 7,
  });
  return id;
}
export async function adminId() {
  const id = await userId();
  if (demo || !process.env.ADMIN_USER_IDS?.split(",").includes(id))
    throw new Error("Administrator access required.");
  return id;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(process.env.APP_URL || req.url).origin)
    throw new Error("Request could not be verified.");
}
export async function rateLimit(key: string, limit = 30) {
  const r = await pool.query(
    `INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '1 minute' ELSE rate_limits.reset_at END RETURNING count`,
    [key],
  );
  if (r.rows[0].count > limit)
    throw new Error("Too many requests. Please try again in a minute.");
}
