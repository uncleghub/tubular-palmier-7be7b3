import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("account, purchase, image, video, failure release and private downloads", async ({
  page,
  context,
  browser,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little imagination/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-discover.png`,
    fullPage: true,
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page.getByRole("status")).toContainText("ready");
  await page.goto("/pricing");
  await page.getByRole("button", { name: "Try Starter checkout" }).click();
  await expect(page.getByRole("dialog")).toContainText("500 test credits");
  await page
    .getByRole("button", { name: "Simulate successful payment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Demo credits added once",
  );
  await page.goto("/image");
  await page
    .getByLabel("Your prompt")
    .fill("A tranquil landscape under a golden moon");
  await page.getByRole("button", { name: "Get exact credit quote" }).click();
  await expect(page.getByText("Your locked quote")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & create sample" }).click();
  await expect(
    page.getByRole("link", { name: "Download sample", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const href = await page
    .getByRole("link", { name: "Download sample", exact: true })
    .getAttribute("href");
  const result = await context.request.get(href!);
  expect(result.status()).toBe(200);
  expect(result.headers()["content-type"]).toBe("image/svg+xml");
  const alien = await browser.newContext();
  await alien.request.post("/api/session", {
    data: {},
    headers: { origin: "http://localhost:3000" },
  });
  expect((await alien.request.get(href!)).status()).toBe(400);
  await alien.close();
  const other = await page.request.get("/api/admin");
  expect(other.status()).toBe(403);
  await page.screenshot({
    path: `test-results/${info.project.name}-image.png`,
    fullPage: true,
  });
  await page.goto("/video");
  await page.getByLabel("Your prompt").fill("A cinematic slow motion world");
  const clipSeconds = info.project.name === "mobile" ? "6" : "8";
  await page.getByLabel("Duration").selectOption(clipSeconds);
  await page.getByRole("button", { name: "Get exact credit quote" }).click();
  await page.getByRole("button", { name: "Confirm & create sample" }).click();
  await expect(
    page.getByRole("link", { name: "Download sample", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.locator(".result-info")).toContainText(clipSeconds + "s");
  const videoHref = await page
    .getByRole("link", { name: "Download sample", exact: true })
    .getAttribute("href");
  expect(
    (await context.request.get(videoHref!)).headers()["content-type"],
  ).toBe("video/mp4");
  await page.goto("/image");
  await page.getByLabel("Your prompt").fill("[simulate failure]");
  await page.getByRole("button", { name: "Get exact credit quote" }).click();
  await page.getByRole("button", { name: "Confirm & create sample" }).click();
  await expect(
    page.getByText("Reserved credits were returned.", { exact: false }),
  ).toBeVisible({ timeout: 30000 });
  await page.goto("/dashboard");
  await expect(page.getByText("1,408", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("server ownership and CSRF boundaries", async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  for (const c of [a, b]) {
    await c.request.post("/api/session", {
      data: {},
      headers: { origin: "http://localhost:3000" },
    });
  }
  const invalid = await a.request.post("/api/uploads", {
    multipart: {
      file: {
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      },
    },
    headers: { origin: "http://localhost:3000" },
  });
  expect(invalid.status()).toBe(400);
  const image = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#dfa57f" },
  })
    .png()
    .toBuffer();
  const uploaded = await a.request.post("/api/uploads", {
    multipart: {
      file: { name: "reference.png", mimeType: "image/png", buffer: image },
    },
    headers: { origin: "http://localhost:3000" },
  });
  expect(uploaded.status()).toBe(200);
  const referenceId = (await uploaded.json()).id;
  const forbiddenReference = await b.request.post("/api/quote", {
    data: {
      modelId: "sample-image",
      prompt: "Try another account reference",
      ratio: "1:1",
      resolution: "1024",
      referenceId,
      requestId: crypto.randomUUID(),
    },
    headers: { origin: "http://localhost:3000" },
  });
  expect(forbiddenReference.status()).toBe(400);
  const pending = await a.request.post("/api/checkout", {
    data: { packageId: "starter" },
    headers: { origin: "http://localhost:3000" },
  });
  const purchaseId = (await pending.json()).id;
  await a.request.post("/api/test-payment", {
    data: { purchaseId, outcome: "failed" },
    headers: { origin: "http://localhost:3000" },
  });
  expect(
    (await (await a.request.get("/api/account")).json()).wallet.balance,
  ).toBe(1000);
  const q = await a.request.post("/api/quote", {
    data: {
      modelId: "sample-image",
      prompt: "Owner test",
      ratio: "1:1",
      resolution: "1024",
      requestId: crypto.randomUUID(),
    },
    headers: { origin: "http://localhost:3000" },
  });
  expect(q.status()).toBe(200);
  const denied = await a.request.post("/api/checkout", {
    data: { packageId: "starter" },
    headers: { origin: "https://evil.example" },
  });
  expect(denied.status()).toBe(400);
  const jobs = (await (await b.request.get("/api/account")).json()).jobs;
  expect(jobs).toHaveLength(0);
  const media = await b.request.get(
    "/api/download/00000000-0000-4000-8000-000000000000",
  );
  expect(media.status()).toBe(400);
  await a.close();
  await b.close();
});
