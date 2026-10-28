# Operating guide

## Startup and health

Use the existing checkout; cloud tasks are already isolated. Run `bash scripts/setup.sh`, then web (`npm run start` or `dev`) and `npm run worker` in separate terminals. Startup and dependency instructions are also saved in the cloud configuration draft when available. Publication and future-machine restoration are separate product actions.

Readiness: `/api/health` must report `ok: true`; this checks PostgreSQL. Then create an actual demo job and download the expected sample. A process or open port alone is insufficient. Watch web and worker logs without dumping environment variables or prompts. Current worker logs error classes only. No credentials are printed by setup scripts.

## Wallet and quote semantics

`balance` is available credits, `reserved` is held credits. Reserving deducts available and adds held credits in one row-locked transaction. A spend removes held credits; it does not deduct available again. A release removes held and restores available. Ledger amounts are event amounts; do not sum reservation + spend as two economic debits. Unique references guard duplicate ledger changes. Balance constraints prevent overdrafts.

The API ignores browser prices and credit quantities: packages come from the server catalog. Quotes are user-owned, input-bound and expire after five minutes. Job IDs and request IDs provide idempotency. The job retains the accepted charge despite later pricing updates.

## Provider spending and model activation

`lib/catalog.ts` holds capabilities, costs and launch availability. External candidates are unavailable with null prices. `ReplicateTransport` is staged and unregistered. Funding an account or adding a token alone does not enable paid generation. Complete model-specific mapping and verification before modifying these entries; see MODELS-AND-COSTS.md.

Limits are configurable: `GLOBAL_DAILY_PROVIDER_MICROS` (default $10/day estimated exposure), `GLOBAL_DAILY_CREDIT_LIMIT`, `USER_DAILY_JOB_LIMIT`, `MODEL_DAILY_JOB_LIMIT`. All admitted work counts conservatively against daily usage. Provider-estimated costs must be bounded by the selected settings; unpredictable costs require a worst-case bound. Set the provider's own hard account limit too. Test limit values in staging. Global admission checks use a database advisory lock so concurrent users cannot bypass the budget.

Admins can immediately pause all generation or a model using `/admin`; only explicit `ADMIN_USER_IDS` pass server authorization, and demo users are always denied. Quotes are also rejected at submission if paused. The worker rechecks the breaker before preparing a sample and releases paused jobs. When integrating live workers, preserve that check immediately before billable submission and implement provider cancellation where supported. The pause screen must not be presented as stopping already-submitted provider work.

## Uncertain outcomes

A lost worker lease is marked `uncertain`; held credits remain held. There is no automatic resubmission and no silent fallback model. A successful external submission must persist its prediction ID before polling; the current external transport is not yet wired into that state machine. Without a prediction ID after a timeout, consult the provider dashboard/request logs before making a refund or another billable call.

For locally uncertain demo jobs, an operator can confirm no external work exists and release the reservation using the audited reconciliation procedure in a development script calling `finishJob`. Production admin reconciliation intentionally refuses to claim that a provider outcome has been confirmed. Finish the live reconciliation tooling when integrating the launch provider.

## Refunds and disputes

Only verified successful payment events fulfill a purchase. Duplicate events and duplicate refunds are no-ops. Full refund/dispute events reverse available credits once. If already spent, the purchase is flagged `review_required` and audited; an operator must reconcile with the gateway rather than create a negative wallet. Partial adjustments are separately audited and require manual review. No automatic money refund is initiated by this application.

## Admin and reporting

The protected admin page exposes customers, purchases, ledger, jobs, failures, estimated provider costs, settings and audit rows (up to 200 each). It permits reason-required credit adjustments and model/global pause actions. Aggregate cards show customers, test purchase totals, live revenue (currently zero), estimated provider costs, estimated margin before fees, failed and uncertain jobs. It does not claim measured provider invoice reconciliation or a complete accounting system. Test purchases are not real revenue.

## Retention, support and brand

Configure `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_TAGLINE`, `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_ACCENT` at build time; brand shell, metadata and support copy must be reviewed after changes. The wordmark falls back to the configured name when changed; review the local illustrations if rebranding. No company address, testimonials or customer metrics are invented.

Run `npm run cleanup` daily. It deletes expired output objects and unused expired references, then clears expired quotes/rate-limit rows. It never changes legacy wallet balances. Monthly allowances become unusable at their paid-period end through admission checks; they are not rolled over or deleted. Account deletion removes references, output files and prompts while retaining financial records. Resolve active/uncertain jobs and monthly subscription/pending-checkout restrictions first. Configure an actual support/abuse address before accepting customers and a legally reviewed financial record retention schedule before collecting money.

## Data and recovery

Use PostgreSQL backups and test restore. Local setup stores data in a Docker volume/container; do not assume a process, container or volume survives a new cloud machine. Saved installation recreates an empty local development database if absent. Never use the local example password for a public database. Protect private media, encryption keys and signed download URLs. Do not enable public sharing without explicit customer consent.

## Free Preview operations

See `FREE-PREVIEW.md`. Free allowances and events are separate from the wallet ledger; free jobs have zero actual credit debit and retain list-price credits for conservative caps. Upgrade every worker before enabling the live flag, apply all migrations, and preserve existing one-time grants across deploys. Inspect `free_preview_allowances` / `free_preview_events` in the admin view for reserved/used units. Do not manually reset an uncertain unit before confirming the provider outcome.

## Monthly subscription operations

See `SUBSCRIPTIONS.md`. All current monthly payments and renewals are explicit local simulations. No actual gateway charges or scheduled payments are made. Inspect `subscriptions`, `subscription_periods`, `subscription_checkouts` and `subscription_events`; never count test events as live revenue. The old one-time public checkout is closed. A monthly paid period is granted once per payment reference, separate from the old wallet and free units. Cancel stops future renewal, paid access ends at `period_end`, and expired quotes cannot spend a later period. Late failure releases stay in the original period. Upgrade web and worker together before admitting subscription-funded jobs; older workers do not understand this funding source. The combined Render demo launcher upgrades both. Do not enable real recurring payments until provider approval, signed lifecycle/renewal webhooks, cancellation, reversals and account-deletion termination have been implemented and tested.
