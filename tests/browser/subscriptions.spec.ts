import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";

const origin = "http://localhost:3000";
const post = (
  request: APIRequestContext,
  path: string,
  data: unknown,
  from = origin,
) => request.post("/api/" + path, { data, headers: { origin: from } });
const account = async (request: APIRequestContext) => {
  const response = await request.get("/api/account");
  expect(response.status()).toBe(200);
  return response.json();
};

async function signIn(context: BrowserContext) {
  const response = await context.request.post("/api/session", {
    data: {},
    headers: {
      origin,
      "x-forwarded-for": "subscription-e2e-" + crypto.randomUUID(),
    },
  });
  expect(response.status()).toBe(200);
}

test("monthly plan disclosures, failed checkout, cancellation and resumption", async ({
  page,
  context,
}, info) => {
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": "subscription-ui-" + crypto.randomUUID(),
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page.getByRole("status")).toContainText("ready");
  await page.goto("/pricing");
  const starter = page
    .locator(".price-card")
    .filter({
      has: page.getByRole("heading", { name: "Starter", exact: true }),
    });
  await expect(starter).toContainText("$5");
  await expect(starter).toContainText(/month/i);
  await expect(starter).toContainText(/500/);
  await expect(page.locator("#free-preview")).toContainText(
    "3 images and 1 6-second video",
  );
  await expect(page.locator("#free-preview")).toContainText(
    "once per verified account",
  );

  const openCheckout = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/subscription/checkout") &&
          response.request().method() === "POST",
      ),
      page
        .getByRole("button", { name: "Try Starter monthly plan", exact: true })
        .click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(page.getByRole("dialog")).toBeVisible();
    return (await response.json()).id as string;
  };

  // Closing a checkout cancels its pending attempt, so the user can return later.
  await openCheckout();
  await expect(page.getByRole("dialog")).toContainText(/monthly subscription/i);
  await expect(page.getByRole("dialog")).toContainText(/no money charged/i);
  await expect(page.getByRole("dialog")).toContainText(/renew/i);
  await expect(page.getByRole("dialog")).toContainText(/cancel/i);
  await expect(page.getByRole("dialog")).toContainText(/expire|roll.?over/i);
  await page
    .getByRole("button", { name: "Close checkout", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await openCheckout();
  await page
    .getByRole("button", { name: "Simulate failed payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  let state = await account(context.request);
  expect(state.subscription).toBeNull();
  expect(state.wallet).toMatchObject({ balance: 1000, reserved: 0 });

  const checkoutId = await openCheckout();
  await page
    .getByRole("button", { name: "Simulate successful payment", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Monthly demo subscription activated",
  );
  state = await account(context.request);
  expect(state.subscription).toMatchObject({
    planId: "starter",
    cancelAtPeriodEnd: false,
    credits: { total: 500, remaining: 500, reserved: 0, spent: 0 },
  });
  expect(state.wallet.balance).toBe(1000);
  expect(state.freePreview.images.remaining).toBe(3);
  expect(state.freePreview.videos.remaining).toBe(1);
  const subscriptionId = state.subscription.id;

  // The same simulated payment cannot add another monthly allowance.
  expect(
    (
      await post(context.request, "subscription/test-payment", {
        checkoutId,
        outcome: "paid",
      })
    ).status(),
  ).toBe(200);
  expect((await account(context.request)).subscription.credits.remaining).toBe(
    500,
  );

  await page.goto("/settings");
  const billing = page.getByRole("region", {
    name: "Subscription billing",
    exact: true,
  });
  await expect(billing).toContainText("Starter");
  await expect(billing).toContainText(/500/);
  await billing
    .getByRole("button", { name: "Cancel subscription", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Cancel your subscription?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Keep subscription", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  expect((await account(context.request)).subscription.cancelAtPeriodEnd).toBe(
    false,
  );

  await billing
    .getByRole("button", { name: "Cancel subscription", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Renewal canceled");
  await expect(
    billing.getByRole("button", { name: "Resume subscription", exact: true }),
  ).toBeVisible();
  state = await account(context.request);
  expect(state.subscription.cancelAtPeriodEnd).toBe(true);
  expect(state.subscription.credits.remaining).toBe(500);
  expect(new Date(state.subscription.periodEnd).getTime()).toBeGreaterThan(
    Date.now(),
  );

  // Cancellation protects future billing without removing this paid period.
  expect(
    (
      await post(context.request, "subscription/test-renewal", {
        subscriptionId,
        outcome: "paid",
      })
    ).status(),
  ).toBe(400);
  expect((await account(context.request)).subscription.credits.remaining).toBe(
    500,
  );
  expect((await post(context.request, "account/delete", {})).status()).toBe(
    400,
  );

  await billing
    .getByRole("button", { name: "Resume subscription", exact: true })
    .click();
  await expect(
    billing.getByRole("button", { name: "Cancel subscription", exact: true }),
  ).toBeVisible();
  expect((await account(context.request)).subscription.cancelAtPeriodEnd).toBe(
    false,
  );
  await billing
    .getByRole("button", { name: "Cancel subscription", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    billing.getByRole("button", { name: "Resume subscription", exact: true }),
  ).toBeVisible();
  await expect(billing).toContainText(/access.*until|ends|end of/i);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-monthly-subscription-canceled.png`,
    fullPage: true,
  });
});

test("monthly checkout and cancellation enforce ownership, consent and idempotence", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    await signIn(a);
    await signIn(b);
    const pending = await post(a.request, "subscription/checkout", {
      planId: "starter",
    });
    expect(pending.status()).toBe(200);
    const checkoutId = (await pending.json()).id;

    // Another account and an untrusted origin cannot settle this checkout.
    expect(
      (
        await post(b.request, "subscription/test-payment", {
          checkoutId,
          outcome: "paid",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(
          a.request,
          "subscription/test-payment",
          { checkoutId, outcome: "paid" },
          "https://evil.example",
        )
      ).status(),
    ).toBe(400);
    expect((await account(a.request)).subscription).toBeNull();
    expect((await account(b.request)).subscription).toBeNull();

    expect(
      (
        await post(a.request, "subscription/test-payment", {
          checkoutId,
          outcome: "paid",
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(a.request, "subscription/test-payment", {
          checkoutId,
          outcome: "paid",
        })
      ).status(),
    ).toBe(200);
    const paid = await account(a.request);
    expect(paid.subscription.credits).toMatchObject({
      total: 500,
      remaining: 500,
      reserved: 0,
      spent: 0,
    });
    expect(paid.wallet.balance).toBe(1000);
    const subscriptionId = paid.subscription.id;

    expect(
      (
        await post(b.request, "subscription/cancel", { subscriptionId })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(
          a.request,
          "subscription/cancel",
          { subscriptionId },
          "https://evil.example",
        )
      ).status(),
    ).toBe(400);
    expect((await account(a.request)).subscription.cancelAtPeriodEnd).toBe(
      false,
    );
    expect(
      (
        await post(a.request, "subscription/checkout", { planId: "premium" })
      ).status(),
    ).toBe(400);

    const input = {
      modelId: "sample-image",
      prompt: "Monthly quote ownership test",
      ratio: "1:1",
      resolution: "1024",
      fundingSource: "subscription",
      requestId: crypto.randomUUID(),
    };
    const quote = await post(a.request, "quote", input);
    expect(quote.status()).toBe(200);
    const acceptedQuote = await quote.json();
    expect(acceptedQuote).toMatchObject({
      credits: 12,
      fundingSource: "subscription",
    });
    expect(
      (
        await post(b.request, "jobs", { ...input, quoteId: acceptedQuote.id })
      ).status(),
    ).toBe(400);
    expect((await account(a.request)).subscription.credits.remaining).toBe(500);
    expect((await account(b.request)).wallet.balance).toBe(1000);

    expect(
      (
        await post(a.request, "subscription/cancel", { subscriptionId })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(a.request, "subscription/cancel", { subscriptionId })
      ).status(),
    ).toBe(200);
    expect((await account(a.request)).subscription.cancelAtPeriodEnd).toBe(
      true,
    );
    expect(
      (
        await post(a.request, "subscription/resume", { subscriptionId })
      ).status(),
    ).toBe(200);
    expect((await account(a.request)).subscription.cancelAtPeriodEnd).toBe(
      false,
    );
  } finally {
    await a.close();
    await b.close();
  }
});
