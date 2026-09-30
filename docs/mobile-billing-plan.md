# Mobile Billing Plan — iPhone in-app purchase

Status: **PLANNED — NOT STARTED (written 2026-09-30)**

This is the plan for selling BPlan Pro inside the iPhone app. It completes the
open items in [Sprint 6 Phase 5](sprint-6-active.md#phase-5--revenuecat)
(purchase, restore) and the one open state in Phase 6 (purchase restored).
Web billing, the server, and the proven sandbox lifecycles are recorded in
[`revenuecat-automation-plan.md`](revenuecat-automation-plan.md) and
[`revenuecat-stripe-setup.md`](revenuecat-stripe-setup.md).

---

## 1. The decision, in plain English

- **Web keeps its own checkout.** It is built and proven live in sandbox, and
  it keeps the most money, especially on the annual plan.
- **The iPhone app sells through Apple** (in-app purchase via RevenueCat).
  Apple requires in-app purchase to be offered for a digital subscription, and
  outside the US it is the only allowed way to sell inside the app.
- **Pro is one thing everywhere.** The server decides who has Pro from the
  RevenueCat mirror, not from the store. A web subscriber is Pro on the phone
  and an Apple subscriber is Pro on the web, as long as they sign in.
- **Optional later (US only): a "Subscribe on the web" link** next to the Apple
  button. Legal today, but its fee may change (see §3). Not in the first
  release.

## 2. Money per subscriber

Prices (set 2026-09-30, see
[`legal-business-decisions.md`](legal-business-decisions.md)): **$2.99/month**
and **$29.99/year**.

At $2.99/month:

| Route                                    | You keep     |
| ---------------------------------------- | ------------ |
| Web (Stripe 2.9% + $0.30)                | ~$2.60 (87%) |
| Apple, Small Business Program (15%)      | ~$2.54 (85%) |
| Apple, standard (30%, only above $1M/yr) | ~$2.09 (70%) |

At $2.99, Stripe's flat 30¢ per charge makes web and Apple almost equal on
monthly (about 6¢ apart).

At $29.99/year (about 16% off 12 × $2.99 = $35.88):

| Route                               | You keep      |
| ----------------------------------- | ------------- |
| Web (Stripe 2.9% + $0.30)           | ~$28.82 (96%) |
| Apple, Small Business Program (15%) | ~$25.49 (85%) |

Notes that hold at any price:

- RevenueCat is free up to $2,500 monthly tracked revenue, then 1% of revenue,
  on every route.
- Apple is merchant of record: it collects and remits sales tax and VAT. On
  web, that is our job (Stripe Tax is about 0.5% plus filings).
- Annual is where web keeps meaningfully more than Apple. Push annual on web.
- **Enrol in the App Store Small Business Program before the first sale.** It
  is not automatic. Eligibility is under $1M proceeds in the previous calendar
  year across all associated developer accounts.

## 3. Rules as of 2026-09-30

- **Auto-renewable subscriptions (Guideline 3.1.2):** the purchase screen must
  show the subscription name, length, and price, and have working links to the
  Terms of Use (EULA) and Privacy Policy. Add the Terms of Use link to the App
  Store description as well; missing it there is a common rejection.
- **Restore Purchases** must be reachable (paywall or Settings).
- **US storefront link-outs:** since the May 2025 guideline change, US apps may
  include buttons and links to web checkout with no entitlement. In-app purchase
  must still be offered. Apple currently charges **no commission** on those
  link-out purchases.
- **That may change.** The Ninth Circuit (Dec 2025) held that Apple may charge
  _some_ commission on link-outs and sent the rate back to the district court.
  Apple proposed 15% / 10% / **5% for Small Business Program apps**. The Supreme
  Court granted review of the contempt standard (June 2026), with arguments
  expected in the October 2026 term. Re-check before building a link-out.
- **Outside the US:** no purchase links. The EU allows them under separate
  terms with Apple fees. Elsewhere, only in-app purchase, or no purchase path.

Sources:
[Ninth Circuit opinion](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf),
[Fenwick summary](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple),
[Apple 10-Q (June 2026)](https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000020/aapl-20260627.htm),
[Rate proceedings (Aug 2026)](https://macdailynews.com/2026/08/14/u-s-supreme-court-clears-path-for-app-store-commission-showdown-as-apple-must-defend-its-rates-in-lower-court/),
[US guideline update (May 2025)](https://daringfireball.net/linked/2025/05/02/updated-app-review-guidelines-us),
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Small Business Program](https://www.apple.com/newsroom/2020/11/developers-see-a-world-of-possibilities-with-new-app-store-small-business-program/),
[RevenueCat pricing](https://costbench.com/software/subscription-billing/revenuecat/).

## 4. What already exists

| Piece                                                                     | State                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RevenueCat webhook, mirror, ledger, `has_active_entitlement`              | Done. Store-agnostic: Apple events land in the same mirror. `TRANSFER`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, refunds are handled (see the lifecycle reference). |
| Reconcile / refresh functions                                             | Deployed to sandbox/dev; schedule and secrets not configured yet.                                                                                             |
| Server Pro gate (`requireProEntitlement`)                                 | Done; Find Time and AI event edits use it.                                                                                                                    |
| Read-only lifecycle tooling (`tools/billing/lifecycle*.ts`)               | Done for web. Assumes `rc_billing` products and exactly one subscription; needs extending (§6).                                                               |
| Mobile plan state (`features/billing/hooks/useSubscription.ts`)           | Done; reads the mirror.                                                                                                                                       |
| Mobile upgrade screen (`features/billing/components/ProUpgradeModal.tsx`) | Design only. Prices are hard-coded and the button shows "In-app purchase is not set up in this build yet."                                                    |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`                                          | Already on the browser-safe allow-list in `tools/billing/contract.ts`. It is a public SDK key; that is expected.                                              |

## 5. The plan

### Step 0 — Accounts and paperwork (owner: founder, no code)

- [ ] Real bundle identifier. `apps/mobile/app.json` still has
      `com.example.calendarapp`, and `extra.eas.projectId` is all zeros.
- [ ] Apple Developer Program membership; app record in App Store Connect.
- [ ] **Paid Applications Agreement** accepted, with banking and tax info.
      Sandbox purchases do not work without it.
- [ ] Apply to the **App Store Small Business Program**.
- [ ] Seller identity, final Terms of Use and Privacy Policy (already a release
      gate for web). The paywall and App Store description must link to both.

### Step 1 — Store setup (App Store Connect + RevenueCat dashboard)

- [ ] Subscription group with two auto-renewable subscriptions, monthly and
      annual, at the final prices (§2). Suggested IDs: `bplan_pro_monthly_ios`,
      `bplan_pro_yearly_ios` (store product IDs must be unique per store; the
      web ones are `bplan_pro_monthly` / `bplan_pro_yearly`).
- [ ] RevenueCat: add the App Store app to the existing project.
- [ ] RevenueCat: **In-App Purchase key** (App Store Connect → Users and Access
      → Integrations → In-App Purchase: Issuer ID, Key ID, `.p8`). Required;
      StoreKit 2 transactions are not recorded without it.
- [ ] App Store Connect → App Information → **App Store Server Notifications
      V2**: paste RevenueCat's URL into both Production and Sandbox.
- [ ] Attach both products to the existing `pro` entitlement.
- [ ] Add an iOS offering with `$rc_monthly` / `$rc_annual` packages (the web
      offering is `bplan_web`).
- [ ] **Transfer behavior:** keep the default, "Transfer to new App User ID".
      The webhook already re-reads both owners on `TRANSFER`.
- [ ] Sandbox tester accounts in App Store Connect (one per scenario; see §6).

### Step 2 — Code (roughly a few focused days)

Follow `AGENTS.md`: SDK calls live in `features/billing/api/*` behind hooks,
SDK output is Zod-validated, and nothing grants Pro on the client.

- [ ] Install `react-native-purchases` (and `react-native-purchases-ui` only if
      we use RevenueCat's Customer Center). Needs a development build; Expo Go
      cannot load it. Minimum 9.5.4 if we want Test Store (§6).
- [ ] Configure once at startup with `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, then
      `Purchases.logIn(<Supabase user id>)` on sign-in and `logOut` on sign-out.
      The ID must be the same UUID the web checkout uses, or the webhook cannot
      attach the purchase.
- [ ] `ProUpgradeModal`: load the offering and show **StoreKit's localized
      price strings**, not `PRO_PLAN` constants. Purchase → on success,
      invalidate `queryKeys.subscription()` and poll briefly until the mirror
      says Pro (the webhook is a few seconds behind the SDK).
- [ ] Terms of Use and Privacy Policy links on the paywall.
- [ ] **Restore Purchases** on the paywall and in Settings. After a restore,
      show the Phase 6 "purchase restored" state.
- [ ] **Already Pro:** if the mirror says Pro, don't sell again. If they paid on
      web, say so and don't show the Apple button.
- [ ] **Manage subscription:** open `customerInfo.managementURL`. RevenueCat
      points it at the App Store or the RevenueCat Web Billing customer portal
      depending on where they paid. No schema change needed. Known quirk: after
      restoring a web purchase on iOS, the URL may switch to the App Store.
- [ ] States: loading, purchase cancelled by user (not an error), pending (Ask
      to Buy), network failure, already subscribed, store unavailable.
- [ ] The client may use RevenueCat's `CustomerInfo` for display only. The
      server gate stays the only authority (unchanged).

### Step 3 — Prove it (see §6)

- [ ] Offline StoreKit tests pass.
- [ ] One live Apple-sandbox lifecycle run per plan passes the read-only
      tooling.

### Step 4 — Release

- [ ] App Review notes: explain Pro, provide a demo account, mention restore.
- [ ] Terms of Use link in the App Store description.
- [ ] Production RevenueCat and App Store switch-on, together with the existing
      production billing gate.

### Later (optional) — US web link-out

- [ ] Only after §3 settles. US storefront only, next to (not instead of) the
      Apple button, pointing at the existing web checkout with the user's ID.

## 6. How we test it

Three layers, from cheapest to most real.

**A. RevenueCat Test Store (no Apple account needed).** A RevenueCat-hosted fake
store with a `test_` API key. Purchases update `CustomerInfo` and entitlements
and renew automatically (every 5 minutes for monthly, hourly for annual, up to
5 times). Good for building the paywall early, before Step 0 is finished. A
release build started with a `test_` key crashes on purpose, so it cannot leak.
Unconfirmed: whether Test Store events reach our webhook, and which store value
they carry. Check before relying on it for server tests.

**B. StoreKit testing in Xcode (offline, simulator).** A local
`.storekit` configuration file. Tests can buy, renew, cancel, refund, and
simulate failed payments. Only works when launched from Xcode. RevenueCat needs
the StoreKit test **certificate** uploaded to validate these receipts.
Limitation: it does not send cancellation or refund events to RevenueCat, so it
proves the app, not the server.

**C. Apple sandbox (real end-to-end, what we did for web).**

| Step                                               | Who                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in to the sandbox Apple Account on the device | **Founder**, once. Claude does not enter Apple credentials.                                                                                                    |
| Buy                                                | **Founder** taps the Apple payment sheet.                                                                                                                      |
| Renew                                              | Automatic. Sandbox default: 1 month = 5 minutes, 1 year = 1 hour; up to 12 renewals. Rate is set per tester in App Store Connect → Users and Access → Sandbox. |
| Cancel                                             | **Founder**: Settings → Developer → Sandbox Apple Account → Manage → Subscriptions → Cancel. RevenueCat's API cannot cancel Apple subscriptions.               |
| Expire                                             | Automatic.                                                                                                                                                     |
| Check                                              | Scripted: the existing read-only tooling, extended as below.                                                                                                   |

Note: **TestFlight renews only once a day** (since Dec 2024). Run the lifecycle
from an Xcode or development build with a sandbox account, not TestFlight.

Tooling changes needed in `tools/billing/`:

- [ ] Add the iOS products to `BILLING_CONTRACT` and let `--plan` select the
      store (for example `--store app_store`), so `inspectLifecycle` and the
      renewal observer accept `app_store` and the iOS product IDs.
- [ ] Re-tune the monthly observer windows if the Apple sandbox cadence differs
      from RevenueCat Web Billing's five minutes.
- [ ] Cancellation stays manual for Apple. The cancel command only confirms the
      state after the founder cancels (read-only).
- [ ] New GitHub Environment secrets for the iOS test identities.

Cross-store scenarios to prove once:

- [ ] Web subscriber signs in on iPhone → Pro, no Apple button.
- [ ] Apple subscriber signs in on web → Pro, "manage" points to the App Store.
- [ ] Same Apple ID restores on a second BPlan account → `TRANSFER`, Pro moves,
      the old account loses it.
- [ ] Someone ends up with both a web and an Apple subscription → still Pro
      until the later one expires. (The lifecycle tooling currently expects
      exactly one subscription; decide whether to support or just document
      this.)

Sources:
[RevenueCat: App Store & TestFlight testing](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store),
[RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store),
[Apple: sandbox account settings](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/),
[Apple: TestFlight renewal rate](https://developer.apple.com/help/app-store-connect/test-a-beta-version/subscription-renewal-rate-in-testflight),
[RevenueCat: Expo install](https://www.revenuecat.com/docs/getting-started/installation/expo),
[RevenueCat: In-App Purchase key](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration),
[RevenueCat: App Store Server Notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/apple-server-notifications),
[RevenueCat: transfer behavior](https://www.revenuecat.com/docs/projects/restore-behavior),
[RevenueCat: managing subscriptions / `managementURL`](https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions).

## 7. Open questions

- Android: same shape with Google Play (15% on subscriptions). Not planned yet.
- Do we show a free-trial or intro offer on Apple? It changes the App Store
  products and the paywall copy.
- Test Store webhooks (§6A): confirm before depending on them.

## 8. Done when

- [ ] Paywall sells monthly and annual with Apple's localized prices.
- [ ] Restore works and shows "purchase restored".
- [ ] Manage subscription opens the right place for web and Apple subscribers.
- [ ] Web subscribers are never offered a second subscription on iPhone.
- [ ] Offline StoreKit tests pass in CI or locally.
- [ ] Apple sandbox lifecycle (buy, renew, cancel, expire) proven live for both
      plans against RevenueCat, the mirror, the ledger, and server
      authorization.
- [ ] `pnpm verify` passes; checkpoint pushed.
