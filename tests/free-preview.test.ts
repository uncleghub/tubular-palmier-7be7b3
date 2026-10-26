import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { quote, reserveJob, finishJob } from "../lib/wallet";
import { getFreePreview } from "../lib/free-preview";
import { reconcileLostLeases } from "../lib/queue";
import { sampleAdapter } from "../lib/providers";
import type { GenerationInput } from "../lib/catalog";

const users: string[] = [];

async function customer(balance = 0) {
  const id = "test_free_" + randomUUID();
  users.push(id);
  await pool.query("INSERT INTO users(id,balance) VALUES($1,$2)", [
    id,
    balance,
  ]);
  return id;
}

function imageInput(extra: Partial<GenerationInput> = {}): GenerationInput {
  return {
    modelId: "sample-image",
    prompt: "A cinematic landscape for a free preview",
    ratio: "1:1",
    resolution: "1024",
    requestId: randomUUID(),
    fundingSource: "free_preview",
    ...extra,
  };
}

function videoInput(extra: Partial<GenerationInput> = {}): GenerationInput {
  return imageInput({
    modelId: "sample-video",
    prompt: "A six-second cinematic preview",
    ratio: "16:9",
    resolution: "720p",
    duration: 6,
    ...extra,
  });
}

async function reserveFree(user: string, input = imageInput()) {
  const accepted = await quote(user, input);
  return reserveJob(user, { ...input, quoteId: accepted.id });
}

async function wallet(user: string) {
  return (
    await pool.query("SELECT balance,reserved FROM users WHERE id=$1", [user])
  ).rows[0];
}

async function succeed(id: string, video = false) {
  await finishJob(id, true, {
    key: video ? `outputs/${id}.mp4` : `outputs/${id}.svg`,
    width: video ? 1280 : 1024,
    height: video ? 720 : 1024,
    ...(video ? { duration: 6 } : {}),
  });
}

after(async () => {
  for (const id of users) {
    await pool.query(
      "DELETE FROM payment_events WHERE purchase_id IN (SELECT id FROM purchases WHERE user_id=$1)",
      [id],
    );
    for (const table of [
      "free_preview_events",
      "quotes",
      "ledger",
      "jobs",
      "purchases",
      "uploads",
      "free_preview_allowances",
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE user_id=$1`, [id]);
    }
    await pool.query("DELETE FROM users WHERE id=$1", [id]);
  }
  await pool.end();
});

test("free preview is granted once per account without adding wallet money", async () => {
  const user = await customer(0);
  const statuses = await Promise.all(
    Array.from({ length: 5 }, () => getFreePreview(user)),
  );
  for (const status of statuses) {
    assert.equal(status.enabled, true);
    assert.deepEqual(status.images, {
      remaining: 3,
      reserved: 0,
      used: 0,
      total: 3,
    });
    assert.deepEqual(status.videos, {
      remaining: 1,
      reserved: 0,
      used: 0,
      total: 1,
    });
    assert.equal(status.videoSeconds, 6);
  }
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM free_preview_allowances WHERE user_id=$1",
        [user],
      )
    ).rows[0].count,
    1,
  );
  assert.deepEqual(await wallet(user), { balance: 0, reserved: 0 });
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM purchases WHERE user_id=$1",
        [user],
      )
    ).rows[0].count,
    0,
  );
});

test("five concurrent free-image submissions can reserve only three units", async () => {
  const user = await customer(0);
  const inputs = Array.from({ length: 5 }, () => imageInput());
  // All quotes precede reservations: it is the transactional admission check
  // that must enforce the allowance when customers submit simultaneously.
  const quotes = await Promise.all(inputs.map((input) => quote(user, input)));
  for (const accepted of quotes) {
    assert.equal(accepted.credits, 0);
    assert.equal(accepted.fundingSource, "free_preview");
  }
  const results = await Promise.allSettled(
    inputs.map((input, i) =>
      reserveJob(user, { ...input, quoteId: quotes[i].id }),
    ),
  );
  const successful = results.filter(
    (
      result,
    ): result is PromiseFulfilledResult<
      Awaited<ReturnType<typeof reserveJob>>
    > => result.status === "fulfilled",
  );
  assert.equal(successful.length, 3);
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    2,
  );
  for (const { value: job } of successful) {
    assert.equal(job.funding_source, "free_preview");
    assert.equal(job.credits, 0);
    assert.equal(job.list_price_credits, 12);
  }
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 0,
    reserved: 3,
    used: 0,
    total: 3,
  });
  assert.deepEqual(await wallet(user), { balance: 0, reserved: 0 });
  await Promise.all(successful.map(({ value: job }) => succeed(job.id)));
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 0,
    reserved: 0,
    used: 3,
    total: 3,
  });
});

test("duplicate free submissions and settlements consume one unit only", async () => {
  const user = await customer(500);
  const input = imageInput();
  const accepted = await quote(user, input);
  const [first, duplicate] = await Promise.all([
    reserveJob(user, { ...input, quoteId: accepted.id }),
    reserveJob(user, { ...input, quoteId: accepted.id }),
  ]);
  assert.equal(first.id, duplicate.id);
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 2,
    reserved: 1,
    used: 0,
    total: 3,
  });
  await Promise.all([succeed(first.id), succeed(first.id)]);
  await finishJob(first.id, false, undefined, "Late duplicate failure");
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 2,
    reserved: 0,
    used: 1,
    total: 3,
  });
  assert.deepEqual(await wallet(user), { balance: 500, reserved: 0 });
});

test("a confirmed sample failure restores its free allowance exactly once", async () => {
  const user = await customer(200);
  const job = await reserveFree(
    user,
    imageInput({ prompt: "[simulate failure]" }),
  );
  await assert.rejects(sampleAdapter.generate(job));
  await Promise.all([
    finishJob(job.id, false, undefined, "Confirmed sample failure"),
    finishJob(job.id, false, undefined, "Repeated failure event"),
  ]);
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 3,
    reserved: 0,
    used: 0,
    total: 3,
  });
  assert.deepEqual(await wallet(user), { balance: 200, reserved: 0 });
});

test("uncertain free jobs retain their unit until the outcome is reconciled", async () => {
  const user = await customer();
  const job = await reserveFree(user);
  await pool.query(
    "UPDATE jobs SET state='running',lease_until=now()-interval '1 minute' WHERE id=$1",
    [job.id],
  );
  await reconcileLostLeases();
  assert.equal(
    (await pool.query("SELECT state FROM jobs WHERE id=$1", [job.id])).rows[0]
      .state,
    "uncertain",
  );
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 2,
    reserved: 1,
    used: 0,
    total: 3,
  });
  await finishJob(job.id, false, undefined, "Reconciled confirmed failure");
  assert.equal((await getFreePreview(user)).images.remaining, 3);
  assert.deepEqual(await wallet(user), { balance: 0, reserved: 0 });
});

test("the one free video is six seconds and does not consume image units", async () => {
  const user = await customer(1000);
  await assert.rejects(quote(user, videoInput({ duration: 8 })));
  assert.equal((await getFreePreview(user)).videos.remaining, 1);
  const input = videoInput();
  const accepted = await quote(user, input);
  assert.equal(accepted.credits, 0);
  const job = await reserveJob(user, { ...input, quoteId: accepted.id });
  assert.equal(job.funding_source, "free_preview");
  assert.equal(job.list_price_credits, 80);
  assert.equal((await getFreePreview(user)).videos.reserved, 1);
  await succeed(job.id, true);
  const status = await getFreePreview(user);
  assert.deepEqual(status.videos, {
    remaining: 0,
    reserved: 0,
    used: 1,
    total: 1,
  });
  assert.equal(status.images.remaining, 3);
  await assert.rejects(reserveFree(user, videoInput()));
  assert.deepEqual(await wallet(user), { balance: 1000, reserved: 0 });
});

test("free quotes bind their owner and funding choice before any reservation", async () => {
  const owner = await customer(100),
    other = await customer(100);
  const freeInput = imageInput();
  const freeQuote = await quote(owner, freeInput);
  await assert.rejects(
    reserveJob(other, { ...freeInput, quoteId: freeQuote.id }),
  );
  await assert.rejects(
    reserveJob(owner, {
      ...freeInput,
      fundingSource: "wallet",
      quoteId: freeQuote.id,
    }),
  );
  const creditInput = imageInput({ fundingSource: "wallet" });
  const creditQuote = await quote(owner, creditInput);
  await assert.rejects(
    reserveJob(owner, {
      ...creditInput,
      fundingSource: "free_preview",
      quoteId: creditQuote.id,
    }),
  );
  for (const user of [owner, other]) {
    assert.equal((await getFreePreview(user)).images.remaining, 3);
    assert.deepEqual(await wallet(user), { balance: 100, reserved: 0 });
  }
});

test("expired free quotes do not hold or spend an allowance", async () => {
  const user = await customer();
  const input = imageInput(),
    accepted = await quote(user, input);
  await pool.query(
    "UPDATE quotes SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [accepted.id],
  );
  await assert.rejects(reserveJob(user, { ...input, quoteId: accepted.id }));
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 3,
    reserved: 0,
    used: 0,
    total: 3,
  });
});

test("an exhausted free preview never silently charges the customer wallet", async () => {
  const user = await customer(500);
  for (let i = 0; i < 3; i++) {
    const job = await reserveFree(user);
    await succeed(job.id);
  }
  for (let i = 0; i < 2; i++) {
    const status = await getFreePreview(user);
    assert.equal(status.images.remaining, 0);
    assert.equal(status.images.used, 3);
  }
  await assert.rejects(reserveFree(user));
  assert.deepEqual(await wallet(user), { balance: 500, reserved: 0 });
});

test("wallet-funded jobs remain separate from the free preview", async () => {
  const user = await customer(100);
  const input = imageInput();
  delete input.fundingSource;
  const accepted = await quote(user, input);
  assert.equal(accepted.credits, 12);
  assert.equal(accepted.fundingSource, "wallet");
  const job = await reserveJob(user, { ...input, quoteId: accepted.id });
  assert.equal(job.funding_source, "wallet");
  assert.equal(job.credits, 12);
  assert.deepEqual(await wallet(user), { balance: 88, reserved: 12 });
  await succeed(job.id);
  assert.deepEqual(await wallet(user), { balance: 88, reserved: 0 });
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 3,
    reserved: 0,
    used: 0,
    total: 3,
  });
});

test("deleted accounts cannot receive a new free preview", async () => {
  const user = await customer();
  await pool.query("UPDATE users SET deleted_at=now() WHERE id=$1", [user]);
  await assert.rejects(getFreePreview(user));
  await assert.rejects(reserveFree(user));
});

test("free daily capacity blocks admission without consuming the quote or allowance", async () => {
  const user = await customer(500);
  const input = imageInput();
  const accepted = await quote(user, input);
  const original = process.env.FREE_PREVIEW_DAILY_JOB_LIMIT;
  process.env.FREE_PREVIEW_DAILY_JOB_LIMIT = "0";
  try {
    await assert.rejects(
      reserveJob(user, { ...input, quoteId: accepted.id }),
      /Free Preview daily capacity/,
    );
  } finally {
    if (original === undefined) delete process.env.FREE_PREVIEW_DAILY_JOB_LIMIT;
    else process.env.FREE_PREVIEW_DAILY_JOB_LIMIT = original;
  }
  assert.equal((await getFreePreview(user)).images.remaining, 3);
  assert.deepEqual(await wallet(user), { balance: 500, reserved: 0 });
  assert.equal(
    (await pool.query("SELECT consumed FROM quotes WHERE id=$1", [accepted.id]))
      .rows[0].consumed,
    false,
  );
  // An admission failure leaves the same accepted quote usable when capacity returns.
  const job = await reserveJob(user, { ...input, quoteId: accepted.id });
  await finishJob(job.id, false, undefined, "Test capacity restored");
  assert.equal((await getFreePreview(user)).images.remaining, 3);
});

test("free settlement uses the job's frozen media type after a model is retired", async () => {
  const user = await customer();
  const job = await reserveFree(user);
  assert.equal(job.media_kind, "image");
  await pool.query("UPDATE jobs SET model_id=$2 WHERE id=$1", [
    job.id,
    "retired-model-no-longer-in-catalog",
  ]);
  await finishJob(job.id, false, undefined, "Retired model confirmed failure");
  const status = await getFreePreview(user);
  assert.deepEqual(status.images, {
    remaining: 3,
    reserved: 0,
    used: 0,
    total: 3,
  });
  assert.equal(status.videos.remaining, 1);
  assert.deepEqual(await wallet(user), { balance: 0, reserved: 0 });
});

test("disabling Free Preview after a quote blocks admission without consuming it", async () => {
  const user = await customer(500);
  const input = imageInput();
  const accepted = await quote(user, input);
  const original = process.env.FREE_PREVIEW_ENABLED;
  process.env.FREE_PREVIEW_ENABLED = "false";
  try {
    await assert.rejects(
      reserveJob(user, { ...input, quoteId: accepted.id }),
      /Free Preview is temporarily unavailable/,
    );
    assert.equal((await getFreePreview(user)).enabled, false);
  } finally {
    if (original === undefined) delete process.env.FREE_PREVIEW_ENABLED;
    else process.env.FREE_PREVIEW_ENABLED = original;
  }
  assert.equal((await getFreePreview(user)).images.remaining, 3);
  assert.deepEqual(await wallet(user), { balance: 500, reserved: 0 });
  assert.equal(
    (await pool.query("SELECT consumed FROM quotes WHERE id=$1", [accepted.id]))
      .rows[0].consumed,
    false,
  );
});

test("the server's free-model allowlist is checked again at reservation", async () => {
  const user = await customer(500);
  const input = imageInput();
  const accepted = await quote(user, input);
  const original = process.env.FREE_PREVIEW_IMAGE_MODEL_ID;
  // This enabled catalog model is a video model, so it cannot become the
  // permitted image model merely because the environment names it.
  process.env.FREE_PREVIEW_IMAGE_MODEL_ID = "sample-video";
  try {
    assert.equal((await getFreePreview(user)).imageModelId, null);
    await assert.rejects(
      quote(user, imageInput()),
      /not available for this model/,
    );
    await assert.rejects(
      reserveJob(user, { ...input, quoteId: accepted.id }),
      /not available for this model/,
    );
  } finally {
    if (original === undefined) delete process.env.FREE_PREVIEW_IMAGE_MODEL_ID;
    else process.env.FREE_PREVIEW_IMAGE_MODEL_ID = original;
  }
  assert.equal((await getFreePreview(user)).images.remaining, 3);
  assert.deepEqual(await wallet(user), { balance: 500, reserved: 0 });
});

test("an invalid provider-spend cap fails closed before a free reservation", async () => {
  const user = await customer(500);
  const input = imageInput();
  const accepted = await quote(user, input);
  const original = process.env.GLOBAL_DAILY_PROVIDER_MICROS;
  process.env.GLOBAL_DAILY_PROVIDER_MICROS = "not-a-number";
  try {
    await assert.rejects(
      reserveJob(user, { ...input, quoteId: accepted.id }),
      /Generation limits are not configured correctly/,
    );
  } finally {
    if (original === undefined) delete process.env.GLOBAL_DAILY_PROVIDER_MICROS;
    else process.env.GLOBAL_DAILY_PROVIDER_MICROS = original;
  }
  assert.deepEqual((await getFreePreview(user)).images, {
    remaining: 3,
    reserved: 0,
    used: 0,
    total: 3,
  });
  assert.deepEqual(await wallet(user), { balance: 500, reserved: 0 });
  assert.equal(
    (await pool.query("SELECT consumed FROM quotes WHERE id=$1", [accepted.id]))
      .rows[0].consumed,
    false,
  );
});
