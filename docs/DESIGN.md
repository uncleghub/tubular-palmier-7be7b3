# GEEZ AI STUDIO interface refresh

The existing application is rebranded to **GEEZ AI STUDIO** with a bright pearl-white, violet and coral visual system. Default names in metadata, the wordmark, social preview and newly created sample files use the new identity. Explicit `NEXT_PUBLIC_APP_NAME` settings still override the default; changing public values requires rebuilding. The existing Render service, branch and database resource names stay intact so the working deployment configuration is preserved.

## Interface

- Cinematic photographic-style hero and a six-scene editorial gallery: landscape, portrait, chrome sculpture, product, architecture and planetary concept art.
- Prompt-first multiline composer with image/video selection, starter prompts, Enter-key navigation, Shift+Enter new lines and a clear handoff to the existing studio quote flow.
- Filterable gallery examples prefill the image studio rather than pretending to generate an asset.
- Larger primary copy, refined form surfaces, clearer costs, polished pricing/account views and a compact mobile wordmark.
- Mobile drawer backdrop and Escape-to-close; keyboard skip link and visible focus remain available.

The gallery sprite is an original ImageGen-created visual asset, served as a 270 KiB WebP and reused through CSS positions. It is not a record of output from a connected live model. Each image is labeled as an example, with explicit disclosure in the hero, gallery and page-level demo notice. Existing demo outputs and their honest sample labels remain unchanged except for the new brand.

## Commercial scope

The product is designed for international customers and shows USD packages. Merchant onboarding/payout support depends on the operator's actual country and business, regardless of customer locations. This update does not enable a live gateway, invent merchant eligibility, or activate an unverified AI model. Package prices stay $5, $10, $20 and $50, with no subscriptions or higher tier.

## Verification

Local before/after home screenshots were captured and reviewed at 1440px desktop and 390px phone widths. The updated studios and pricing were also inspected. Type checking, lint and production build pass; 17 backend/configuration tests pass. Browser coverage includes original purchase/wallet/job/download/failure/ownership tests plus rebrand, keyboard access, mobile navigation, five-route overflow checks, gallery filters and prompt composer handoffs. See `VALIDATION.md` for final observed results.

## Bright studio direction

The user selected a brighter professional direction, referencing Higgsfield and ChatGPT. GEEZ retains its own identity and implementation: a creation-first studio, a large conversational prompt surface, four image/video task entry points and photographic-style examples. This is an original interface inspired by those workflow patterns, not a verified pixel-for-pixel clone or an affiliation claim. The light skin covers navigation, creation forms, pricing, accounts and dialogs, with violet/coral highlights and deliberate text contrast. The actual demo/provider capability boundaries are unchanged.
