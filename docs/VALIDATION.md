# Validation evidence

Date: 26 October 2026. Current machine only; no new-task snapshot or public deployment validation.

- npm frozen-lockfile install: executed (final repeatability result updated below).
- PostgreSQL 17 Alpine: local container started, migration executed and reapplied successfully.
- TypeScript check: passed during implementation; final run recorded below.
- ESLint: passed after resolving effect and routing warnings; final run recorded below.
- Next.js production build: passed during implementation; final run recorded below.
- Backend tests: 15 tests covering integer costing, model validation, concurrent spending, quote locking/ownership/expiry, duplicate submissions/settlement/payment/refund, spent-credit reversal review, lost leases, failure release, stale/tampered signatures, delayed/reordered events, single billable submission and read-only reconciliation. Final result recorded below.
- Browser tests: desktop 1440×1000 and phone 390×844. Four tests passed during implementation. Flows: demo session, $5/500-credit simulated purchase, image quote/reserve/download, eight-second video sample/download, failed job release, 1,408-credit final available balance, admin denial, CSRF denial and private workspace isolation. Final rerun also exercises six-second video on mobile and cross-account access to an actual completed output.
- Screenshots: `test-results/desktop-discover.png`, `mobile-discover.png`, `desktop-image.png`, `mobile-image.png`. Visually inspected for the two discover layouts.
- FFmpeg/FFprobe: invoked by the worker to encode and validate playable sample durations. Samples are not live AI outputs.
- Cleanup: executed; no expired objects were present in the first local run.

Not run/verified: live AI requests, provider-specific model capabilities/terms/prices, actual gateway sandbox requests, Zambia underwriting/payout, real Clerk recovery/verification, S3 storage, public HTTPS deployment, measured provider invoice costs. There are no live customers, charges, testimonials or deployment claims.

## Final observed run

- `bash scripts/setup.sh`: passed, including frozen `npm ci`, repeated migration, TypeScript, **15/15 isolated backend tests** and production build.
- `npm run lint` and `npm run typecheck`: passed with no source warnings/errors.
- `npm run test:e2e`: **4/4 passed** in 22 seconds after the final web restart; six-second sample video on phone and eight-second sample video on desktop, real cross-account media denial, reference ownership, invalid uploads and failed payments included.
- `npm run smoke`: passed against the restarted production web build and separate worker, including private sample download and deletion.
- `npm run cleanup`: passed (0 expired outputs/references present).
- Runtime dependency audit: **0 reported vulnerabilities**. This is registry audit evidence, not a security certification.
- Original tracked `index.html`: unchanged; all application files are additions.
- Cloud configuration draft: saved `install_script`, `start_skill`, and official-documentation/network destinations, preserving known existing destinations. Draft persistence is confirmed; runtime application, publication and new-machine restoration are not claimed.

Toolchain compatibility: Next 16.4.3, React 19.3.1, Clerk 7.9.21, PostgreSQL 17, Node 24 and TypeScript 6.0.3. TypeScript 7 was tried but Next's TypeScript ESLint integration rejected its compiler API. ESLint 9.39.5 is retained because Next's current import/react/accessibility plugins declare peers through v9; npm reports this older major as deprecated. No verification bypass or peer-dependency force flag is used. Revisit those developer-tool pins when upstream plugins support the latest majors.

Container verification: `graham-studio:local` built successfully (image SHA-256 `c8fa65e177282c05fc6114ab20ba6584025ad5932743c55415cd9a399769139c`). A separate non-root web container and worker container shared a private media volume and passed `npm run smoke`: database health, temporary demo sign-in, quote, reserve, queued worker output, settlement, private download and deletion. Test containers/volume were removed afterwards. This verifies local container operation, not a deployed public site or managed-host account.

## Render demo launcher follow-up

Added a demo-only combined launcher for a single web instance, since Render's displayed Free web tier does not supply a separate persistent worker or disk. It derives the request origin from `RENDER_EXTERNAL_URL`, migrates PostgreSQL before startup and supervises the two child processes. Sample video encoding is limited to one encoder thread to reduce memory pressure.

Observed follow-up checks: typecheck and lint passed; **17/17** backend/configuration tests passed; production build passed; `npm run smoke` passed against `npm run demo:host`; **4/4** desktop/mobile browser tests passed in 24.3 seconds using that launcher, including six/eight-second video samples. This does not establish actual Render deployment success or a measured memory/CPU guarantee on its Free tier. Official Render documentation could not be fetched through the environment proxy; the setup guide uses the user's actual displayed service form and instructs checking database pricing/expiry before creation.

## Render certificate setup correction

A Render deployment reported exit 100 in the HTTPS apt installation step. A direct check of the official slim base confirmed its system CA bundle was missing. Added an independent stage exporting the public roots bundled with official Node into the runtime before HTTPS apt operations. Local Docker rebuild passed, including package installation and the Next.js production build. Runtime checks confirmed the system CA bundle, FFmpeg and FFprobe are present for the non-root application user. Render's own deployment must still be retried and observed; local success does not establish that the hosted service is live.

## GEEZ AI STUDIO visual refresh

Rebranded customer-facing defaults, generated sample labels, metadata, social preview, downloads and application package identity. Added a cinematic hero, an original photographic-style example gallery, image/video prompt composer, gallery filters and refined mobile navigation and typography. Examples remain explicitly separate from demo results; live models and payments remain disabled.

Observed final checks: **17/17 backend tests**, **8/8 browser tests** (desktop and 390px phone, 46.1 seconds), ESLint, TypeScript, production Next.js build and Docker image build all passed. Browser checks include Image/Video composer handoffs, keyboard Enter, gallery filters, mobile GEEZ wordmark, Escape/backdrop drawer close, five-route overflow, and the existing payment/wallet/generation/failure/download/security flows. `npm run smoke` passed on the supervised demo host. The Docker image's default-brand home and gallery asset each returned HTTP 200. Local screenshots were reviewed for desktop and phone home, studio and pricing layouts. Public Render deployment of this revision still requires observing its build/Live status; workspace egress does not independently verify that host.

## Bright studio update — 27 October 2026

Implemented the requested light, professional direction with pearl-white surfaces, violet/coral accents, a prompt-first multiline composer, four image/video workflow entry points and matching favicon/social preview. Real provider activation and payment availability are unchanged.

Observed checks: ESLint, TypeScript and production build passed. All **8 desktop/mobile browser tests passed in 33.1 seconds**, including Shift+Enter preserving a newline, Enter handing the multiline prompt to the image studio, Image/Video mode handoff, gallery filtering, mobile navigation, private downloads, test credit purchases, confirmed-failure release and authorization checks. Local desktop/phone screenshots of home, image studio and pricing were captured and visually inspected; no clipping or horizontal overflow was found. The 17 existing backend tests passed in the preceding interface revision and their implementation is unchanged by this appearance update. Public Render rollout must still be observed separately.

The corresponding `geez-studio:bright` Docker image also built successfully with the existing certificate-verification setup. No hosting service, payment mode or provider credential was added.

## Bold obsidian typography — 27 October 2026

Replaced the light skin with an obsidian/charcoal and violet theme while preserving the prompt-first layout. Added self-hosted, OFL-licensed Manrope Variable and genuine 800-weight headings, with 700–800 controls and 600–650 support copy. Removed the serif/italic headline styling and updated dark browser/social metadata.

Observed verification: lint, TypeScript and production build passed. Existing **8/8 desktop/mobile browser tests passed in 34.2 seconds**. At1440px and390px on home/image/video/pricing, computed styles show `Manrope Variable`, headings at800 with normal style, and body background rgb(14,17,27). The actual locally served WOFF2 returned HTTP200 and the800-weight font readiness check passed. No white form/card/navigation surfaces or horizontal overflow were detected. Desktop/mobile screenshots were visually reviewed for bold type, dark surfaces and clipping.

The `geez-studio:obsidian` Docker image built successfully with frozen dependency installation, locally bundled fonts and the normal production build.

## One-time Free Preview — 27 October 2026

Added3image/1six-second-video lifetime allowances, distinct from wallet credits. Server quotes bind zeroactualdebit/funding, jobs freeze their normal list price and media type, and separate allowance events record atomic reservations/settlement. Catalog allowlists, the six-second restriction, verified-account authorization in production, global caps and explicit live activation gate remain enforced. Failed confirmed outcomes restore units once; uncertain outcomes remain held.

Observed results: **33/33 backend tests** and **10/10 desktop/mobile browser tests** passed. New coverage includes concurrent admissions, duplicates, exhaustion without wallet fallback, quote ownership/funding tampering, failed-job restoration, uncertain reconciliation, daily caps, disabling free after quote, model allowlists, frozen media type after retirement and invalid budget configuration. Legacy wallet/purchase/security flows still pass with explicit Use credits selection. TypeScript, ESLint and production build passed. Numbered transactional migrations were applied repeatedly, including after zero-credit free jobs existed, without resetting balances or allowances.

The initial local Docker attempt exhausted disk space occupied by earlier task-generated image/build caches. Only those unused task artifacts were removed; PostgreSQL containers/volumes and repository files were preserved. The rebuild passed. A fresh isolated-schema container startup then applied all migrations, completed a free image and6second video, served private downloads, retained the1000testcredit balance, recorded remaining2images/0videos, and completed account deletion. Its generated test container and schema were removed. No real provider or payment charge was made. Local free-pricing and zero-quote screenshots were reviewed at desktop/phone widths. Public Render rollout is a separate owner-observed step.
