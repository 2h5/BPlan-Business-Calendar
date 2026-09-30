# RevenueCat + Stripe Web Billing

This is the operating runbook for BPlan web billing: what is configured, how
access is decided, how every subscription lifecycle event is handled, how to
deploy and operate the hosted pieces, and how to test in the sandbox. It
contains no passwords, API keys, webhook secrets, or provider tokens.

The billing automation tooling (command boundaries, credentials, test layers,
and the dated evidence log behind every claim here) is in
[`revenuecat-automation-plan.md`](revenuecat-automation-plan.md).

## Status — 2026-09-29

| Area                                              | State                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sandbox catalog, hosted checkout, webhook         | Configured; monthly and annual sandbox purchases proven live.                                                                                                                                                                                                                            |
| Webhook → Supabase mirror → server authorization  | Proven live on the current code (webhook v8, 2026-09-29).                                                                                                                                                                                                                                |
| Monthly lifecycle                                 | Proven live 2026-09-29: purchase, natural renewal, cancellation keeping paid access, expiration revoking Pro.                                                                                                                                                                            |
| Annual lifecycle                                  | Proven live 2026-09-22 on the previous webhook (v6); not yet re-run on v8.                                                                                                                                                                                                               |
| Reconciliation worker and "Refresh access status" | Deployed (`revenuecat-reconcile` v1, `revenuecat-refresh` v1) but **not configured**: they answer `NOT_CONFIGURED`, `pg_cron`/`pg_net` are off, and no schedule is installed. Reconciliations the webhook queues wait until this is set up. See [Hosted operations](#hosted-operations). |
| Mobile purchase and restore                       | Not built. This release is web-only.                                                                                                                                                                                                                                                     |
| Production billing                                | **Disabled.** Needs seller identity, final legal documents, a production Stripe account, and explicit approval.                                                                                                                                                                          |

## Billing decision

- Billing engine: **RevenueCat Billing** (hosts the web checkout)
- Payment gateway: **Stripe**
- Apple App Store and Google Play: not configured
- Currency: USD
- Monthly plan: **$2.99/month** (changed from $4.99 on 2026-09-30)
- Annual plan: **$29.99/year** (changed from $49.99 on 2026-09-30)

**Pending dashboard change:** the sandbox products below are still priced at
$4.99 and $49.99. Update them in RevenueCat before the next live purchase
run; the lifecycle tooling checks product identifiers, not prices.

## Dashboard configuration

These are project references, not secrets. The RevenueCat project ID below is
historical runbook evidence and is **not** used as an API target: automation
discovers the canonical project by its exact name.

| Item                                                                  | Value                                           |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| RevenueCat project                                                    | `BPlan: Business Calendar`                      |
| Historical runbook project ID (unverified for API v2; never a target) | `d455e7e9`                                      |
| Stripe account                                                        | `BPlan: Business Calendar sandbox`              |
| Stripe account ID                                                     | `acct_1UDZowDPPGgNSwlS`                         |
| RevenueCat Billing web config                                         | `BPlan: Business Calendar (RevenueCat Billing)` |
| Web config ID                                                         | `app48a77253da`                                 |
| Default currency                                                      | USD                                             |
| Support email                                                         | `info.bplanai@gmail.com`                        |
| Hosted Supabase project (sandbox/dev)                                 | `nlpyloypcphvajbvasnr`                          |

The Stripe sandbox is linked to the RevenueCat project. Production Stripe must
be connected separately before customer purchases are enabled.

### Entitlement

The app and database use exactly this entitlement identifier:

```text
pro
```

The dashboard also has an auto-created onboarding entitlement,
`bplan_business_calendar_pro`. It is not the application entitlement; do not
use it unless code and database are changed together.

### Products and offering

| Product identifier  | Display name      | Interval |  Price | Entitlement | RevenueCat Product |
| ------------------- | ----------------- | -------- | -----: | ----------- | ------------------ |
| `bplan_pro_monthly` | BPlan Pro Monthly | Monthly  |  $4.99 | `pro`       | —                  |
| `bplan_pro_yearly`  | BPlan Pro Yearly  | Yearly   | $49.99 | `pro`       | `prod3c26a548d0`   |

Both use the customer-facing name `BPlan Pro` and the description
`Full access to BPlan Business Calendar.` A subscription's `product_id` is the
RevenueCat Product resource ID; its `store_identifier` is the product
identifier above. Plan checks compare the store identifier.

| Offering item       | Value                               |
| ------------------- | ----------------------------------- |
| Offering identifier | `bplan_web`                         |
| Display name        | `BPlan Pro Plans`                   |
| Offering ID         | `ofrng560c7ad85b`                   |
| Monthly package     | `$rc_monthly` → `bplan_pro_monthly` |
| Annual package      | `$rc_annual` → `bplan_pro_yearly`   |

## How access is decided

```text
signed-in user (Supabase UUID)
  -> RevenueCat hosted checkout (App User ID = that UUID)
  -> Stripe payment
  -> RevenueCat subscription and `pro` entitlement
  -> revenuecat-webhook  ──(hint)──>  reconciliation queue -> revenuecat-reconcile
  -> subscriptions mirror + subscription_events ledger
  -> has_active_entitlement(user_id, 'pro')
```

- **Server authority** is `public.has_active_entitlement(user_id, 'pro')`,
  which reads the `subscriptions` mirror. Server features (for example the AI
  Find Time function) call it; a client-side `isPro` flag is never trusted.
- **RevenueCat owns subscription state.** The mirror is a copy written by the
  webhook, or by a reconciliation that reads RevenueCat directly.
- **Identity:** the checkout URL carries the signed-in user's Supabase UUID as
  the RevenueCat App User ID. Anonymous RevenueCat IDs and anything that is not
  a Supabase UUID are recorded and ignored.
- **Environment:** the webhook accepts only events whose environment matches
  `REVENUECAT_ENVIRONMENT` (`SANDBOX` on the sandbox/dev project), so a sandbox
  event cannot reach a production mirror.
- **One event, one outcome:** `process_revenuecat_event` claims each event ID
  once and applies it in the same transaction. A redelivery is counted in
  `duplicate_deliveries` and changes nothing. An event older than the mirror's
  latest applied event is recorded as stale and does not overwrite it.

## Subscription lifecycle reference

The webhook decides each event in one of three ways:

- **Apply:** the payload says who, which entitlement, active or expired, and
  until when, so the mirror is written from it.
- **Apply and re-check:** applied, and a RevenueCat read is also queued,
  because RevenueCat does not document exactly when access ends for that event.
- **Re-check:** the payload cannot safely say what access the user now has, so
  only a RevenueCat read is queued.

Any lifecycle event missing its environment, entitlements, or (except for a
non-renewing purchase) its expiry becomes a re-check instead of being guessed.
Until the reconciliation worker is configured, queued re-checks wait: the
event is recorded, but its access change does not reach the mirror.

Evidence: **Live** means observed end to end in the RevenueCat sandbox.
**Tested** means covered by webhook decision tests, the database tests, or both.
**Generic** means handled by the shared apply path with no test of its own.

| Event                              | Handling           | Effect on Pro access                                                                              | Evidence                                    |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `INITIAL_PURCHASE`                 | Apply              | Active until the period end.                                                                      | Live (monthly and annual), Tested           |
| `RENEWAL`                          | Apply              | Active; expiry moves to the new period end.                                                       | Live (monthly and annual), Tested           |
| `CANCELLATION` (user unsubscribed) | Apply and re-check | Stays active until the paid period ends; auto-renew is off.                                       | Live (monthly and annual), Tested           |
| `CANCELLATION` (refund)            | Apply and re-check | Applied from the payload; the re-check makes access follow RevenueCat's answer.                   | Tested                                      |
| `EXPIRATION`                       | Apply              | Revoked.                                                                                          | Live (monthly and annual), Tested           |
| `UNCANCELLATION`                   | Apply              | Active; renewal resumes.                                                                          | Generic                                     |
| `PRODUCT_CHANGE`                   | Apply              | Active with the new product's expiry.                                                             | Generic                                     |
| `BILLING_ISSUE`                    | Apply and re-check | Stays active until the payload's expiry; the re-check follows any grace period RevenueCat grants. | Tested                                      |
| `SUBSCRIPTION_PAUSED`              | Apply              | Stays active until the current period ends; access ends with the later `EXPIRATION`.              | Tested                                      |
| `SUBSCRIPTION_EXTENDED`            | Apply              | Active with the extended expiry.                                                                  | Generic                                     |
| `REFUND_REVERSED`                  | Apply              | Active again with the restored expiry.                                                            | Tested                                      |
| `NON_RENEWING_PURCHASE`            | Apply              | Active; may have no expiry (lifetime). Not sold today.                                            | Tested                                      |
| `TRANSFER`                         | Re-check           | Both the old and new owner are re-read from RevenueCat.                                           | Tested (including opposite-order transfers) |
| `PURCHASE_REDEEMED`                | Re-check           | The redeeming user is re-read.                                                                    | Tested                                      |
| `TEMPORARY_ENTITLEMENT_GRANT`      | Re-check           | The user is re-read (the payload has no entitlement or expiry).                                   | Tested                                      |
| `TEST` (dashboard test event)      | Ignore             | None; recorded and acknowledged.                                                                  | Live (setup check), Tested                  |
| Any other type                     | Ignore             | None; recorded as `UNHANDLED_EVENT_TYPE`.                                                         | Tested                                      |

Also ignored and recorded: anonymous App User IDs, IDs that are not a Supabase
user, and events from the other environment. Out-of-order and duplicate
delivery are proven locally (two-connection race harness and database tests);
no stale or duplicate delivery has been observed live.

### Sandbox timing

RevenueCat accelerates sandbox subscriptions: a monthly period lasts five
minutes and an annual period one hour. Observed behavior worth knowing:

- RevenueCat bills each renewal about 30 seconds before the period ends. The
  `RENEWAL` is applied and the expiry extended while the current period is
  still running, and the subscription reports `has_already_renewed` until the
  new period starts.
- After a cancelled subscription's period ends, RevenueCat's subscription record
  can still read `active` for a few seconds, while RevenueCat Pro, the mirror,
  and server authorization have already ended access. A lifecycle read in that
  window fails closed; the next read passes as `expired`.

## Hosted operations

### Deployment order

Migration `20260924000001` replaced the database function the old webhook
(v6) called. Whenever the webhook and its migration change together, apply the
migration and deploy `revenuecat-webhook`, `revenuecat-reconcile`, and
`revenuecat-refresh` in one sitting. In between, deliveries fail, and
RevenueCat retries them at 5, 10, 20, 40, and 80 minutes, then stops. Retry
anything later from the RevenueCat dashboard's webhook log.

Before relying on `supabase migration list`, remember it reports history, not
schema. On 2026-09-29 the sandbox/dev project's history had two entries
swapped: the convergence migration was recorded but never run, and the
profile-avatars migration was run but not recorded. Never mark a migration
applied without running it; when in doubt, check that its tables and columns
exist.

### Edge Function secrets

| Secret                              | Used by                     | Required                                                                             |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `REVENUECAT_WEBHOOK_SECRET`         | `revenuecat-webhook`        | Yes. The `Authorization` header RevenueCat sends must equal it.                      |
| `REVENUECAT_ENVIRONMENT`            | webhook, reconcile, refresh | Yes: `SANDBOX` or `PRODUCTION`. Without it the webhook answers 503 `NOT_CONFIGURED`. |
| `REVENUECAT_WEBHOOK_SIGNING_SECRET` | `revenuecat-webhook`        | Optional HMAC signing (below).                                                       |
| `REVENUECAT_READONLY_API_KEY`       | reconcile, refresh          | Yes for those two. A v2 key with read-only permissions.                              |
| `REVENUECAT_PROJECT_ID`             | reconcile, refresh          | Yes for those two.                                                                   |
| `BILLING_RECONCILE_CRON_SECRET`     | `revenuecat-reconcile`      | Yes for the scheduled job; must match the Vault secret below.                        |

On the sandbox/dev project today, only the first two are set.
`revenuecat-webhook` and `revenuecat-reconcile` run without Supabase JWT
verification (they check their own secrets); `revenuecat-refresh` requires a
signed-in user. `supabase/config.toml` records this, so a plain
`supabase functions deploy <name>` uses the right setting.

### Schedule installation

Enable the `pg_cron` and `pg_net` extensions first. The five-minute
`revenuecat-reconcile` job reads its URL and secret from Vault each time it
runs, so neither is stored in `cron.job`. As the `postgres` role (for example
in the SQL editor):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/revenuecat-reconcile',
                           'revenuecat_reconcile_url');
select vault.create_secret('<same value as BILLING_RECONCILE_CRON_SECRET>',
                           'billing_reconcile_cron_secret');
select public.ensure_revenuecat_reconcile_schedule();
```

The installer is idempotent. It returns `INSTALLED`, or what is missing:
`EXTENSIONS_UNAVAILABLE`, `VAULT_UNAVAILABLE`, `MISSING_VAULT_SECRETS`, or
`INVALID_RECONCILE_URL`. To rotate the cron secret, update the Vault secret and
the Edge secret together; the job needs no reinstall. (Before migration
`20260925000001`, a guard bug made it report `EXTENSIONS_UNAVAILABLE` even with
`pg_cron` enabled; see [`release-hardening.md`](release-hardening.md).)

### Health and alerting

`select public.revenuecat_billing_health();` (service role) returns counts and
timestamps only. Alert when any of these hold:

- `schedule.installed` is false, `schedule.last_run.status` is not
  `succeeded`, or `schedule.last_run.started_at` is older than 15 minutes.
- `queue.overdue` > 0: pending work nobody has claimed for 30 minutes.
- `queue.failing` > 0: a user has failed three or more attempts.
- `queue.webhook_failures_pending` > 0 for more than 15 minutes.
- a `provider[].blocked_until` in the future, or a repeated
  `provider[].last_error` (`PROVIDER_AUTH` means the key is wrong or revoked).

Also alert on these Edge Function log codes: `REVENUECAT_WEBHOOK_FAILED`,
`REVENUECAT_WEBHOOK_FAILURE_UNRECORDED` (the failure could not be queued, so
the database was unreachable), `REVENUECAT_WEBHOOK_NOT_CONFIGURED`,
`REVENUECAT_WEBHOOK_SIGNATURE`, `REVENUECAT_RECONCILE_FAILED`, and
`REVENUECAT_RECONCILE_NOT_CONFIGURED`.

### A first purchase whose webhook never arrived

The scheduled sweep only sees users who already have a mirror row. A first
purchase whose deliveries all failed is recovered:

1. **Automatically**, if the delivery reached the webhook: the failure queues a
   `WEBHOOK_FAILED` reconciliation for the named user.
2. **By the user**: "Refresh access status" in the web app re-reads RevenueCat
   for them (once `revenuecat-refresh` is configured).
3. **By an operator**, when deliveries never reached the function (an outage
   over about 2.5 hours, a wrong `Authorization` value, or a signing-secret
   mismatch): retry the failed deliveries from the RevenueCat dashboard's
   webhook log, or queue the user as `postgres`:

   ```sql
   select public.enqueue_revenuecat_reconciliation('<supabase user uuid>', 'OPERATOR');
   ```

   The next scheduled run reads RevenueCat for that user.

### Webhook HMAC signing

`REVENUECAT_WEBHOOK_SIGNING_SECRET` is optional and additive to the
`Authorization` header. RevenueCat signs `<t>.<raw body>` and re-signs every
retry with a fresh timestamp, so the five-minute tolerance does not reject
retries. RevenueCat's "Rotate secret" invalidates the old secret immediately:
update the Edge secret at the same moment, or deliveries return 403 until it
matches. Enable signing in RevenueCat before setting the Edge secret, not
after.

## Initial setup

These steps are complete for the sandbox. They are kept so the setup can be
repeated or re-verified.

### 1. Public Terms and Privacy pages — provisional, published

`apps/web/public/terms.html` and `apps/web/public/privacy.html` are
provisional drafts with TBD values and a draft warning; Vite copies them to
`apps/web/dist/`. They are not final legal documents and must not be used to
enable production checkout. Open decisions are in
[`legal-business-decisions.md`](legal-business-decisions.md).

Before production, confirm: legal or business name, governing jurisdiction,
effective date, prices, automatic renewal terms, cancellation instructions,
refund policy, support email, and the Privacy Policy link. This checklist is
not legal advice.

### 2. Cloudflare Pages — provisional pages published

| Cloudflare Pages setting | Value            |
| ------------------------ | ---------------- |
| Repository root          | Repository root  |
| Framework preset         | Vite             |
| Build command            | `pnpm build:web` |
| Build output directory   | `apps/web/dist`  |
| Node.js                  | 22 or newer      |

Browser variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_APP_ENV=production` for the production build. Only `VITE_` values belong
in the browser build; never add a service-role key, RevenueCat or Stripe
secret, OAuth client secret, or provider token. Keep `VITE_BILLING_MODE` at
`disabled` or `production` in the production environment; `sandbox` fails the
production build by design.

Use the stable production `pages.dev` URL for Terms (for example
`https://<cloudflare-project>.pages.dev/terms.html`) and confirm it loads in an
incognito window without signing in.

### 3. RevenueCat hosted purchase link — sandbox configured

Do not create or distribute a production purchase link while the seller
identity or final legal documents are unresolved. To recreate the sandbox link,
in RevenueCat open **Funnels → Purchase Links → Create a web purchase link**:

| Field                    | Value                                           |
| ------------------------ | ----------------------------------------------- |
| Internal name            | `BPlan Web Checkout`                            |
| Offering                 | `BPlan Pro Plans` / `bplan_web`                 |
| Web config               | `BPlan: Business Calendar (RevenueCat Billing)` |
| Paywall                  | Display default paywall                         |
| Header                   | `Choose your BPlan plan`                        |
| Subheader                | `Get full access to BPlan Business Calendar`    |
| Terms & Conditions URL   | The deployed `terms.html` URL                   |
| Success                  | Show default success page                       |
| Repeat purchase behavior | Show the success page                           |

Leave product descriptions off. Under **Share URL**, the **Sandbox URL** is for
testing only; never send it to customers. The checkout URL must carry the
signed-in user's URL-encoded Supabase UUID, never an email, display name, or a
newly generated ID.

### 4. Webhook — deployed and connected

1. Link the Supabase CLI to the hosted project.
2. Set `REVENUECAT_WEBHOOK_SECRET` and `REVENUECAT_ENVIRONMENT` as Edge secrets.
3. Deploy: `supabase functions deploy revenuecat-webhook`.
4. In RevenueCat, set the webhook URL to
   `https://<supabase-project-ref>.supabase.co/functions/v1/revenuecat-webhook`
   and its `Authorization` header to the same secret value.
5. Send RevenueCat's test event and confirm a 2xx response.

Never put the secret in Git, a client `.env` file, a Cloudflare browser
variable, or a chat message.

### 5. Application wiring

The web app's Settings billing section and the subscription page read the
`pro` projection through a user-scoped TanStack Query hook, open the identified
hosted checkout, and offer "Refresh access status" (the `revenuecat-refresh`
function). Checkout is disabled by default; production is blocked unless the
seller-identity and final-document confirmations and public Terms and Privacy
URLs are present. Mobile RevenueCat purchase and restore are future work.

## Sandbox testing

### Automated tooling

The billing tooling runs locally through `Z:\Dev\Tools\BCalAI\Invoke-Billing.ps1`,
which loads `Z:\Dev\Secrets\BCalAI\billing.env` (both outside the repository)
and takes the automation mode with `-Mode`. Keep `billing.env` owned by your
own Windows account and edit it outside sandboxed agent sessions; the wrapper
refuses to load it if it cannot restrict its permissions.

| Command                                                      | Mode               | What it does                                                                                                            |
| ------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm billing:preflight`                                     | `offline`          | Checks the static contract and configuration; no network.                                                               |
| `pnpm billing:assert-user -- --expect free\|active-pro`      | `live-readonly`    | Compares RevenueCat, the mirror, the ledger, and server authorization for one user. `--plan` optional for `active-pro`. |
| `pnpm billing:e2e:sandbox -- --plan monthly\|annual`         | `sandbox-purchase` | One sandbox purchase for a free test user, then read-only convergence. Never retries.                                   |
| `pnpm billing:lifecycle:read-only -- --plan monthly\|annual` | `live-readonly`    | Classifies the subscription as active, cancelled-active, or expired across every authority.                             |
| `pnpm billing:lifecycle:renewal -- --plan monthly\|annual`   | `live-readonly`    | Watches one natural renewal of the same subscription.                                                                   |
| `pnpm billing:lifecycle:cancel -- --plan monthly\|annual`    | `sandbox-cancel`   | Re-checks, then submits exactly one cancellation. Separately authorized each time.                                      |

Keys: `REVENUECAT_API_KEY` is the read-only v2 key every command reads with.
`REVENUECAT_MUTATION_API_KEY` is a separate v2 key with only Customer
information → Subscriptions read & write. The cancel command refuses to run
without it or if it equals the read key, the tooling rejects it in every other
mode, and the wrapper passes it only in `sandbox-cancel` mode. Delete it in the
RevenueCat dashboard when no cancellation test is planned.

Use a fresh Supabase Auth user (created on the hosted project, not locally) for
each purchase, and prove it free with `billing:assert-user -- --expect free`
first. Start the renewal observer right after a monthly purchase; the first
renewal lands within five minutes.

The protected GitHub workflow `RevenueCat sandbox billing` runs the read-only
operations and an explicitly confirmed purchase from the `billing-sandbox`
Environment. The monthly lifecycle and renewal operations need the
`BILLING_MONTHLY_LIFECYCLE_TEST_USER_ID` and
`BILLING_MONTHLY_RENEWAL_TEST_USER_ID` Environment secrets, which are not yet
set. Cancellation is not a workflow operation.

### Manual acceptance checklist

Use this for a separately authorized re-verification. It is not permission to
make another purchase.

1. Create a new Auth user on the hosted project and confirm it is free.
2. Open the sandbox checkout with that user's UUID and buy one plan with the
   Stripe test card.
3. Confirm RevenueCat shows the customer, the plan's product, and `pro`.
4. Confirm the webhook returned 2xx and one `subscriptions` row exists with
   `provider = revenuecat`, `entitlement = pro`, `status = active`.
5. Confirm a Pro-gated action (AI Find Time) succeeds.
6. Wait for a natural renewal and confirm the expiry moved forward.
7. Cancel with `billing:lifecycle:cancel` (or in the RevenueCat dashboard) and
   confirm access remains until the paid period ends.
8. Confirm expiration revokes Pro in RevenueCat, the mirror, and server
   authorization.

## Verification commands

```bash
pnpm verify
```

For migration, RLS, generated-type, or Edge Function changes, also run the
database tests (`supabase test db`), regenerate types (`pnpm db:types`), and
run the Deno checks; CI runs all of these.

## Production readiness checklist

- [x] Provisional Terms and Privacy pages published at a stable public URL
- [x] Sandbox purchase link created with the Terms URL
- [x] Hosted webhook deployed with its secret stored server-side; TEST event returns 2xx
- [x] Monthly and annual sandbox purchases verified through the full authority chain
- [x] Monthly lifecycle verified live on the current webhook
- [x] Annual lifecycle verified live (on webhook v6)
- [x] Web subscription read, checkout guard, and Find Time wired to `pro`
- [x] Repository verification passes (format, lint, types, tests, build, migrations/RLS, generated types)
- [ ] Reconciliation worker and refresh configured; schedule `INSTALLED` and running
- [ ] Mobile RevenueCat purchase and restore wired to `pro`
- [ ] Seller identity and final legal documents approved
- [ ] Production Stripe account connected
- [ ] Production products, prices, and purchase link verified, kept separate from sandbox

## History

Each entry is detailed in the automation plan.

- **2026-09-18** — Free baseline passed live. First monthly sandbox purchase
  converged across RevenueCat, the webhook, the mirror, the ledger, and server
  authorization; the browser result was ambiguous and the purchase was never
  retried.
- **2026-09-19** — Billing paused after an annual attempt whose plan check
  failed. Later traced to comparing the RevenueCat Product ID with the store
  identifier; the purchase itself was correct.
- **2026-09-22** — Fresh annual purchase passed with the corrected plan check.
  Annual cancellation kept access until the period end and expiration revoked
  it. A separate annual subscription renewed naturally.
- **2026-09-23** — Atomic event processing (`20260923000001`) and webhook v6
  deployed; protected read-only workflow run
  [#35834501740](https://github.com/2h5/BPlan-Business-Calendar/actions/runs/35834501740)
  passed. Phase 6 engineering acceptance complete.
- **2026-09-24** — Convergence hardening (reconciliation queue, worker,
  refresh, HMAC signing) merged to `main`.
- **2026-09-29** — Hosted migration history repaired; convergence migration,
  cron-installer fix, webhook v8, reconcile, and refresh deployed with billing
  data unchanged. Lifecycle tooling made plan-scoped. Monthly lifecycle proven
  live on the new webhook.

## Official references

- [RevenueCat Web Purchase Links](https://www.revenuecat.com/docs/web/web-billing/web-purchase-links)
- [RevenueCat Web Billing overview](https://www.revenuecat.com/docs/web/overview)
- [RevenueCat Web purchase testing](https://www.revenuecat.com/docs/web/web-billing/testing)
- [Cloudflare Pages: deploy a Vite project](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
