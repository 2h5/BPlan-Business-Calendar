# RevenueCat + Stripe Web Billing Setup

Status: **Sandbox catalog, hosted checkout, webhook, and identified web billing
integration are configured; provisional legal pages are published. Final legal
documents and production billing remain intentionally blocked.**

Last verified: **2026-09-09**

## Pause checkpoint — 2026-09-09

Billing work is intentionally paused before the real sandbox purchase test.
The web app currently has a billing section inside Settings, not a standalone
purchase page. The RevenueCat sandbox catalog, hosted link, webhook, and
identified web billing seam are configured, and the webhook TEST event has
returned 2xx without granting access. No monthly or annual sandbox purchase
has yet been completed.

Cloudflare Pages remains configured for manual deployment with sandbox billing;
automatic deployments remain disabled. The latest local web billing changes
and ACL migrations are not committed or deployed. Production checkout remains
blocked by the unresolved seller identity and final legal-document flags.

This runbook records the current billing decision and the steps needed to take
BPlan: Business Calendar from the Stripe sandbox to a tested production web
checkout. It intentionally contains no passwords, API keys, webhook secrets,
or provider refresh tokens.

## Billing decision

The current release uses web billing only:

- Billing engine: **RevenueCat Billing**
- Payment gateway: **Stripe**
- Apple App Store: not configured
- Google Play: not configured
- Currency: USD
- Monthly plan: **$4.99/month**
- Annual plan: **$49.99/year**

RevenueCat Billing hosts the web checkout and uses Stripe as the payment
gateway. Apple and Google products are not needed for this web-only path.

## Accounts and dashboard configuration

These identifiers are safe project references, not secrets.

| Item                          | Current value                                   |
| ----------------------------- | ----------------------------------------------- |
| RevenueCat project            | `BPlan: Business Calendar`                      |
| RevenueCat project ID         | `d455e7e9`                                      |
| Stripe account                | `BPlan: Business Calendar sandbox`              |
| Stripe account ID             | `acct_1UDZowDPPGgNSwlS`                         |
| RevenueCat Billing web config | `BPlan: Business Calendar (RevenueCat Billing)` |
| Web config ID                 | `app48a77253da`                                 |
| Default currency              | USD                                             |
| RevenueCat support email      | `info.bplanai@gmail.com`                        |

The Stripe sandbox is linked to the RevenueCat project. Production Stripe must
be configured separately before customer purchases are enabled.

### Entitlement

The application and Supabase database use this exact entitlement identifier:

```text
pro
```

The dashboard also contains an auto-created onboarding entitlement named
`bplan_business_calendar_pro`. That entitlement is not the application
entitlement. Do not use it for the app's Pro gate unless the code and database
contract are intentionally changed together.

### Products

| Product identifier  | Display name      | Billing interval |  Price | Entitlement |
| ------------------- | ----------------- | ---------------- | -----: | ----------- |
| `bplan_pro_monthly` | BPlan Pro Monthly | Monthly          |  $4.99 | `pro`       |
| `bplan_pro_yearly`  | BPlan Pro Yearly  | Yearly           | $49.99 | `pro`       |

Both products use the customer-facing name `BPlan Pro` and the description
`Full access to BPlan Business Calendar.`

### Offering

| Item                | Value                               |
| ------------------- | ----------------------------------- |
| Offering identifier | `bplan_web`                         |
| Display name        | `BPlan Pro Plans`                   |
| Offering ID         | `ofrng560c7ad85b`                   |
| Annual package      | `$rc_annual` → `bplan_pro_yearly`   |
| Monthly package     | `$rc_monthly` → `bplan_pro_monthly` |

## What is already implemented in the repository

The RevenueCat webhook and entitlement mirror were introduced in:

```text
Commit: 5e1e01d feat(subscriptions): add RevenueCat webhook and entitlement mirror
```

That commit is now integrated into `main`.

The backend includes:

- `supabase/functions/revenuecat-webhook/`
- The `subscription_events` ledger
- Idempotent, order-safe entitlement updates
- RLS-protected subscription data
- Handling for purchases, renewals, cancellations, expirations, pauses, and
  transfers
- Zod validation for RevenueCat webhook payloads

The webhook expects:

- `POST` requests
- `Authorization` equal to the configured
  `REVENUECAT_WEBHOOK_SECRET`
- `app_user_id` equal to the signed-in Supabase user's UUID
- The application entitlement identifier `pro`

Anonymous RevenueCat IDs are intentionally ignored until RevenueCat associates
the purchase with a signed-in Supabase user.

## Remaining setup, in order

### 1. Publish a public Terms & Conditions page

A custom domain is not required. Cloudflare Pages can provide a public
production URL such as:

```text
https://<cloudflare-project>.pages.dev/terms.html
```

Use the stable production `pages.dev` address, not a temporary preview URL.

The repository now contains provisional public drafts at:

```text
apps/web/public/terms.html
apps/web/public/privacy.html
```

Vite copies these files to `apps/web/dist/terms.html` and
`apps/web/dist/privacy.html` during the web build. Both pages intentionally show
TBD values and a draft warning. They must not be treated as final legal documents
or used to enable production checkout.

The corresponding short decision sheet is
[`docs/legal-business-decisions.md`](legal-business-decisions.md).

Before publishing the page, confirm the legal/business details:

- Legal or business name
- Country/state or other governing jurisdiction
- Effective date
- Monthly price: $4.99
- Annual price: $49.99
- Automatic renewal terms
- Cancellation instructions
- Refund policy
- Support email: `info.bplanai@gmail.com`
- Link to the Privacy Policy, if available

This document is an implementation checklist, not legal advice. The terms
should be reviewed for the business and jurisdictions where the service will
be sold.

### 2. Deploy the Terms page with Cloudflare Pages

For the current Vite monorepo, configure the Pages project as follows:

| Cloudflare Pages setting | Value            |
| ------------------------ | ---------------- |
| Repository root          | Repository root  |
| Framework preset         | Vite             |
| Build command            | `pnpm build:web` |
| Build output directory   | `apps/web/dist`  |
| Node.js                  | 20 or newer      |

For the full web application, configure these browser-safe variables in
Cloudflare Pages:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_ENV=production
```

Only values prefixed `VITE_` belong in the browser build. Never add a Supabase
service-role key, RevenueCat secret, Stripe secret key, OAuth client secret, or
provider refresh token to Cloudflare Pages.

After deployment:

1. Open `https://<cloudflare-project>.pages.dev/terms.html` in an incognito
   window.
2. Confirm it loads without authentication.
3. Copy the public URL.

### 3. Create the RevenueCat hosted purchase link

Create a sandbox link for testing only after the public Terms URL is available.
Do not create or distribute a production purchase link while the seller
identity or final legal documents remain unresolved.

In the RevenueCat project:

1. Open **Funnels → Purchase Links**.
2. Click **Create a web purchase link**.
3. Fill the form with these values:

   | Field                    | Value                                           |
   | ------------------------ | ----------------------------------------------- |
   | Internal name            | `BPlan Web Checkout`                            |
   | Offering                 | `BPlan Pro Plans` / `bplan_web`                 |
   | Web config               | `BPlan: Business Calendar (RevenueCat Billing)` |
   | Paywall                  | Display default paywall                         |
   | Header                   | `Choose your BPlan plan`                        |
   | Subheader                | `Get full access to BPlan Business Calendar`    |
   | Terms & Conditions URL   | The deployed Cloudflare `terms.html` URL        |
   | Success                  | Show default success page                       |
   | Repeat purchase behavior | Show the success page                           |

4. Leave product descriptions off for now because both products already have
   the same general description.
5. Click **Save**.

RevenueCat's purchase-link documentation requires a Terms & Conditions URL and
allows the default package-selection page to use the products in the selected
offering.

### 4. Copy and test the purchase URL

After the purchase link is saved:

1. Open the new purchase link under **Funnels → Purchase Links**.
2. Click **Share URL**.
3. Copy the **Sandbox URL**.
4. Test with Stripe test cards in the Stripe sandbox.

Do not send the sandbox URL to customers. It is for testing only. A production
URL becomes available after the live Stripe configuration is connected.

For a logged-in customer, the checkout URL must identify the customer with the
URL-encoded Supabase user UUID. Use one stable Supabase UUID per customer. Do
not substitute an email address, display name, or a newly generated ID.

### 5. Deploy and connect the RevenueCat webhook

The Supabase function is already in the repository but still needs to be
deployed to the hosted Supabase project.

1. Link the Supabase CLI to the correct hosted project.
2. Set `REVENUECAT_WEBHOOK_SECRET` in the Supabase Edge Function secret store.
3. Deploy the function:

   ```bash
   supabase functions deploy revenuecat-webhook
   ```

4. In RevenueCat, configure the webhook integration with the hosted function
   URL:

   ```text
   https://<supabase-project-ref>.supabase.co/functions/v1/revenuecat-webhook
   ```

5. Configure RevenueCat's `Authorization` header with the same secret value
   stored in Supabase.
6. Send RevenueCat's test webhook and confirm the function returns a 2xx
   response.

Never put the secret in Git, a client `.env` file, a Cloudflare browser
variable, or a chat message.

### 6. Wire the application to RevenueCat

The web app's Settings billing section now reads the safe subscription projection
through a user-scoped TanStack Query API/hook, opens an identified hosted sandbox
checkout link, and offers an explicit access-status refresh after checkout. The
checkout URL uses the signed-in Supabase auth UUID as the RevenueCat App User ID.
This is a billing seam for testing, not a standalone purchase page or completed
customer purchase experience. Checkout is disabled by default and production is
blocked unless seller-identity and final-document confirmations plus public Terms
and Privacy URLs are present.

The implementation also:

- Uses the `pro` entitlement for the Pro experience.
- Keeps entitlement reads in the owning app's TanStack Query API/hook.
- Keeps provider calls out of React route and page components.
- Never trusts a client-only `isPro` flag for server authorization.
- Separates subscription query cache entries by authenticated user ID.

The mobile RevenueCat SDK, purchase/restore flow, and customer-facing paywall
remain future work. The current release decision is web billing only; Apple and
Google products are not configured.

The server-side AI gate already checks the persisted `pro` entitlement through
the database function `has_active_entitlement()`.

## Sandbox acceptance test

Run this test after the purchase link and webhook are deployed:

1. Sign in to the web app with a real test account.
2. Open the sandbox checkout URL using that account's Supabase UUID.
3. Purchase the monthly plan with a Stripe test card.
4. Confirm RevenueCat records the customer and `pro` entitlement.
5. Confirm the RevenueCat webhook returns 2xx.
6. Confirm one `subscriptions` row exists for the test user's UUID with:
   - `provider = revenuecat`
   - `entitlement = pro`
   - `status = active`
7. Confirm the app's Pro-gated action succeeds.
8. Cancel the subscription in the Stripe sandbox.
9. Confirm access remains active until the paid period ends.
10. Confirm expiration changes the mirrored entitlement to expired.
11. Repeat the test with the annual plan.

Also verify duplicate webhook delivery does not create duplicate subscription
rows or change the result incorrectly.

## Verification commands

Run the normal workspace checks before merging:

```bash
pnpm verify
```

For backend or migration changes, also run:

```bash
supabase test db
pnpm db:types
```

The RevenueCat backend commit passed its focused Deno tests, database/RLS
checks, generated-type checks, and git-diff checks. The current focused webhook
run passes 18/18 Deno tests. The web billing guard passes 4/4 Vitest tests and
the web TypeScript check passes. At the time of the last full verification,
`pnpm verify` was blocked by a Corepack environment failure; rerun it before
publishing or merging a broader billing change.

## Production readiness checklist

- [x] Provisional Terms page published at a stable public URL
- [x] Provisional Terms and Privacy page scaffolding exists in the repository
- [x] Terms URL added to the RevenueCat sandbox purchase link
- [x] Sandbox purchase link created
- [x] Hosted Supabase webhook deployed
- [x] RevenueCat webhook secret stored server-side
- [x] RevenueCat webhook configured and TEST event returns 2xx
- [ ] Monthly sandbox purchase verified at $4.99
- [ ] Annual sandbox purchase verified at $49.99
- [ ] Entitlement mirror verified for a real Supabase user UUID
- [x] Web subscription read/checkout guard wired to the `pro` entitlement
- [ ] Web Find Time proposal/confirmation UI wired to the `pro` entitlement
- [ ] Mobile RevenueCat purchase/restore flow wired to the `pro` entitlement
- [ ] Cancellation and expiration behavior verified
- [ ] Production Stripe account connected
- [ ] Production products/prices and purchase link verified
- [ ] Production URL kept separate from the sandbox URL
- [ ] `pnpm verify` passes

## Official references

- [RevenueCat Web Purchase Links](https://www.revenuecat.com/docs/web/web-billing/web-purchase-links)
- [RevenueCat Web Billing overview](https://www.revenuecat.com/docs/web/overview)
- [RevenueCat Web purchase testing](https://www.revenuecat.com/docs/web/web-billing/testing)
- [Cloudflare Pages: deploy a Vite project](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
- [Cloudflare Pages: static HTML deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
