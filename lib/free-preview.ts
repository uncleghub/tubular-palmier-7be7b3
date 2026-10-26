import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { demo } from "./config";
import { freePreviewPlan } from "./free-plan";
import { models, type GenerationInput, type Model } from "./catalog";
type Connection = Pool | PoolClient;
export function generationLimit(name: string, fallback: number) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || raw?.trim() === "")
    throw new Error("Generation limits are not configured correctly.");
  return value;
}
export function freePreviewEnabled() {
  return (
    process.env.FREE_PREVIEW_ENABLED !== "false" &&
    (demo || process.env.FREE_PREVIEW_ENABLED === "true")
  );
}
function modelId(kind: "image" | "video") {
  const id =
    process.env[
      kind === "image"
        ? "FREE_PREVIEW_IMAGE_MODEL_ID"
        : "FREE_PREVIEW_VIDEO_MODEL_ID"
    ] || (demo ? (kind === "image" ? "sample-image" : "sample-video") : null);
  const m = models.find(
    (x) =>
      x.id === id &&
      x.kind === kind &&
      x.enabled &&
      x.verified &&
      x.credits !== null &&
      x.providerCostMicros !== null &&
      (x.kind !== "video" ||
        x.durations.includes(freePreviewPlan.videoSeconds)) &&
      (demo || x.provider !== "Local demo"),
  );
  return m?.id || null;
}
export async function ensureFreePreview(db: Connection, user: string) {
  await db.query(
    `INSERT INTO free_preview_allowances(user_id,image_limit,video_limit) SELECT id,$2,$3 FROM users WHERE id=$1 AND deleted_at IS NULL ON CONFLICT(user_id) DO NOTHING`,
    [user, freePreviewPlan.images, freePreviewPlan.videos],
  );
}
export async function getFreePreview(user: string) {
  const active = await pool.query(
    "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL",
    [user],
  );
  if (!active.rowCount) throw new Error("Sign in to continue.");
  const enabled = freePreviewEnabled();
  if (enabled) await ensureFreePreview(pool, user);
  const r = await pool.query(
    "SELECT * FROM free_preview_allowances WHERE user_id=$1",
    [user],
  );
  const row = r.rows[0];
  const image = {
    total: row?.image_limit ?? freePreviewPlan.images,
    used: row?.image_used ?? 0,
    reserved: row?.image_reserved ?? 0,
    remaining:
      enabled && row
        ? row.image_limit - row.image_used - row.image_reserved
        : 0,
  };
  const video = {
    total: row?.video_limit ?? freePreviewPlan.videos,
    used: row?.video_used ?? 0,
    reserved: row?.video_reserved ?? 0,
    remaining:
      enabled && row
        ? row.video_limit - row.video_used - row.video_reserved
        : 0,
  };
  return {
    enabled,
    images: image,
    videos: video,
    imageModelId: enabled ? modelId("image") : null,
    videoModelId: enabled ? modelId("video") : null,
    videoSeconds: freePreviewPlan.videoSeconds,
  };
}
export function validateFreePreview(input: GenerationInput, m: Model) {
  if (!freePreviewEnabled())
    throw new Error("Free Preview is temporarily unavailable.");
  if (
    m.id !== modelId(m.kind) ||
    m.credits === null ||
    m.providerCostMicros === null ||
    !Number.isSafeInteger(m.providerCostMicros) ||
    m.providerCostMicros < 0
  )
    throw new Error(
      "Free Preview is not available for this model. Choose an eligible model or use credits.",
    );
  if (m.kind === "video" && input.duration !== freePreviewPlan.videoSeconds)
    throw new Error(
      "Free Preview includes one six-second video. Choose 6 seconds or use credits.",
    );
}
export async function checkFreePreview(
  user: string,
  input: GenerationInput,
  m: Model,
) {
  validateFreePreview(input, m);
  const a = await getFreePreview(user);
  if ((m.kind === "image" ? a.images : a.videos).remaining < 1)
    throw new Error(
      `Free Preview ${m.kind} allowance is used or reserved. Use credits for another generation.`,
    );
}
export async function reserveFreePreview(
  db: Connection,
  user: string,
  input: GenerationInput,
  m: Model,
) {
  validateFreePreview(input, m);
  await ensureFreePreview(db, user);
  const column = m.kind; // Only server-validated literal 'image' or 'video' is interpolated.
  const r = await db.query(
    `UPDATE free_preview_allowances SET ${column}_reserved=${column}_reserved+1 WHERE user_id=$1 AND ${column}_used+${column}_reserved<${column}_limit RETURNING user_id`,
    [user],
  );
  if (!r.rowCount)
    throw new Error(
      `Free Preview ${column} allowance is used or reserved. Use credits for another generation.`,
    );
}
export async function settleFreePreview(
  db: Connection,
  job: { id: string; user_id: string; model_id: string; media_kind?: string },
  success: boolean,
) {
  const column =
    job.media_kind || models.find((x) => x.id === job.model_id)?.kind;
  if (column !== "image" && column !== "video")
    throw new Error("Free Preview job type is unknown.");
  const r = await db.query(
    `UPDATE free_preview_allowances SET ${column}_reserved=${column}_reserved-1,${column}_used=${column}_used+$2 WHERE user_id=$1 AND ${column}_reserved>0 RETURNING user_id`,
    [job.user_id, success ? 1 : 0],
  );
  if (!r.rowCount)
    throw new Error("Free Preview reservation could not be reconciled.");
  await db.query(
    "INSERT INTO free_preview_events(id,user_id,job_id,kind,media_kind,reference) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      job.user_id,
      job.id,
      success ? "spend" : "release",
      column,
      "free:finish:" + job.id,
    ],
  );
}
