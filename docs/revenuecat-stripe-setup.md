# RevenueCat + Stripe Web Billing Setup

## 2026-09-24 review branch status

**PROVEN LOCAL (repository tests):** The billing hardening branch has an
atomic reconciliation queue and snapshot writer, a shared RevenueCat catalog
cache and provider backoff, a scheduled read-only RevenueCat worker, and a
user-authenticated refresh function. pgTAP, the two-session race harness (in
CI), Edge Function tests, and billing tooling tests exercise these paths. The
separate `REVENUECAT_MUTATION_API_KEY` is accepted only for a one-shot sandbox
cancellation; `REVENUECAT_API_KEY` remains the observational tooling key.

**PROVEN HOSTED:** Only the preceding Phase 6 atomic webhook deployment and
read-only continuity checks described below are hosted evidence. They do not
cover the new convergence migration or functions.

**PENDING:** A target-checked hosted deployment following
[Convergence operations](#convergence-operations), then observation of a real
provider read, a scheduled run, and a signed-in refresh. Confirm the canonical
RevenueCat API v2 project ID by provider discovery; the historical runbook ID
below is not a selector. Production checkout remains disabled until the
separate legal and release gate.

## Convergence operations

### Deployment order

Migration `20260924000001` drops the `process_revenuecat_event` signature the
deployed webhook (version 6) calls. Between applying the migration and
deploying the new `revenuecat-webhook`, every delivery returns 500 and
RevenueCat retries it at 5, 10, 20, 40 and 80 minutes, then stops. Apply the
migration and deploy `revenuecat-webhook`, `revenuecat-reconcile`, and
`revenuecat-refresh` in one sitting, well inside that window. Any delivery that
still failed can be retried from the RevenueCat dashboard's webhook log.

Edge secrets: `REVENUECAT_READONLY_API_KEY` (a v2 key with read-only
permissions), `REVENUECAT_PROJECT_ID`, `REVENUECAT_ENVIRONMENT` (`SANDBOX` or
`PRODUCTION`), and `BILLING_RECONCILE_CRON_SECRET`.

### Schedule installation

The five-minute `revenuecat-reconcile` job reads its URL and secret from Vault
each time it runs, so neither is stored in `cron.job`. As an operator (the
`postgres` role, for example in the SQL editor):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/revenuecat-reconcile',
                           'revenuecat_reconcile_url');
select vault.create_secret('<same value as BILLING_RECONCILE_CRON_SECRET>',
                           'billing_reconcile_cron_secret');
select public.ensure_revenuecat_reconcile_schedule();
```

The installer is idempotent and returns `INSTALLED`, or what is missing:
`EXTENSIONS_UNAVAILABLE` (enable `pg_cron` and `pg_net`),
`VAULT_UNAVAILABLE`, `MISSING_VAULT_SECRETS`, or `INVALID_RECONCILE_URL`. The
migration runs it once and reports the result as a NOTICE; rerun it after
provisioning. To rotate the cron secret, update the Vault secret and the Edge
secret together; the job needs no reinstall.

### Health and alerting

`select public.revenuecat_billing_health();` (service role) returns counts and
timestamps only. Alert when any of these hold:

- `schedule.installed` is false, or `schedule.last_run.status` is not
  `succeeded`, or `schedule.last_run.started_at` is older than 15 minutes.
- `queue.overdue` > 0: pending work nobody has claimed for 30 minutes.
- `queue.failing` > 0: a user has failed three or more attempts.
- `queue.webhook_failures_pending` > 0 for more than 15 minutes.
- a `provider[].blocked_until` in the future, or a repeated
  `provider[].last_error` (`PROVIDER_AUTH` means the key is wrong or revoked).

Also alert on these Edge Function log codes: `REVENUECAT_WEBHOOK_FAILED`,
`REVENUECAT_WEBHOOK_FAILURE_UNRECORDED` (the failure could not be queued, so
the database was unreachable), `REVENUECAT_WEBHOOK_SIGNATURE`,
`REVENUECAT_RECONCILE_FAILED`, and `REVENUECAT_RECONCILE_NOT_CONFIGURED`.

### A first purchase whose webhook never arrived

The scheduled sweep only sees users who already have a mirror row. A first
purchase whose deliveries all failed is recovered by:

1. **Automatically**, if the delivery reached the webhook: the failure queues a
   `WEBHOOK_FAILED` reconciliation for the named user.
2. **The user**: "Refresh access status" re-reads RevenueCat for them.
3. **An operator**, when deliveries never reached the function (an outage over
   about 2.5 hours, a wrong Authorization value, or a signing-secret mismatch):
   retry the failed deliveries from the RevenueCat dashboard's webhook
   delivery log, or queue a specific user as `postgres`:

   ```sql
   select public.enqueue_revenuecat_reconciliation('<supabase user uuid>', 'OPERATOR');
   ```

   The next scheduled run reads RevenueCat for that user.

### Webhook HMAC signing

`REVENUECAT_WEBHOOK_SIGNING_SECRET` is optional and additive to the
Authorization header. RevenueCat signs `<t>.<raw body>` and re-signs every
retry with a fresh timestamp, so the five-minute tolerance does not reject
retries. RevenueCat's "Rotate secret" invalidates the old secret immediately:
update the Edge secret at the same moment, or deliveries return 403 until it
matches (RevenueCat's retries cover about 2.5 hours; retry anything later from
the dashboard). Enable signing in RevenueCat before setting the Edge secret,
not after.

Status: **Sandbox catalog, hosted checkout, webhook, identified web billing
integration, and the real monthly and annual sandbox billing chains are verified.
Phase 3C annual verification passed on 2026-09-22 through the corrected
RevenueCat Product identity assertion. Provisional legal pages are published.
Final legal documents and production billing remain intentionally blocked.**

Billing automation Phase 4 is complete: cancellation retained access until
expiry, expiration revoked Pro, and a separate fresh annual subscription
renewed naturally with provider, mirror, ledger, and server authority aligned.
Replay/order behavior passed deterministic webhook and database checks.
Production billing remains disabled.

Billing automation Phase 5 is complete. The protected manual GitHub Actions
workflow's sandbox lifecycle-read-only run #7 passed on Node 22 after runtime
alignment resolved hosted Supabase client initialization. Normal CI is green.
The run made no new purchase and used GitHub Environment secrets rather than
the local billing secrets file. See
[the automation plan](revenuecat-automation-plan.md) for the operation list
and Phase 6 audit. Production billing remains disabled.

**Phase 6 hosted sandbox/dev deployment, 2026-09-23:** The linked Supabase
project `nlpyloypcphvajbvasnr` received
`20260923000001_revenuecat_atomic_event.sql` before `revenuecat-webhook`
version 6 was deployed. Hosted read-only checks confirmed the migration, the
service-role-only atomic RPC grant, removal of the service role's old split
RPC and separate ledger INSERT privileges, and unchanged aggregate mirror and
ledger counts. The function remains active with JWT verification disabled and
the existing webhook secret configured. A non-mutating GET returned 405, and
the existing sandbox identity passed the protected `lifecycle-read-only`
workflow [run #35834501740](https://github.com/2h5/BPlan-Business-Calendar/actions/runs/35834501740).
No purchase, RevenueCat mutation, or concurrent provider-side delivery was
manufactured. A real delivery through the newly deployed atomic path remains
unobserved; production billing remains disabled.

**Phase 6 engineering closeout, 2026-09-23:** The final
[acceptance matrix](revenuecat-automation-plan.md)
marks the current sandbox hardening contract complete. The pinned RevenueCat
CLI does not expose continuation controls on the approved named reads, so an
advertised next page fails closed. A valid but unintended test UUID is an
operator fixture-selection boundary; matching RevenueCat and Supabase rows
cannot independently establish intent. Live expired-key and provider-side
concurrent/replayed delivery exercises are accepted external observations,
not prerequisites for engineering closeout. No new purchase, provider mutation,
credential rotation, or webhook event was created for this audit. Production
billing and final seller/legal approval remain separate human release gates.

Last billing automation checkpoint: **2026-09-23**

## Annual Phase 3C checkpoint — 2026-09-22

Read-only catalog access established that `bplan_web` / `$rc_annual` attaches
RevenueCat Product `prod3c26a548d0`, whose `store_identifier` is
`bplan_pro_yearly`. The September 19 annual purchase referenced that Product;
its plan-scoped failure came from comparing the Product resource ID directly
with the store identifier. That original purchase was not repeated. Its sandbox
subscription subsequently renewed roughly hourly, then canceled and expired;
the old identity is now inactive.

A newly provisioned Supabase Auth test identity passed the complete free
baseline. One fresh annual sandbox submit action was attempted. The browser
reported submission `UNKNOWN`, while read-only reconciliation passed the active
RevenueCat Pro entitlement and annual subscription, Supabase mirror and ledger,
and server-side authorization. A separate annual plan-scoped read-only assertion
also passed. No retry, provider configuration change, direct billing-row write,
or manual grant occurred. **Phase 3C is complete.** Production billing remains
disabled; lifecycle/cancellation/expiration verification is next.

The Phase 4 annual lifecycle command is `pnpm billing:lifecycle:read-only`
through `Invoke-Billing.ps1 -Mode live-readonly`. A separately authorized
`sandbox-cancel` command guarded the same annual identity and submitted one
successful cancellation on 2026-09-22. Read-only reconciliation proved
`will_not_renew` while paid access, RevenueCat Pro, the Supabase mirror, and
server authorization remained active. The ledger recorded `CANCELLATION`, and
the paid-period end remained 06:17:52 UTC. After that boundary, RevenueCat
reported `expired` with no access or Pro, the Supabase mirror was expired, the
ledger recorded `EXPIRATION`, and server authorization was false. The read-only
assertion now accepts the expected loss of the expired subscription's Pro
attachment. Cancellation through expiration is proven live. No live renewal or
duplicate/stale delivery was observed for this identity; production billing
remains disabled.

For a separately authorized natural-renewal test on a fresh annual identity,
`pnpm billing:lifecycle:renewal` captures the initial paid period and checks
the next period through the same read-only wrapper. It compares subscription
identity, period extension, RevenueCat Pro, Supabase mirror and ledger, and
server authorization. The command does not renew or change a subscription.

**Natural renewal checkpoint, 2026-09-22:** a separate fresh Auth identity
passed the free baseline and the live annual catalog mapping. One annual
sandbox submit action had browser outcome `UNKNOWN`, but read-only authority
reconciliation passed without retry. The original paid period was
06:32:50–07:32:50 UTC. After natural renewal it advanced to
07:32:50–08:32:50 UTC, still active and `will_renew`. RevenueCat Pro, the
extended active Supabase mirror, applied `INITIAL_PURCHASE > RENEWAL` ledger,
and server authorization agreed. The first observer stopped near the boundary
with `RENEWAL_PROVIDER_STATE`; immediate read-only reconciliation passed, and bounded grace
handling was added with offline tests. No natural duplicate or stale delivery
was observed. Phase 4 is complete; production billing remains disabled.

## Historical pause checkpoint — 2026-09-19

At this checkpoint, billing work was paused after exactly one separately
authorized annual sandbox purchase attempt. Another purchase was not authorized
at that time.
The web app has a billing section inside Settings and a dedicated
subscription/upgrade page. The RevenueCat sandbox catalog, hosted link,
webhook, and identified web billing seam are configured. The first real monthly sandbox
purchase ultimately converged through RevenueCat, the webhook, Supabase mirror,
subscription ledger, and server authorization after read-only reconciliation
handled browser ambiguity. The purchase was never retried. The annual identity
passed its free baseline, then the annual attempt produced active Pro evidence,
but plan-scoped assertions failed with `REVENUECAT_EXPECTED_PLAN_MISSING` for
both annual and monthly. The observed product is unexpected, and live catalog
reads currently return `CLI_AUTHORIZATION`; exact annual provenance is therefore
unresolved. Do not reuse, reset, cancel, delete, refund, or repair either test
identity.

Cloudflare Pages remains configured for manual deployment with sandbox billing;
automatic deployments remain disabled. The latest web billing changes and ACL
migrations are committed on `main` at `673eb12`, but have not been deployed
after that checkpoint. Production checkout remains blocked by the unresolved
seller identity and final legal-document flags.

This runbook records the current billing decision and the steps needed to take
BPlan: Business Calendar from the Stripe sandbox to a tested production web
checkout. It intentionally contains no passwords, API keys, webhook secrets,
or provider refresh tokens.

The automation implementation roadmap is in
[`docs/revenuecat-automation-plan.md`](revenuecat-automation-plan.md). This
runbook remains the provider/dashboard setup reference; the automation plan
tracks command boundaries, credentials, tests, lifecycle checks, and live-versus
local evidence.

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

These values are documented project references, not secrets. The RevenueCat
project ID below is historical runbook evidence only and is **UNVERIFIED FOR
LIVE V2 USE**. Live automation must discover the canonical project ID from the
provider by exact project name; it must not use this value as a provider
target.

| Item                                                                          | Current value                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------- |
| RevenueCat project                                                            | `BPlan: Business Calendar`                      |
| Documented RevenueCat runbook project ID (historical; unverified for live v2) | `d455e7e9`                                      |
| Stripe account                                                                | `BPlan: Business Calendar sandbox`              |
| Stripe account ID                                                             | `acct_1UDZowDPPGgNSwlS`                         |
| RevenueCat Billing web config                                                 | `BPlan: Business Calendar (RevenueCat Billing)` |
| Web config ID                                                                 | `app48a77253da`                                 |
| Default currency                                                              | USD                                             |
| RevenueCat support email                                                      | `info.bplanai@gmail.com`                        |

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

## Setup status and remaining verification

### 1. Public Terms & Conditions page — provisional and published

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

### 2. Cloudflare Pages deployment — provisional pages published

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

### 3. RevenueCat hosted purchase link — sandbox configured

The sandbox link is configured for testing only. If it must be recreated, use
the following values after the public Terms URL is available.
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

### 4. Copy and test the purchase URL — sandbox annual chain verified

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

### 5. Deploy and connect the RevenueCat webhook — hosted setup complete

The Supabase function is in the repository and is deployed to the hosted
Supabase project. The following records the configuration and the commands to
repeat or re-verify it:

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
The dedicated subscription/upgrade page uses the same guarded billing feature
boundary. This remains a sandbox/testing purchase experience, not a
production-ready checkout. Checkout is disabled by default and production is
blocked unless seller-identity and final-document confirmations plus public
Terms and Privacy URLs are present.

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

The monthly and annual sandbox purchases have passed the complete authority
chain. The checklist below remains a guide for future separately authorized
reverification; it is not permission to repeat either purchase.

Run this test after the purchase link and webhook are deployed:

1. Sign in to the web app with a separately provisioned clean annual test
   account.
2. Open the sandbox checkout URL using that account's Supabase UUID.
3. Purchase the annual plan with the approved Stripe sandbox fixture.
4. Confirm RevenueCat records the customer and `pro` entitlement for the
   annual product.
5. Confirm the RevenueCat webhook returns 2xx.
6. Confirm one `subscriptions` row exists for the test user's UUID with:
   - `provider = revenuecat`
   - `entitlement = pro`
   - `status = active`
7. Confirm the app's Pro-gated action succeeds.
8. Cancel the subscription in the Stripe sandbox.
9. Confirm access remains active until the paid period ends.
10. Confirm expiration changes the mirrored entitlement to expired.

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

The earlier Windows `EPERM` and focused test counts are historical checkpoints.
For Phase 6, [main CI #35835780246](https://github.com/2h5/BPlan-Business-Calendar/actions/runs/35835780246)
passed static, migrations/RLS/generated-types, and Deno checks after the hosted
deployment documentation commit. The closeout branch verification is recorded
in the automation plan's final acceptance section.

## Production readiness checklist

- [x] Provisional Terms page published at a stable public URL
- [x] Provisional Terms and Privacy page scaffolding exists in the repository
- [x] Terms URL added to the RevenueCat sandbox purchase link
- [x] Sandbox purchase link created
- [x] Hosted Supabase webhook deployed
- [x] RevenueCat webhook secret stored server-side
- [x] RevenueCat webhook configured and TEST event returns 2xx
- [x] Monthly sandbox purchase verified through the full authority chain
- [x] Annual sandbox purchase verified through the full authority chain
- [x] Entitlement mirror verified for a real Supabase user UUID
- [x] Web subscription read/checkout guard wired to the `pro` entitlement
- [x] Web Find Time proposal/confirmation UI wired to the `pro` entitlement
- [ ] Mobile RevenueCat purchase/restore flow wired to the `pro` entitlement
- [x] Sandbox cancellation retains paid access and expiration revokes it
- [ ] Production Stripe account connected
- [ ] Production products/prices and purchase link verified
- [ ] Production URL kept separate from the sandbox URL
- [x] CI-equivalent repository verification passes (format, lint, types, unit
      tests, web build, migrations/RLS, and generated types)

## Official references

- [RevenueCat Web Purchase Links](https://www.revenuecat.com/docs/web/web-billing/web-purchase-links)
- [RevenueCat Web Billing overview](https://www.revenuecat.com/docs/web/overview)
- [RevenueCat Web purchase testing](https://www.revenuecat.com/docs/web/web-billing/testing)
- [Cloudflare Pages: deploy a Vite project](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
- [Cloudflare Pages: static HTML deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
