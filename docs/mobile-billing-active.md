# Mobile Billing — Running Tracker

Status: **TEST STORE PHASE COMPLETE — NEXT IS THE $99 APPLE ACCOUNT (updated 2026-10-04)**

The running log for iPhone in-app purchase. The _why_ and the full design live
in [`mobile-billing-plan.md`](mobile-billing-plan.md); this file tracks what is
done, what is next, and who owns each step. Update it at the end of every work
session.

Owners: **Founder** = dashboards, accounts, money, Apple credentials.
**Eng** = code in this repo.

---

## Now

Everything that can be done without the $99 Apple fee is done. What is left:

1. **Founder:** finish the Terms and Privacy pages. The links work, but both
   pages say "DRAFT — NOT FINAL. Do not use this page for production paid
   checkout." Must be final before App Review (Phase D).
2. **Eng:** run the A5 simulator checks for the review fixes (A4).
3. **Phase B onward** when ready to pay the $99 (below).
4. **Later:** confirm the RevenueCat webhook fires for Test Store purchases
   (only matters on the hosted sandbox; local runs use refresh).

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
- [x] `ProUpgradeModal` + new `PurchaseFooter`: store prices (localized; USD
      list prices only when the store priced nothing), buy the selected plan,
      renewal terms under the price, Restore Purchases, Terms/Privacy links
      (shown when configured).
- [x] After buy/restore: ask the server to refresh, poll the mirror for 20 s
      (`utils/await-pro.ts`), honouring the server's `retryAfterSeconds`;
      invalidate `queryKeys.subscription()`. The app never grants Pro itself.
      (Originally refreshed once and polled ~18 s — see Review fixes below.)
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
- [x] Server confirms a Test Store purchase on its own: with the mirror row
      removed, Settings → Restore purchases called `revenuecat-refresh`,
      which wrote `pro` / `active` and the app flipped to "BPlan Pro ACTIVE".
- [x] Web subscriber signs in on iPhone → Pro, no buy button (2026-10-04).
      Run as `dev@example.com`, who is seeded Pro in the mirror with no Apple
      purchase, which is exactly how a web subscriber looks to the phone (the
      mirror has no store column; web and Apple rows are the same shape).
      Results: Settings shows "BPlan Pro ACTIVE" with no upgrade or restore
      row; the plan page shows "Current plan", no buy button, no Restore;
      Manage subscription explains it isn't an App Store subscription.
      **Not covered:** a real RevenueCat Web Billing purchase. Web checkout is
      `disabled` locally, and the purchase tool (`pnpm billing:e2e:sandbox`)
      targets the hosted sandbox. For a real web subscriber, RevenueCat
      returns the Web Billing portal as `managementURL`, so Manage should open
      that instead of the note; check it in Phase C (plan §6).
- [x] Terms of Use and Privacy Policy links on the plan page
      (`https://bplan-business-calendar.pages.dev/terms` and `/privacy`), set
      in `apps/mobile/.env.example` and `.env.local`. Tapping opens the page
      in an in-app browser.

**Resolved 2026-10-04 with option 1.** Was: locally, `revenuecat-refresh` returns 503:
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

**Sign-out crash, fixed 2026-10-04.** Signing out crashed debug builds
(`[RNScreens] Invariant violation. Expected exactly 1 focused tab, got: 0`).
Cause: `app/(tabs)/_layout.tsx` returned `null` when signed out, which removed
the native tab bar while it was on screen; react-native-screens 4.16 then
checks a tab bar with no tabs and its debug-only assert aborts the app
(release builds skip the check). Fix: the tab bar stays mounted, and each tab
route wraps its content in `<SignedIn>`
(`src/features/auth/components/SignedIn.tsx`), so screens that need a user
still unmount before navigation. Verified: sign out → sign-in screen, no crash
report. Not caused by billing.

**Also fixed:** "Purchases delegate has already been configured" warning after
a JS reload. `purchases.api.ts` now asks `Purchases.isConfigured()` instead of
a module flag that a reload resets.

**Running it locally:** secrets are in `supabase/functions/.env`
(git-ignored; `REVENUECAT_READONLY_API_KEY`, `REVENUECAT_PROJECT_ID`,
`REVENUECAT_ENVIRONMENT=SANDBOX`). Start the functions with
`supabase functions serve --env-file supabase/functions/.env` alongside Metro.
The server answers `RECENTLY_VERIFIED` (does nothing) if the same user was
checked in the last minute; wait a minute between manual tests.

Note: a release build launched with a `test_` key crashes on purpose, so the
key can't leak into production.

### A4. Review fixes (Eng, 2026-10-04)

A Codex review of `0092c66` and `0937de7` (merged as `9acca68`) found four
P2 issues to fix before real Apple billing. All four were confirmed against
the code and fixed; a follow-up pass found five more, also fixed. Unit-tested
where the logic is pure; the hook and UI changes still need a simulator pass
(A5).

**From the review**

1. **Closing the paywall cleared the purchase lock.** `dismiss` called
   `flow.reset()`, which reset the mutation even while the store sheet or the
   server confirmation was running. Reopening showed an enabled buy button and
   the result was lost. **Fix:** `usePurchaseFlow().reset()` now refuses while
   a store action is in flight or a payment is `unconfirmed`; only finished
   results (failed, nothing to restore, done) are cleared. The modal is
   mounted at the root, so the flow survives being closed.
2. **Unknown plan status still permitted buying.** The paywall read only
   `isPro` and ignored `isLoading` / `isUnavailable`, so a failed entitlement
   read let an existing (e.g. web) subscriber buy a second subscription.
   **Fix:** buying needs a successful plan check — `purchaseBlocker()` in
   `ProUpgradeModal` blocks while loading, re-checking, or unavailable, with
   "Try again". The plan is also re-read each time the page opens
   (`usePlanState` gained `isChecking` and a stable `retry`), so a
   five-minute-old "free" answer can't sell over a fresh web purchase.
3. **Confirmation ignored server cooldowns.** It refreshed once and polled
   ~18 s, even when the server answered `RECENTLY_VERIFIED` / `BACKING_OFF` /
   `IN_PROGRESS` with `retryAfterSeconds` (e.g. a restore then a purchase
   within a minute). With no webhook (local runs), a paid user stayed
   unconfirmed until something else refreshed. **Fix:**
   `requestAccessRefresh()` now returns `retryAfterSeconds`; `awaitServerPro`
   never refreshes before it, refreshes again inside the window once a short
   cooldown lapses, and returns `retryAt` when it runs out. The flow then
   re-checks automatically at `retryAt` (up to 3 rounds) and the page shows a
   **Check again** button as the manual recovery path.
4. **Displayed price could differ from the purchased product.** When either
   package was missing, both prices fell back to USD constants while the
   other package stayed purchasable (a €5.99 product shown as $2.99).
   **Fix:** `buildPaywallPrices` uses each plan's own store price; a missing
   plan shows "—" and can't be bought; savings appear only when both plans
   are priced in the same currency. USD list prices appear only when the
   store priced nothing (nothing is purchasable then).

**Found in the follow-up pass**

5. **Purchase state leaked across accounts.** The root-mounted paywall keeps
   its flow through sign-out, so (once fix 1 kept results) the next account
   would inherit "Payment received" and a locked button. **Fix:** the flow
   resets when `userId` changes.
6. **Paywall purchase and Settings restore could run at once.** Each had its
   own `usePurchaseFlow`; after closing the paywall mid-purchase, Settings →
   Restore could start a second store call. **Fix:** buy, restore and
   re-check are one mutation under the shared key
   `queryKeys.purchases.storeAction()`; `isBusy` (via `useIsMutating`) locks
   both UIs while any of them runs.
7. **Restore was blocked by unrelated failures.** Restore Purchases was
   disabled whenever the buy button was (prices loading or failed). Restoring
   never charges, so it now only waits for another store action.
8. **Free plan always showed "$0".** It now uses the store currency ("0 €").
9. **Savings badge without comparable prices.** The toggle's "Save N%" hides
   when there is no same-currency pair.

**Checked and not an issue:** a paused or billing-issue subscription is not
offered a second purchase — the webhook maps `SUBSCRIPTION_PAUSED` and
`BILLING_ISSUE` to `active` (`revenuecat-webhook/events.ts`).

**Second Codex review (of `5ab049c`, merged as `249d348`)** — all three
confirmed and fixed:

10. **A failed plan re-check could still enable buying (P2).** A free
    account's cached answer is `null`, not `undefined`, so after a failed
    refetch `isUnavailable` stayed false and the stale "Free" allowed a
    purchase — a web subscriber could buy again. **Fix:** buying needs a
    successful read newer than the moment the page opened.
    `usePlanState` exposes `lastCheckFailed` and `checkedAt`;
    `purchaseBlocker` (moved to `utils/purchase-gate.ts`) blocks on any failed
    latest read or an answer older than `openedAt`. The Plan card's display
    is unchanged (it still shows the last answer).
11. **The unconfirmed lock wasn't shared between flows (P2).** It lived in
    each `usePurchaseFlow`'s own mutation, so after Settings → Restore found
    a purchase but confirmation timed out, the paywall could sell between
    re-check rounds. **Fix:** the lock moved to a shared Zustand store
    (`src/store/purchase-lock.store.ts`; client-only knowledge, not a mirrored
    row), keyed by user. Every flow reads it, the confirming flow writes it
    (`nextPurchaseLock`), and automatic re-checks are scheduled by every
    mounted flow but run by the first to fire (`queryClient.isMutating`).
12. **Annual announced as "Monthly billing" to VoiceOver (P3)** when savings
    were hidden. The fallback label is now `LABELS[option]`.

**Known limits (accepted for now)**

- The unconfirmed lock lives in memory. If the app is killed mid-confirmation
  the lock is gone on relaunch; the App Store blocks a second subscription in
  the same group, and the server converges through webhook/reconcile.
- No hook-level tests (the mobile suite has no React renderer); the pure
  parts — `await-pro`, `paywall-prices`, `purchase-gate` — are covered
  (24 tests).

### A5. Re-prove after the review fixes (simulator, not done yet)

- [ ] Buy, close the page during "Confirming…", reopen → still confirming,
      buy button locked; result appears when it lands.
- [ ] Restore, then buy within a minute → server answers `RECENTLY_VERIFIED`;
      page shows "Payment received", re-checks on its own after the cooldown
      and flips to Pro without a webhook.
- [ ] Stop local Supabase, open the paywall as `free@example.com` → "Couldn't
      check your current plan" with Try again, no buy.
- [ ] Sign out with an unconfirmed payment, sign in as another user → clean
      page.
- [ ] Settings → Restore disabled while the paywall's purchase is confirming.
- [ ] Open the paywall once (Free cached), stop local Supabase, reopen →
      "Couldn't check your current plan", no buy; restart and Try again →
      buy enabled.
- [ ] Settings → Restore with confirmation timing out (refresh within the
      cooldown) → open the paywall → "Payment received", buy locked, Check
      again available.
- [ ] VoiceOver on the billing toggle reads "Annual billing" when no saving
      is shown.

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
- [ ] Set the build's public values in EAS (`eas env:create`, or `env` in
      `eas.json`): `EXPO_PUBLIC_REVENUECAT_IOS_KEY`,
      `EXPO_PUBLIC_BILLING_TERMS_URL`, `EXPO_PUBLIC_BILLING_PRIVACY_URL`, plus
      the Supabase URL and anon key. `.env.local` is git-ignored, so cloud
      builds don't see it; without the two URLs the paywall hides the links.

## Phase C — Apple testing

- [ ] Offline StoreKit tests (`.storekit` file in Xcode).
- [ ] Apple sandbox lifecycle per plan (buy, renew, cancel, expire), checked
      by `tools/billing/` extended for `app_store`.
- [ ] Cross-store scenarios (plan §6).

## Phase D — Release

- [ ] App Review notes, demo account, restore mentioned.
- [ ] Terms and Privacy pages final (drop the DRAFT banner); see Now.
- [ ] Terms of Use link in the App Store description.
- [ ] Production switch-on, together with the web production billing gate.

---

## Done log

Newest first. One line per finished item, with the date and commit if any.

- 2026-10-04 — Second review fixes (A4 #10–12): buying needs a successful
  plan read since the page opened; unconfirmed-payment lock shared across
  the paywall and Settings; toggle accessibility label. `pnpm verify` passes.
- 2026-10-04 — Review fixes (A4): purchase lock survives closing the page,
  buying needs a successful plan check, confirmation honours server
  cooldowns with auto re-check and "Check again", prices never mix store and
  USD; plus account-switch reset, one store action at a time, restore no
  longer blocked by prices. `pnpm verify` passes. Simulator re-check (A5)
  pending.
- 2026-10-04 — Terms/Privacy links on the paywall; web-subscriber check on
  iPhone (passes, real web purchase still Phase C); sign-out crash fixed;
  duplicate RevenueCat configure warning fixed. `pnpm verify` passes.
- 2026-10-04 — Local server confirmation working (option 1): RevenueCat
  read-only key in `supabase/functions/.env`; restore in the app writes Pro
  to the mirror and the app shows it.
- 2026-10-04 — Pushed `feat/mobile-iap-test-store`.
- 2026-10-04 — A2 code done and A3 simulator run on
  `feat/mobile-iap-test-store` (uncommitted): buy, cancel, fail, restore,
  manage all behave; RevenueCat records purchases on the Supabase user ID.
  Blocked on the server confirming Test Store purchases locally.
- 2026-10-04 — Test Store dashboard set up (A1): two products on `pro`,
  offering `bplan_ios`, key saved to `apps/mobile/.env.local`.
- 2026-10-04 — Tracker created. Decided to defer the Apple fee and start on
  Test Store.
- 2026-09-30 — Plan written ([`mobile-billing-plan.md`](mobile-billing-plan.md)).
