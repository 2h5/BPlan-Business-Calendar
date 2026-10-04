# Mobile Billing — Running Tracker

Status: **TEST STORE PHASE — APP CODE DONE AND TESTED IN SIMULATOR; SERVER CONFIRMATION BLOCKED LOCALLY (updated 2026-10-04)**

The running log for iPhone in-app purchase. The _why_ and the full design live
in [`mobile-billing-plan.md`](mobile-billing-plan.md); this file tracks what is
done, what is next, and who owns each step. Update it at the end of every work
session.

Owners: **Founder** = dashboards, accounts, money, Apple credentials.
**Eng** = code in this repo.

---

## Now

1. **Blocker — Founder decision:** let the server confirm Test Store purchases
   (see "Blocker" under A3). Until then a purchase ends at "Payment received.
   Pro will switch on in a moment" and Pro never switches on.
2. **Founder:** final Terms of Use and Privacy Policy URLs →
   `EXPO_PUBLIC_BILLING_TERMS_URL` / `EXPO_PUBLIC_BILLING_PRIVACY_URL`. The
   paywall hides the links until they're set; Apple requires them.
3. **Eng:** commit branch `feat/mobile-iap-test-store` once reviewed.

## Decisions

| Date       | Decision                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-30 | iPhone sells through Apple via RevenueCat; web keeps its own checkout; server is the only Pro authority. See the plan §1.                                                                              |
| 2026-09-30 | Prices $2.99/month, $29.99/year.                                                                                                                                                                       |
| 2026-10-04 | **Defer the $99 Apple Developer Program fee** until the app is close to launch. Build the purchase flow against RevenueCat Test Store first (free, no Apple account). Web Pro keeps selling meanwhile. |

---

## Phase A — RevenueCat Test Store (free, no Apple account)

Goal: the upgrade screen buys monthly/annual in the simulator, restore works,
and the app shows Pro.

### A1. Dashboard setup (Founder)

- [x] Test Store exists (it was created with the project on 2026-09-09).
      Its `test_` key is in `apps/mobile/.env.local` as
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (git-ignored).
- [x] Test Store products (identifiers and prices can't be edited later):
  - `bplan_pro_monthly_test` — monthly, $2.99 (`prod02060e472c`)
  - `bplan_pro_yearly_test` — yearly, $29.99 (`prode3a70ca79b`)
- [x] Both attached to the **`pro`** entitlement.
- [x] Offering **`bplan_ios`** ("BPlan Pro iOS", `ofrng9aa411d25a`):
      `$rc_monthly` → `bplan_pro_monthly_test`, `$rc_annual` →
      `bplan_pro_yearly_test`. `bplan_web` untouched.

Notes on what was already in the project:

- The **`default`** offering and the starter Test Store products
  `monthly` / `yearly` / `lifetime` (2026-09-09) unlock
  `bplan_business_calendar_pro`, **not** `pro`, so they would never turn on
  Pro in our app. Left untouched; the app must fetch `bplan_ios` by
  identifier, not the current offering. Consider deleting them later.

### A2. Code (Eng) — done 2026-10-04, branch `feat/mobile-iap-test-store`

- [x] `react-native-purchases` 10.11.0 installed; development build runs in
      the iPhone simulator (Xcode workspace `apps/mobile/ios`, scheme
      `Calendar`, plus Metro via `expo start --dev-client`).
- [x] `features/billing/api/purchases.api.ts` — the only SDK file. Configures
      with the Supabase user ID as the RevenueCat app user ID; switches on
      sign-in, `logOut` on sign-out; identity changes are serialised. Asks for
      the `bplan_ios` offering by name. Product fields Zod-validated.
- [x] `billing.api.ts` `requestAccessRefresh()` — the same
      `revenuecat-refresh` call the web uses, so the server re-reads
      RevenueCat right after a purchase instead of waiting for the webhook.
- [x] Hooks (`hooks/usePurchases.ts`): `usePurchaserSync`, `useStorePlans`,
      `usePurchaseFlow` (buy + restore), `useManageSubscription`.
- [x] `ProUpgradeModal` + new `PurchaseFooter`: store prices (localized, USD
      list prices only as a fallback), buy the selected plan, renewal terms
      under the price, Restore Purchases, Terms/Privacy links (shown when
      configured).
- [x] After buy/restore: refresh once, poll the mirror ~20 s
      (`utils/await-pro.ts`), invalidate `queryKeys.subscription()`. The app
      never grants Pro itself.
- [x] States: loading prices, not set up in this build, cancelled (silent),
      failed, pending (Ask to Buy), offline, store unavailable, payment
      received but unconfirmed (buy button locked), restored, nothing to
      restore, already Pro (no buy button — covers web subscribers).
- [x] Restore purchases row in Settings → Plan (`RestorePurchasesRow`).
- [x] Manage subscription opens `managementURL`, or explains when there is
      none (Test Store has none).
- [x] Unit tests: `purchase-outcome`, `await-pro`, `paywall-prices` (14).
- [x] `pnpm verify` passes.
- [x] Seed: second local user **`free@example.com`** (`password123`), on the
      free plan, for testing the upgrade flow.

### A3. Prove it (simulator, 2026-10-04, as `free@example.com`)

- [x] Paywall loads Test Store prices: $2.99/month, $29.99/year,
      "$2.50/mo, save $5.89", Save 16%.
- [x] Cancel → back to the page, no message, still Free.
- [x] Test failed purchase → "The purchase didn't go through. You weren't
      charged."
- [x] Test valid purchase (annual) → RevenueCat records it on customer
      `22222222-2222-2222-2222-222222222222` (the Supabase user ID), `pro`
      active, renews hourly. App shows "Payment received. Pro will switch on
      in a moment", buy button locked.
- [x] Restore → finds the purchase. With a mirror row present (inserted by
      hand to stand in for the server, then removed) the page flips to
      "You're on BPlan Pro / Current plan / Purchase restored. Pro is on."
- [x] Settings shows "Restore purchases" under the upgrade row.
- [ ] Server confirms a Test Store purchase on its own (blocked, below).
- [ ] Web subscriber signs in on iPhone → Pro, no buy button. (Covered by the
      existing `isPro` path; not run against a real web purchase yet.)

**Blocker — server confirmation.** Locally, `revenuecat-refresh` returns 503:
the local Supabase isn't serving edge functions with RevenueCat keys, and the
RevenueCat webhook can't reach `127.0.0.1`. So the mirror never gets the
Test Store purchase. Options (founder decides):

1. **Local secrets:** give the local functions `REVENUECAT_READONLY_API_KEY`,
   `REVENUECAT_PROJECT_ID`, `REVENUECAT_ENVIRONMENT=SANDBOX` (via
   `supabase/functions/.env`, git-ignored) and run `supabase functions serve`.
   The refresh path is store-agnostic, so it should grant from a Test Store
   purchase (Test Store purchases are sandbox).
2. **Point the dev build at the sandbox Supabase project**, where the webhook
   and refresh are deployed (their secrets/schedule still need setting).

**Open question answered (partly):** Test Store purchases land in RevenueCat
as sandbox purchases on the right app user ID. Whether the _webhook_ fires for
them is still unconfirmed; option 1 doesn't need it.

**Unrelated bug found:** signing out crashes the iOS app
(`[RNScreens] Expected exactly 1 focused tab, got: 0`). Logged as a separate
task; not caused by billing.

Note: a release build launched with a `test_` key crashes on purpose, so the
key can't leak into production.

---

## Phase B — Apple account and store setup (costs $99/year; deferred)

Do this when the app is close to launch. Details in the plan §5 Steps 0–1.

- [ ] Real bundle identifier (`apps/mobile/app.json` still has
      `com.example.calendarapp`) and EAS project ID (still all zeros).
- [ ] Apple Developer Program membership ($99/yr); app record in App Store
      Connect.
- [ ] Paid Applications Agreement, banking, tax.
- [ ] Apply to the App Store Small Business Program (before the first sale).
- [ ] Subscription group: `bplan_pro_monthly_ios`, `bplan_pro_yearly_ios`.
- [ ] RevenueCat: add the App Store app, In-App Purchase key (`.p8`), App
      Store Server Notifications V2 URL (production and sandbox).
- [ ] Attach iOS products to `pro`; add them to the iOS offering.
- [ ] Sandbox tester accounts.
- [ ] Swap `EXPO_PUBLIC_REVENUECAT_IOS_KEY` from `test_` to the App Store key.

## Phase C — Apple testing

- [ ] Offline StoreKit tests (`.storekit` file in Xcode).
- [ ] Apple sandbox lifecycle per plan (buy, renew, cancel, expire), checked
      by `tools/billing/` extended for `app_store`.
- [ ] Cross-store scenarios (plan §6).

## Phase D — Release

- [ ] App Review notes, demo account, restore mentioned.
- [ ] Terms of Use link in the App Store description.
- [ ] Production switch-on, together with the web production billing gate.

---

## Done log

Newest first. One line per finished item, with the date and commit if any.

- 2026-10-04 — A2 code done and A3 simulator run on
  `feat/mobile-iap-test-store` (uncommitted): buy, cancel, fail, restore,
  manage all behave; RevenueCat records purchases on the Supabase user ID.
  Blocked on the server confirming Test Store purchases locally.
- 2026-10-04 — Test Store dashboard set up (A1): two products on `pro`,
  offering `bplan_ios`, key saved to `apps/mobile/.env.local`.
- 2026-10-04 — Tracker created. Decided to defer the Apple fee and start on
  Test Store.
- 2026-09-30 — Plan written ([`mobile-billing-plan.md`](mobile-billing-plan.md)).
