# Monthly subscriptions

The owner chose monthly billing on 28 October 2026. Public paid-plan offers are now monthly subscriptions, with cancellation of future renewal in Settings. The once-only Free Preview remains 3 images and one six-second video.

## Current implementation and limits

The application implements a **local monthly-billing simulation**, not a live recurring gateway. No customer is charged, no subscription is created at a payment provider, and no bank payout is triggered. All subscription checkout/payment/cancel/resume/renewal mutations and subscription-funded generation fail closed outside demo mode. Adding a Replicate token or funding Replicate does not enable payment collection.

| Plan | Draft monthly USD price | Credits per paid month |
| --- | ---: | ---: |
| Starter | $5 | 500 |
| Creator | $10 | 1,000 |
| Pro | $20 | 2,000 |
| Premium | $50 | 5,000 |

These are draft offers, subject to actual model costs and payment-provider approval. Credits meter generation, not money, and do not guarantee a fixed output count. Each model/settings combination requires a quote. Nothing is unlimited. Unused monthly credits expire at the end of that paid period; they do not roll over. Older test-wallet balances retain their original accounting and are displayed separately. Free Preview is also separate and does not reset on renewal or cancellation.

## Customer experience

1. Pricing explains the monthly price, allowance, expiry, and intended automatic renewal. Demo checkout explicitly says no real money is charged.
2. A simulated successful initial payment creates exactly one paid monthly allowance. Failed or abandoned checkout creates none. Closing checkout records abandonment; a pending checkout also expires after 30 minutes.
3. **Use monthly credits** explicitly selects the subscription allowance. **Use credits** selects the older wallet. Exhausting an explicitly selected allowance never silently switches to another balance.
4. Settings shows the plan, paid period, remaining allowance, and cancellation status. **Cancel subscription** means unsubscribe from future billing. It preserves the current paid-through access and does not automatically refund money. A confirmation explains this before cancellation. The customer may resume renewal before the paid period ends.
5. Demo renewals happen only through an explicit simulated payment event; time passing does not invent a successful payment or grant. A failed renewal creates no new allowance. A canceled renewal cannot grant another month. Plan switching is blocked during the current paid period; no unimplemented proration is implied.
6. Deletion is blocked while recurring intent, paid-through access, a pending checkout, or reserved monthly credits remain. In this demo the customer must close checkout, cancel renewal, wait for the paid period to end, and resolve jobs. Before a real launch, implement provider-confirmed immediate billing termination for account deletion; never delete a local identity while recurring charges could continue externally.

Billing cancellation is separate from deleting an account or unsubscribing from marketing email. No marketing-email system is connected, so no fictional email-preference control is presented.

## Accounting and concurrency

- `subscriptions` stores the current plan and renewal intent; `subscription_checkouts` freezes the plan, cents, and allowance for checkout.
- `subscription_periods` records each paid monthly interval, a unique payment reference, and nonnegative available/reserved/spent counts whose sum equals the original allowance.
- `subscription_events` distinguishes local test proofs from real payment evidence. User-row locks serialize checkout, cancellation, renewal, and account deletion. Foreign ownership is rejected.
- Quotes and jobs retain an immutable `subscription_period_id`. Submission atomically reserves within the same unexpired, current paid period. A quote from a previous period cannot spend the renewed allowance.
- Settlement is idempotent. Success spends the reservation once. Confirmed failure restores the same original period, including after renewal; an expired-period release never becomes usable new-month credit. Uncertain jobs remain reserved.
- Wallet and Free Preview records are unchanged by monthly subscription payments and jobs. Migration replay preserves existing allowances and paid-period records.
- Old one-time checkout creation is closed. The older Paddle one-time sandbox adapter remains for historical code/evidence only and is **not a monthly payment integration**.

## Before live recurring payments

Select a gateway that explicitly approves the actual operator, AI-generation product, monthly usage allowance and payout bank. Implement exact recurring price validation, verified initial/renewal transactions, authoritative lifecycle reconciliation, signed/idempotent webhooks, provider-backed cancellation/customer portal, failed-payment recovery, refunds/disputes, and deletion that cannot leave charges running. Verify these with credentialed sandbox tests before a small authorized live test. Replace the demo-only guards only when those paths exist and have passed review.

Paddle is a candidate, not an approved provider. Its current [country rules](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) do not list Zambia as unsupported; this does not approve a particular business or bank. Its [acceptable-use policy](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) restricts some AI content generation and stored-value offerings, so obtain explicit product approval rather than assuming these usage allowances qualify. Its published [payout guide](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid) describes monthly bank/Payoneer payouts with a minimum threshold. Final eligibility, fees, currencies and payout terms must be confirmed for the actual account.
