import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("account, purchase, image, video, failure release and private downloads", async ({
  page,
  context,
  browser,
}, info) => {
  await page.goto("/");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page).toHaveTitle(/GEEZ AI STUDIO/);
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

test("brand, keyboard navigation, responsive routes and example prompt handoff", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GEEZ AI STUDIO/);
  const brand = page.locator(".brand");
  await expect(brand).toHaveAccessibleName(/GEEZ AI STUDIO/i);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  if (info.project.name === "mobile") {
    await page.goto("/");
    await expect(page.locator(".mobile-top-brand")).toBeVisible();
    await expect(page.locator(".mobile-top-brand")).toHaveAccessibleName(
      "GEEZ AI STUDIO",
    );
    const opener = page.getByRole("button", { name: "Open navigation" });
    const backdrop = page.getByRole("button", {
      name: "Close navigation menu",
      exact: true,
    });
    await opener.click();
    await expect(backdrop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(backdrop).toBeHidden();
    await opener.click();
    await page.mouse.click(page.viewportSize()!.width - 12, 200);
    await expect(backdrop).toBeHidden();
    await opener.click();
    const imageLink = page.getByRole("link", {
      name: "Image studio",
      exact: true,
    });
    await expect(imageLink).toBeInViewport();
    await imageLink.click();
    await expect(page.getByLabel("Your prompt")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeVisible();
  }

  await page.goto("/");
  const example = page.locator('a[href^="/image?prompt="]').first();
  await expect(example).toBeVisible();
  const href = await example.getAttribute("href");
  const expectedPrompt = new URL(
    href!,
    "http://localhost:3000",
  ).searchParams.get("prompt");
  await example.click();
  await expect(page.getByLabel("Your prompt")).toHaveValue(expectedPrompt!);

  for (const route of ["/", "/image", "/video", "/pricing", "/help"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("home composer mode, prompt handoff and inspiration filters", async ({
  page,
}) => {
  await page.goto("/");
  const mode = page.getByRole("group", { name: "Choose a creative studio" });
  await expect(
    mode.getByRole("button", { name: "Image", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    mode.getByRole("button", { name: "Video", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  const videoIdea = "A gentle camera glide over copper desert dunes";
  await page.getByLabel("Describe your next idea").fill(videoIdea);
  await mode.getByRole("button", { name: "Video", exact: true }).click();
  await expect(
    mode.getByRole("button", { name: "Image", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    mode.getByRole("button", { name: "Video", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open studio" }).click();
  await expect(page).toHaveURL(/\/video\?prompt=/);
  await expect(page.getByLabel("Your prompt")).toHaveValue(videoIdea);

  await page.goto("/");
  const imageIdea = "An editorial photograph in warm natural light";
  await page.getByLabel("Describe your next idea").fill(imageIdea);
  await page.getByLabel("Describe your next idea").press("Enter");
  await expect(page).toHaveURL(/\/image\?prompt=/);
  await expect(page.getByLabel("Your prompt")).toHaveValue(imageIdea);

  await page.goto("/");
  const gallery = page.locator(".editorial-gallery");
  const cards = gallery.getByRole("link");
  const originalCount = await cards.count();
  expect(originalCount).toBeGreaterThan(1);
  const portrait = page.getByRole("button", { name: "Portrait", exact: true });
  await portrait.click();
  await expect(portrait).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Every face tells a story");
  const all = page.getByRole("button", {
    name: "All inspiration",
    exact: true,
  });
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(portrait).toHaveAttribute("aria-pressed", "false");
  await expect(cards).toHaveCount(originalCount);
});
