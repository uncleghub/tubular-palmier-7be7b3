import { pool, transaction } from "../lib/db";
import { sampleAdapter } from "../lib/providers";
import { finishJob } from "../lib/wallet";
import { reconcileLostLeases } from "../lib/queue";
import { demo } from "../lib/config";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
console.log(
  "Worker started. Mode:",
  demo ? "demo" : "production; live adapters disabled",
);
while (!stopping) {
  try {
    // A lost lease is uncertain, never blindly retried: prevents duplicate external billing.
    await reconcileLostLeases();
    const j = await transaction(async (c) => {
      const r = await c.query(
        "SELECT * FROM jobs WHERE state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      );
      if (!r.rowCount) return null;
      await c.query(
        "UPDATE jobs SET state='running',attempt=attempt+1,lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=$1",
        [r.rows[0].id],
      );
      return r.rows[0];
    });
    if (j) {
      if (!demo) {
        await pool.query(
          "UPDATE jobs SET state='uncertain',error='Provider adapter is unavailable' WHERE id=$1",
          [j.id],
        );
        continue;
      }
      try {
        const flags = await pool.query(
          "SELECT value FROM settings WHERE key IN ('generation_disabled',$1)",
          ["disabled:" + j.model_id],
        );
        if (flags.rows.some((r) => r.value === true)) {
          await finishJob(
            j.id,
            false,
            undefined,
            j.funding_source === "free_preview"
              ? "Generation paused. Free Preview allowance was restored."
              : "Generation paused before processing. Reserved credits were returned.",
          );
          continue;
        }
        const output = await sampleAdapter.generate(j);
        await finishJob(j.id, true, output);
      } catch {
        await finishJob(
          j.id,
          false,
          undefined,
          j.funding_source === "free_preview"
            ? "Generation could not be completed. Free Preview allowance was restored."
            : "Generation could not be completed. Reserved credits were returned.",
        );
      }
    } else await new Promise((r) => setTimeout(r, 1000));
  } catch (e) {
    console.error(
      "Worker operation failed:",
      e instanceof Error ? e.name : "UnknownError",
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await pool.end();
