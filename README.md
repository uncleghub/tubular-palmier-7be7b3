# Graham Unlocked AI Studio

Create images. Generate videos. Unlock your ideas.

A TypeScript / Next.js application with a responsive navy-and-orange studio, PostgreSQL wallet and durable queue, a separate worker, private media access, Clerk integration, and an optional Paddle **sandbox** adapter.

**Delivery status: working local demonstration, not a finished commercial launch.** No live AI model has been verified or enabled. Default checkout is a local signed-event simulation, not a gateway sandbox. No real money is collected. No deployment was performed. Read [launch blockers](docs/LAUNCH.md) before configuring external services.

The pre-existing `index.html` personal landing page is preserved unchanged. Next.js serves the new application from `app/`.

## Run locally

Requirements: Node 24, npm 11, Docker, FFmpeg and FFprobe on PATH. From this checkout:

```sh
bash scripts/setup.sh
npm run start
# In a second terminal, from this same directory:
npm run worker
```

`setup.sh` installs the locked dependencies, preserves an existing `.env.local` or creates it from the secret-free example, starts a local PostgreSQL container, applies repeatable migrations, runs isolated database tests and type checks, and builds the production application. Use `npm run dev` instead of `start` when editing. Do not create another worktree for a cloud task; use this checkout.

The database listens only on the local interface. Its documented password is for local development only. The setup helper assumes the example local database configuration; if you already use a managed `DATABASE_URL`, start that database instead and run `npm ci`, `npm run db:migrate`, and the checks manually.

Click **Sign in → Enter demo workspace** to receive 1,000 test credits in a private seven-day browser session. Choose a pack under Pricing to simulate successful or failed payments. Demo image jobs create an original SVG illustration, not AI output. Demo video jobs create a silent 720p FFmpeg test pattern, at exactly six or eight seconds, validated with FFprobe. Reference uploads are validated and privately stored but do not alter demo samples. Enter the exact prompt `[simulate failure]` to exercise a confirmed failure and credit release.

## Included screens

Discover/home, image and video studios, pricing ($5/$10/$20/$50 one-time packs), overview, media library, purchase history, settings/deletion, help, draft terms/privacy/refund/acceptable-use policies, sign-in/sign-up, and a server-role-protected admin area. Search metadata, robots rules and sitemap are included. Examples are local original illustrations clearly labeled as examples.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
# With web and worker running:
npm run test:e2e
npm run cleanup
npm run smoke
```

Backend tests create and drop an isolated PostgreSQL schema; the normal worker cannot consume their jobs. Browser tests require Chromium at `/usr/bin/chromium`; change `playwright.config.ts` to your browser installation elsewhere. Browser tests use a real database, web server and worker but **mock/local provider outputs and simulated payments**. They do not prove live AI, Clerk, Paddle, S3, merchant approval or payout functionality.

## Architecture

- `app/`: server-rendered shell, client studio and validated API routes.
- `lib/catalog.ts`: capability validation; unavailable external candidates fail closed.
- `lib/wallet.ts`: row-locked balances, frozen expiring quotes, idempotent reservations/settlement, payment fulfillment, refunds and reversals.
- `migrations/001.sql`: database constraints, ledger, purchases, queue, uploads, audit and limits.
- `scripts/worker.ts`: durable PostgreSQL queue using `FOR UPDATE SKIP LOCKED`, leases and uncertain outcomes. Runs outside web requests.
- `lib/storage.ts`: local ignored demo media; private S3-compatible storage and 60-second links outside demo mode.
- `lib/replicate-adapter.ts`: staged, unregistered transport; one billable submission, read-only reconciliation. No verified live model adapter is registered.
- `lib/paddle-sandbox.ts`: optional hosted test checkout and SDK-verified signed webhook handling. Live mode is intentionally absent.
- `tests/`: database and desktop/mobile browser checks.

## Documentation

- [Deployment and storage](docs/DEPLOYMENT.md)
- [Models, verification evidence and pricing formula](docs/MODELS-AND-COSTS.md)
- [Operations, support, refunds and spending controls](docs/OPERATIONS.md)
- [Outstanding launch prerequisites](docs/LAUNCH.md)
- [Observed verification results](docs/VALIDATION.md)

No domain, hosting account, provider funds or live checkout was purchased or opened. Add actual secret values through your host's secret manager, never source control or chat.
