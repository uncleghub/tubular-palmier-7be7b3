# Free Preview

GEEZ includes a one-time allowance of **3 images and 1 six-second video per verified account**. This is separate from the four one-time credit packages. It is not a subscription, daily refill, wallet top-up or a promise of unrestricted models. No card is required to use the allowance.

## Current demonstration

`APP_MODE=demo` enables sample-only Free Preview with the local image/video sample models. Browser demo sessions are temporary and are not verified customer identities. Their 1,000 test credits have no cash value and are separate from the 3+1 allowance. Creating another demo session is allowed for testing; no real AI provider is called. This does not prove real signup abuse prevention or live generation availability.

After sign-in, eligible studio settings default to Free Preview. Customers can explicitly choose **Use credits**. The quote states **0 credits** for a free job. Selecting free with unsupported settings or an exhausted allowance blocks submission. Choosing credits requires a fresh quote and confirmation; the server never silently falls back to the wallet.

Free video is restricted to six seconds on an eligible model. Eight-second video remains available through a normal credit quote in the demo. Free media is private and follows the same media retention/download ownership rules.

## Accounting and concurrency

- `free_preview_allowances` holds a unique row per account, lifetime limits, used counts and held counts. Repeated account access does not reset it.
- `quotes` bind the account, all accepted settings and funding source. Free quotes charge zero but retain the model's list-price credits for conservative admission accounting.
- A generation transaction locks the account, checks global exposure and atomically reserves one free unit. Parallel requests cannot exceed three images or one video. Duplicate request IDs return the same job.
- `jobs.funding_source` distinguishes wallet/free jobs. `credits` is the actual customer debit (zero for free); `list_price_credits` preserves its normal credit equivalent. `media_kind` freezes which allowance is reserved, independently of later catalog changes.
- Success converts held units to used units once. A confirmed failure releases once. Uncertain provider outcomes keep the unit held until reconciled; there is no automatic billable resubmission.
- `free_preview_events` records reservation, spend and release with unique references. Wallet balances, purchased credits and the money ledger are untouched by free jobs. Admin views include allowance and event records.
- Account deletion does not delete the one-time grant/audit record. Prompts and media are removed through the normal deletion flow. Existing identities cannot regain a new allowance by refreshing or signing out/in.

## Spending controls

`FREE_PREVIEW_DAILY_JOB_LIMIT` defaults to 100 admitted free generation attempts per UTC day across the service, not 100 per person. Failures and uncertain attempts still count conservatively against that daily cap. User allowances are restored on confirmed failure; global daily exposure is not reset by that refund. A rejected capacity check does not consume the quote or user allowance.

Free work also counts against the ordinary per-user, per-model, daily credit-equivalent and estimated provider-dollar caps. Limits are serialized across concurrent users. Invalid numeric configuration fails closed instead of disabling a cap. The existing global/model circuit breaker also stops free submissions and releases queued work paused before processing. Set the provider's real hard spending cap before enabling any billable model.

A free customer's service cost is estimated as `3 × image cost + 1 × six-second video cost + storage/processing allowance`, plus fraud/abuse allowance. It is a marketing subsidy, not zero operational cost. No live price, margin or funding estimate is asserted until the provider's actual commercial prices are verified. Begin with three images; consider five only after measuring cost and conversion.

## Live activation prerequisites

1. Upgrade the web service **and every worker** to this version before enabling free jobs. An old worker does not understand separate allowance settlement. The current single-service Render demo restarts both processes together.
2. Apply all migrations with `npm run db:migrate`. The migration runner is transactional, serialized and repeatable, and preserves existing paid balances/purchases/jobs. It applies numbered SQL files in order.
3. Configure and test real verified-email authentication. Production `userId()` rejects an unverified primary email before account APIs/allowance access. Multiple identities, email abuse and automated signups still require appropriate identity-provider controls and operational monitoring; one account does not mean one human.
4. Complete the actual model adapters and provider credentials, verified commercial/geographic terms, setting-specific cost bounds, output storage/validation, moderation and reconciliation. A missing/unverified/unpriced model remains ineligible. Free video eligibility requires documented six-second capability.
5. Set `FREE_PREVIEW_IMAGE_MODEL_ID` and `FREE_PREVIEW_VIDEO_MODEL_ID` to verified enabled catalog IDs. Defaults select sample models only in demo mode. Production has no fallback model.
6. Set conservative provider and free daily limits. Only then set `FREE_PREVIEW_ENABLED=true` in the hosting secret/environment settings. With `APP_MODE=production`, this flag defaults to off. `FREE_PREVIEW_ENABLED=false` disables it in either mode without erasing historical counters.
7. Run real funded smoke tests only after the owner approves that spend. No live inference calls or charges were made for this feature.

Change `lib/free-plan.ts` to change the public offer/new account limits. Existing grants intentionally keep their stored limits; any retroactive change needs a deliberate reviewed migration. Never reset all counters during deployment or tie them to a recurring payment.
