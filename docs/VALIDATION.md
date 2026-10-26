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
