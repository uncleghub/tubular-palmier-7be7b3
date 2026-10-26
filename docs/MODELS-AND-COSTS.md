# Model verification and costing

Checked: **26 October 2026**. Verification claims below are deliberately limited to observed evidence.

## Executable catalog

| Model                       | Tasks                                                                         | Duration                                   | Aspect / actual dimensions                 | Audio | Customer cost   | Actual external cost                                |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ----- | --------------- | --------------------------------------------------- |
| Studio Canvas, local sample | demonstration of text-to-image / image-to-image UI; does not interpret inputs | none                                       | 1:1 1024×1024; 3:4 768×1024; 16:9 1024×576 | none  | 12 test credits | $0 AI provider cost; local CPU/storage not measured |
| Studio Motion, local sample | demonstration of text-to-video / image-to-video UI; does not interpret inputs | 6 or 8 seconds, encoded and probed locally | 16:9 1280×720; 9:16 720×1280               | none  | 80 test credits | $0 AI provider cost; local CPU/storage not measured |

Both are unmistakable demo samples. Uploaded references are not used to modify sample content. No upscaling, 4K/8K, AI model access or commercial generation rights are claimed. Prompt limit: 2,000 characters. Reference limit: 10 MiB, PNG/JPEG/WebP, still images, at most 40 megapixels.

## Disabled external candidates

`black-forest-labs/flux-schnell` (image) and `google/veo-3.1-fast` (video) are **research candidates, not verified launch integrations**. The latter identifier itself needs confirmation. External video duration choices are empty; do not infer six/eight-second support from the local sample. Cost and charge are `null`; enabled/verified are false. No credentials were available and no billable requests were sent.

The staged Replicate transport requires a verified immutable model version. It is not registered with the worker. Activation still needs model-specific request/response mapping, supported settings, moderation, commercial terms, geography, output retention, pricing, bounded output download into private storage, and credentialed smoke tests. Copy temporary provider media before expiry; validate image dimensions and playable video duration before settlement. Do not add arbitrary URL fetching.

## Official source evidence

Retrieved successfully through the allowed GitHub route:

- [Paddle official Node SDK README](https://github.com/PaddleHQ/paddle-node-sdk/blob/main/README.md): sandbox environment, one-time transaction creation and raw-body `webhooks.unmarshal` verification. Installed SDK **3.10.0** types were also checked. This establishes the integration shape, **not merchant eligibility or a successful API transaction**.
- [Replicate official JavaScript SDK README](https://github.com/replicate/replicate-javascript/blob/main/README.md) and [request implementation](https://github.com/replicate/replicate-javascript/blob/main/index.js): version-based predictions and reconciliation. SDK **1.4.0** source was inspected through the package registry; the final transport intentionally avoids its automatic network retries on billable submission.
- npm registry metadata supplied installed Next.js **16.4.3** and Clerk Next.js **7.9.21**; installation, type checks and production build succeeded. Official Next.js installation page could not be retrieved, so documentation verification is incomplete.

Direct official pages attempted and blocked by the environment egress proxy (HTTP 403 CONNECT denial):

- https://nextjs.org/docs/app/getting-started/installation
- https://replicate.com/black-forest-labs/flux-schnell/api
- https://replicate.com/google/veo-3.1-fast/api
- https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle

These access denials are **not** evidence of provider unavailability in Zambia. Add official documentation destinations in environment settings and repeat the research before selecting a live provider. No verified model capability/pricing or Zambia payout claim is made.

## Wallet denomination and launch pricing

Every pack costs **$0.01 per credit** before taxes: 500 credits/$5, 1,000/$10, 2,000/$20, 5,000/$50. Premium is the highest pack. Packs never imply a fixed number of outputs. Purchased balances do not expire; media retention is separate.

All monetary inputs use integer microdollars or integer cents; wallet values use integer credits. `creditCost` computes:

```
charge = ceil((provider_microdollars + processing_storage_allowance_microdollars)
              / ((1 - target_margin - variable_payment_fee_rate) * 10,000))
```

10,000 microdollars = one cent = one credit. Example **only, not measured provider pricing**: $0.02 estimated inference + $0.01 allowance, 5% fees and 60% target gross margin → ceil(8.5714) = 9 credits. The allowance must include allocated fixed checkout fees, storage, processing and expected operational costs. Allocate fixed payment fees against a conservative expected purchase size. Taxes are not revenue. Currency conversion and payout fees require actual gateway terms.

Provider price, billing granularity and output settings must be verified before setting a live charge. Price each image/video setting independently; the current sample models have fixed demonstration charges. Extend the model price table to a setting-specific matrix before introducing varying live costs. `quotes` freeze the accepted integer charge for five minutes; accepted jobs retain it permanently. Later catalog changes do not change that job's debit. Costs on jobs are **estimates**, not measured provider invoices; measured cost reconciliation remains a launch task.

Spending admission is serialized globally and checks both estimated provider microdollars/day and credit/day caps. Every admitted job counts conservatively, even failed or uncertain jobs. This does not replace a hard provider-account spending limit. No live adapter is enabled, so external billable spend is currently zero.
