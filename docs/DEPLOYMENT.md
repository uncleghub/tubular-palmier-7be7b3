# Deployment preparation

**Not deployed. Do not open real sales.** The production build was tested locally. The Docker image built and a local web/worker container smoke test passed. Managed-host provisioning, public deployment, HTTPS, S3 and credentials remain unverified.

## Suitable architecture

Use a host that runs long-lived containers or VMs: one Node web service, one continuously running Node worker, managed PostgreSQL with backups, and private S3-compatible storage. A VPS running Docker Compose behind Caddy is one practical layout. A normal serverless web function must not run the generation worker. Each worker claims one job at a time; PostgreSQL leases and `SKIP LOCKED` allow multiple replicas without claiming the same queue item.

No particular hosting vendor's account availability or payout support was verified. Docker Compose is a deployment option, not proof that a site has been published or a particular host supports your account.

## Environment and build

1. Choose hosting region, support identity, public URL, database and bucket. Configure TLS for managed PostgreSQL using the provider's certificate instructions; never disable certificate verification.
2. Store secrets securely using `.env.local` only for local development, or inject them into processes through the hosting secret manager. Use `.env.example` as a list of names. Replace the local database password outside development.
3. Build with the public `NEXT_PUBLIC_*` values and `APP_URL` already set. Public Next.js variables are embedded during the build; changing them requires rebuilding. `APP_MODE=production` uses Clerk and rejects sample generation. Missing live adapters deliberately make the production app a private preview.
4. `Dockerfile` accepts public brand, tagline, support, Clerk publishable-key and URL build arguments. Never pass private API keys as Docker build arguments. Set `APP_MODE` and all private values at runtime. Add your deployment's validated Clerk origin to `next.config.ts` CSP before using a custom identity domain; do not loosen it to wildcard all origins.
5. `compose.yaml` supplies separate web/worker services and a persistent database. Set `POSTGRES_PASSWORD` in the deployment environment. Use a URL-safe generated password or URL-encode it in `DATABASE_URL` when configuring a managed service.

Example on a prepared host with Docker Compose and a configured `.env.local`:

```sh
docker compose build
docker compose up -d database
docker compose run --rm web node --import tsx scripts/migrate.ts
docker compose up -d web worker
```

Set public build args in your host build configuration before using this with Clerk. Terminate HTTPS at a reverse proxy that forwards to the web service's local port. Configure `APP_URL` to the exact HTTPS public origin; it is used for CSRF checks. Configure the proxy with a request-body limit of 11 MiB, request timeouts and trusted client-IP forwarding. Do not expose PostgreSQL publicly. Keep the worker running across web deploys; allow it to finish in-flight work before termination. A lost lease becomes uncertain and requires reconciliation.

## Private object storage

For `APP_MODE=production`, configure `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT` and least-privilege AWS credentials. Use a **private** bucket, block public ACLs and allow only this application's object prefix. Generated names are random IDs; the API checks database ownership before returning a 60-second signed link. Set storage encryption and lifecycle deletion consistent with your policy. Configure allowed CORS origins if implementing direct browser uploads later; current uploads go through the authenticated API.

Local demonstration files live in ignored `.data/`; Docker demo web and worker share a named volume. That is not an S3 verification. Run `npm run cleanup` daily in the same environment as the worker. Set `MEDIA_RETENTION_DAYS` (default 30); it affects media, never credit expiry. Ensure backups and backup deletion policies match published retention. Run actual storage/upload/download/deletion tests before opening production.

## Authentication

Create a Clerk application, configure allowed redirect origins and verified-email registration/recovery, and store its public/private keys securely. `APP_MODE=production` activates Clerk middleware and server-side verified-primary-email checks. Set `ADMIN_USER_IDS` to explicit Clerk user IDs, comma-separated. Demo identities cannot become administrators. Test email verification, password recovery, sign-out and cross-user boundaries with real Clerk test accounts. Those tests were not run without credentials. Live identity deletion is a documented support process until provider-side identity deletion is added; do not imply the demo deletion control deletes a Clerk identity.

## Paddle sandbox only

This is an optional sandbox candidate. Zambia onboarding and payouts have **not** been verified; no live API client exists.

1. Create a Paddle sandbox account only. Configure four active **nonrecurring USD** prices: 500, 1000, 2000 and 5000 minor units, with no introductory trial or country overrides.
2. Store `PADDLE_SANDBOX_API_KEY`, `PADDLE_SANDBOX_WEBHOOK_SECRET`, and the four `PADDLE_SANDBOX_PRICE_*` IDs. Set `PADDLE_SANDBOX_CHECKOUT_ORIGIN` to your HTTPS approved default payment-page origin. The application checks the URL origin before redirecting. The approved page must load Paddle Checkout; setting up that gateway-hosted/approved payment page remains necessary. Local simulation works without this optional setup.
3. Create a webhook notification destination for `https://YOUR_HOST/api/webhooks/paddle`. Subscribe to transaction completed/canceled/payment-failed and adjustment created/updated events. Use its actual notification secret. The API verifies the raw-body signature through the official SDK. Only a verified completed transaction matching the server's one-time USD package adds credits. A browser return adds none.
4. Acknowledge successful deliveries only after database fulfillment succeeds. Failed verification/processing returns an error so delivery can be retried. Duplicate events do not duplicate credits. Delayed completed events and full reversals are handled. Partial adjustments are audited for manual review. Spent-balance refunds become review-required rather than creating debt.
5. Run a genuine gateway sandbox transaction and refund/dispute tests with the provider before calling this integration verified. No sandbox API calls were made in this task.

The default local simulator is useful for local flows but is **not Paddle test mode evidence**.

## Publication checks

Before a release: verify merchant eligibility/underwriting, exact model capabilities and commercial terms, provider hard spending caps, real S3, live authentication, webhook signatures, financial/legal/support details, backup restore, account deletion, abuse reporting and moderation. Run lint/type/tests/build and browser flows against staging. Request an explicit deployment decision with the concrete configuration if needed; no publishing account is connected here. A site is live only after a public HTTPS URL has been deployed and checked.

## Cloud build proxy

Some cloud machines require their managed HTTPS proxy and CA during Docker builds. The Dockerfile supports an optional BuildKit `proxy_ca` certificate mount; it does not disable TLS, package signatures or checksums. Forward the platform's existing `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` build arguments. In this machine Docker also needed the existing `proxy` hostname mapped to its host-resolved address; DNS in a build container did not resolve it. The CA mount is world-readable **only inside that build step** because Debian's unprivileged package downloader must read this public trust certificate; it is not copied into the runtime image. Never mount API credentials as a CA or hardcode private proxy configuration into source.
