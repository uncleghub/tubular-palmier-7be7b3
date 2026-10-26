# Render demonstration: first-time setup

This publishes a **sample-only demonstration**, not a paid AI service. Never put real card or API-generation credentials into this demo. A free web service can sleep when idle, and its local sample files can disappear on restart. Review Render's database availability/expiry information on its signup screen. Free web hosting is not a promise of a permanently free database or production suitability.

## Web service settings

Use the existing GitHub repository `uncleghub/tubular-palmier-7be7b3`.

| Box             | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| Name            | `graham-unlocked-demo` (choose another name if unavailable) |
| Language        | Docker                                                      |
| Branch          | `graham-studio-demo`                                        |
| Region          | Oregon, matching the database                               |
| Root Directory  | Leave empty                                                 |
| Dockerfile Path | `./Dockerfile`                                              |
| Compute         | Free, $0 (as offered on the current setup screen)           |

Leave the web setup tab open while creating the database in a second tab. Do not deploy until both configuration steps below are complete.

## Database

In Render, choose **New + → Postgres / PostgreSQL**. Name it `graham-demo-db`, keep the same region, and choose a **Free** option only if one is offered. Read any expiry notice. If there is no free option, stop and review the cost before creating a paid database.

After creation, use the database's **Internal Database URL** in the web service's environment settings. This URL contains a password. Paste it into Render only; never paste it in chat, GitHub, or a screenshot.

## Finish the web setup

Add environment variables:

| Key            | Value                                 |
| -------------- | ------------------------------------- |
| `APP_MODE`     | `demo`                                |
| `DATABASE_URL` | Your database's Internal Database URL |

Open **Advanced** and set **Docker Command** to:

```text
npm run demo:host
```

If there is a Health Check Path box, set it to `/api/health`. Keep the instance on Free. Then use **Deploy web service**. Open Render's assigned HTTPS address only after the deployment is marked Live.

The demo launcher applies database migrations, derives the public origin from Render's `RENDER_EXTERNAL_URL`, and supervises a web process plus one sample worker in this single demonstration container. It requires explicit `APP_MODE=demo`. Either child stopping terminates the other so the host can restart the full demonstration. This is a demo-only exception to the separate production worker deployment.

If Render does not supply `RENDER_EXTERNAL_URL`, set `APP_URL` to the exact assigned HTTPS site origin and restart. Do not use a local-machine URL in cloud hosting.

## Test the website

1. Open the Render site address.
2. Select **Sign in → Enter demo workspace**.
3. Open Image studio, write a prompt and confirm the displayed test-credit quote.
4. Wait for the labeled sample, then download it.
5. Try Video studio with six or eight seconds. Free CPU can be slow.
6. Pricing uses a local payment simulation. It does not charge a card or create real AI media.

Real customers require the verified provider, merchant, authentication, private storage and production deployment steps in `LAUNCH.md`. A successful Render demo is not proof of Zambia payout eligibility or live AI access.
