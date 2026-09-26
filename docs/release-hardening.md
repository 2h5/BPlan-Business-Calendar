# Production release hardening

Active tracker for release-blocking issues that can be found and fixed in
code, tests, and CI. Hosted deployment, secrets, provider setup, and paid calls
are out of scope here and are listed under **External verification**.

## Pass 1 — 2026-09-25

Baseline on `main` at `57db658`: `pnpm verify`, Deno check/test (334), and
pgTAP (326 on a fresh disposable stack) were green, and generated DB types were
current. All database work in this pass ran on a separate disposable local
stack (`project_id = calendar-audit`); no existing local data was reset.

### Findings

| Severity | Area                | Finding                                                                                                                                                                                                                                                                                                                                              | Status |
| -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Critical | Billing convergence | `ensure_revenuecat_reconcile_schedule()` guarded on `to_regproc('cron.schedule')`, which is NULL even with pg_cron installed because `cron.schedule` is overloaded. The installer always returned `EXTENSIONS_UNAVAILABLE`, so the five-minute reconciliation job could never be installed. The existing pgTAP assertion accepted that outcome.      | Fixed  |
| High     | Sync convergence    | Migration 0007 installed the sync cron jobs only from `app.settings.*`, which the `postgres` role cannot set on Postgres 15+ (`permission denied to set parameter`), used the same broken guard, embedded the secret in `cron.job`, and used pg_net's 5 s default timeout. There was no working install path for watch renewal, retry, or reconcile. | Fixed  |
| Medium   | Sync convergence    | `sync-cron` read at most 500 active accounts for daily reconcile and 100 rows per watch-renewal query, unordered. Rows past the cap were silently never reconciled/renewed.                                                                                                                                                                          | Fixed  |
| Medium   | Secret handling     | Web and mobile env loaders accepted a service-role / `sb_secret_` key in the public anon-key variable, and an `http://` or loopback Supabase URL outside development.                                                                                                                                                                                | Fixed  |
| Low      | Auth                | `sync-cron` secret and Google channel token were compared with `!==` instead of the constant-time helper used by billing and Microsoft.                                                                                                                                                                                                              | Fixed  |
| Low      | CI coverage         | CI built only `@cal/web`; `pnpm verify` also compiles the billing CLI (`billing:build`).                                                                                                                                                                                                                                                             | Fixed  |
| Low      | Logging             | `withErrorHandling`, `runAfterResponse`, and some best-effort unwatch paths log `String(error)` for unexpected errors. Provider HTTP errors are already translated to fixed messages, so exposure is limited to library error text (for example a Zod issue's received enum value). Fixed in Pass 2.                                                 | Fixed  |
| Info     | Tooling             | `deno lint` reports 66 pre-existing issues (mostly `require-await`) and is not run in CI. `supabase db lint` flags only the guarded dynamic pg_cron SQL. Both gated in Pass 2.                                                                                                                                                                       | Fixed  |

### Fixes

- `supabase/migrations/20260925000001_cron_schedule_installers.sql`
  - New `public.ensure_sync_schedules()`: operator-only, idempotent, reads
    `sync_cron_url` and `sync_cron_secret` from Vault each run, validates the
    URL, replaces the four 0007 job names, 55 s pg_net timeout.
  - `ensure_revenuecat_reconcile_schedule()` replaced with the exact
    `to_regprocedure('cron.schedule(text,text,text)')` guard.
- `supabase/functions/_shared/sync/cron.ts`: fail-closed constant-time
  `requireCronSecret` and ordered `readAllPages`; `sync-cron` uses both.
- `webhook-google/handler.ts`: constant-time channel-token comparison.
- `packages/schemas/src/client-env.schema.ts`: `isPrivilegedSupabaseKey` and
  `refinePublicSupabaseConfig`, applied to both apps' env schemas.
- `.github/workflows/ci.yml`: `pnpm build` instead of the web-only build.
- `packages/types/src/database.types.ts`: regenerated.

### Tests added

- `supabase/tests/cron_schedules.test.sql` (14): installs pg_cron/pg_net and
  Vault secrets inside the test transaction and asserts both installers
  return `INSTALLED`, create the expected jobs and cadences, keep secrets out
  of `cron.job`, are idempotent, refuse a bad URL, and are operator-only.
- `supabase/functions/_shared/sync/cron.test.ts` (6): secret fail-closed /
  mismatch / prefix cases and pagination past the cap, exact multiples, and
  errors.
- `webhook-google/handler.test.ts`: prefix-token rejection case.
- `apps/web/src/lib/env-guard.test.ts` (5): privileged-key and URL guards.

### Verification

- `pnpm verify`: pass.
- Deno `task check` + `task test`: 340 passed.
- `supabase db reset` on the disposable stack (all 38 migrations from empty),
  then `supabase test db`: 15 files, 340 tests, pass.
- Generated types match the reset database after regeneration.

### Audited and sound

- Every public table has RLS; client-writable tables have per-command
  policies; server-only tables (`calendar_sync_states`, `oauth_states`,
  `subscription_events`, billing queue/state, AI overrides) have none.
- No SECURITY DEFINER function is executable by `anon`/`authenticated` except
  where intended, and all set `search_path`. `calendar_sync_health` is a
  definer view filtered by `auth.uid()` and covered by pgTAP.
- Avatar storage policies are owner-folder scoped; account deletion removes
  avatars and releases provider grants before deleting the auth user.
- Edge Functions: user-facing functions resolve ownership from the database;
  cron/webhook functions are fail-closed on missing secrets; OAuth state is
  single-use, deleted before code exchange, and return targets are an
  allowlist; provider errors are translated to fixed messages.
- RevenueCat webhook: shared secret plus optional HMAC with freshness window,
  constant-time comparison, idempotent event ledger (prior hardening pass).
- Provider upserts are keyed on `(provider_account_id, provider_event_id)`;
  retries only replay safe requests and honour bounded `Retry-After`.
- AI: Find Time is server-gated to Pro; confirmation deliberately does not
  re-check entitlement (Sprint 6 decision); model output is schema-validated
  and limited to engine-generated slot ids.
- Migrations replay in order on an empty database; generated types were
  current at baseline.

## Pass 2 — 2026-09-25

Scope: the items Pass 1 left open (unsafe error logging, `deno lint`,
`supabase db lint`), production-config guards, missing offline release checks,
and a dependency audit. Pass 1 findings were not re-audited. Database work
again used the disposable `calendar-audit` stack only.

### Findings

| Severity | Area            | Finding                                                                                                                                                                                                                                                               | Status              |
| -------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Medium   | Sensitive logs  | Nine catch-all paths logged `String(error)`. Deno fetch errors quote the full request URL (Google `syncToken`/page tokens, Microsoft delta links, calendar ids that are email addresses), and Zod errors quote the rejected input, so both could reach function logs. | Fixed               |
| Medium   | Billing config  | A web build with `VITE_APP_ENV=production` and `VITE_BILLING_MODE=sandbox` started normally and offered working sandbox checkout on the live site. Purchase, management, Terms, and Privacy links were not required to be https.                                      | Fixed               |
| Low      | Release safety  | Web env was validated only in the visitor's browser, so a bad Cloudflare configuration deployed successfully and failed on first page load.                                                                                                                           | Fixed               |
| Low      | Info disclosure | `requireEnv` returned `Missing <ENV_NAME>` in the 500 body, telling any caller which server secret was unset.                                                                                                                                                         | Fixed               |
| Low      | CI coverage     | Nothing enforced "never edit a merged migration" or migration ordering, and nothing checked the built client bundle for server-only secrets or server variable names.                                                                                                 | Fixed               |
| Info     | Tooling         | `deno lint`: 69 findings (Pass 1's 66 plus 3 from the new `cron.test.ts`): 61 `require-await`, 7 unused bindings, 1 `any`. `supabase db lint`: 2 errors, both `cron` schema missing in the linted database.                                                           | Fixed (gated in CI) |
| Info     | Dependencies    | `pnpm audit`: 1 critical, 5 high, 9 moderate. All but one are dev/build tooling; `decode-uri-component@0.2.2` ships in the mobile runtime via React Navigation. `deno audit`: none. See triage below.                                                                 | Open (triaged)      |
| Info     | Stale config    | `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` are in `apps/mobile/.env.example` but nothing reads them yet.                                                                                                                                                       | Open (no risk)      |

### Fixes

- `supabase/functions/_shared/errors/safe-error.ts`: `describeError` keeps
  the error class, a stable `code`, an HTTP `status`, the cause's class, and a
  bounded message with URL query strings, fragments, and credentials removed,
  non-trivial path segments masked, and bearer/basic values, secret-named
  key/value pairs, JWTs, Supabase keys, emails, and long opaque strings masked.
  Zod-style errors keep only issue codes and paths. Non-`Error` throwables are
  reduced to their type. All nine `String(error)` log sites use it.
- `supabase/functions/_shared/env.ts`: one `requireEnv` for auth and provider
  config; the variable name goes to the log (`SERVER_ENV_MISSING`) and the
  caller gets a generic message.
- `deno lint` is clean. Fixed: unused imports and bindings, a test `as any`,
  and a no-op `async` callback in `webhook-google`. `finishAttempt`,
  `ensureWatch`, and Microsoft `incrementalSync` stay `async` on purpose
  (synchronous throws become rejections for awaiting callers) and have
  justified line ignores. Seven test files whose async stubs implement
  Promise-returning dependency interfaces have a file-level `require-await`
  ignore. No rule is disabled globally. CI runs `deno lint`.
- `supabase db lint`: not a false positive to work around. plpgsql_check
  follows the installers' constant `EXECUTE` strings into `cron.*`, which does
  not exist until pg_cron is enabled. With `pg_cron` and `pg_net` enabled, as
  on a hosted project that installs schedules, the lint is clean and checks
  that SQL against the real `cron` schema. CI enables both extensions in its
  throwaway database as the last database step and runs
  `supabase db lint --level warning --fail-on warning`. I confirmed the gate
  fails (exit 1) without the extensions.
- `apps/web/src/features/billing/utils/billing-checkout.ts`:
  `billingEnvIssues` rejects sandbox checkout in production and non-https
  billing links outside development; the web env schema applies it.
- `apps/web/src/lib/env-schema.ts` + `vite.config.ts`: builds labelled
  `VITE_APP_ENV=preview|production` validate the env before writing assets
  (loaded through Vite's module runner so dev and Vitest are unaffected).
  Unlabelled local and CI builds keep the in-browser startup check.
- `tools/release/`: `check-client-bundle.mjs` (run at the end of `pnpm build`)
  and `check-migrations.mjs` (CI static job, against the PR base or the
  previous push, with full history).

### Tests added

- `_shared/errors/safe-error.test.ts` (6): fetch URL scrubbing, credential
  masking, Zod input suppression, code/status/cause preservation, non-`Error`
  values, length bound.
- `_shared/env.test.ts` (2): the missing name is logged but not returned.
- `billing-checkout.test.ts` (+2): sandbox-in-production and https rules.
- `apps/web/src/lib/env-schema.test.ts` (3): build-time guard accepts valid
  production env, rejects invalid preview/production env, skips development.
- `tools/release/client-bundle-scan.test.ts` (4) and
  `migration-rules.test.ts` (4), run by `pnpm test` (`release:test`).

### Dependency triage

| Advisory (severity)                                                     | Where                                              | Reachable in production?                                                                         | Action                                                                                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest UI file read/exec (critical), mocker path traversal (moderate)   | `vitest@2.1.9` (root, web, domain)                 | No. Test runner only; the UI advisory needs `vitest --ui`, and `@vitest/ui` is not installed.    | Fix needs Vitest 4, a major upgrade; schedule separately.                                                                                             |
| Vite `fs.deny` bypass (high), 3 moderate; esbuild dev server (moderate) | `vite@5.4.21`/`esbuild@0.21.5` nested under Vitest | No. Dev/test servers only. The app's own Vite is 6.4.3 (patched).                                | Resolved by the same Vitest upgrade.                                                                                                                  |
| postcss (2 high, 2 moderate), image-size (2 high), uuid (moderate)      | Expo CLI / Metro / `xcode` build tooling           | No. Build-time, on our own assets and config.                                                    | Follow the next Expo SDK patch release.                                                                                                               |
| decode-uri-component DoS (moderate)                                     | React Navigation → `query-string@7`                | Mobile runtime deep-link parsing. Impact is a hang on the user's own device from a crafted link. | Left open. The patched line is ESM-only and `query-string@7` `require`s it, so an override would break linking. Track React Navigation/Expo upgrades. |

### Verification

- `pnpm verify`: pass (domain 348, mobile 11, web 384, billing 201,
  release 8; build and client-bundle scan clean).
- Deno: `deno lint` clean (126 files), `deno task check` pass,
  `deno task test` 348 passed.
- Disposable stack: `supabase db reset` (38 migrations from empty),
  `supabase test db` 15 files / 340 tests pass; generated types match;
  `supabase db lint --fail-on warning` clean with pg_cron/pg_net; billing race
  harness passed (pointed at the disposable port, not the running
  `calendar-billing` stack).
- `check-migrations.mjs` passes against `origin/main` and against the Pass 1
  base `57db658`.
- `git diff --check`: clean.

### Audited and sound (Pass 2)

- AI config fails closed (`AI_PROVIDER_UNAVAILABLE`, 503) on a missing key,
  unsupported provider, or out-of-range timeout/effort.
- RevenueCat webhook and reconcile require an explicit
  `REVENUECAT_ENVIRONMENT` (no default) and return 503 until configured;
  sandbox/production events are routed by the configured environment.
- OAuth return URLs are server-selected from an allowlisted target; the
  mobile default is the app scheme and only fixed status codes travel in the
  URL. Microsoft tenant defaults to `common` by design.
- Watch webhook URLs default to `SUPABASE_URL`; Google and Microsoft reject
  non-https notification URLs themselves, so a misconfiguration fails closed.
- Client-side logging is development-only (mobile `logger.ts`, web query
  client).

## External verification still required

- Hosted: enable `pg_cron` and `pg_net`, create Vault secrets
  `sync_cron_url`, `sync_cron_secret`, `revenuecat_reconcile_url`, and
  `billing_reconcile_cron_secret`, set the matching Edge secrets, then run
  `select public.ensure_sync_schedules();` and
  `select public.ensure_revenuecat_reconcile_schedule();` and confirm both
  return `INSTALLED` and the jobs run (`cron.job_run_details`).
- If migration 0007 ever installed legacy sync jobs on a hosted project, the
  installer replaces them; confirm no job command still contains a secret.
- Hosted Auth: email confirmations on, production Site URL and redirect
  allowlist (local `config.toml` is development-only).
- Web/mobile production builds: `VITE_APP_ENV` / `EXPO_PUBLIC_APP_ENV` set to
  `production` so the https guard applies. On Cloudflare Pages this label also
  turns on the build-time env check (Pass 2); an unlabelled build skips it.
  Mobile has no build-time equivalent yet, so its guard runs at app start.
- Keep `VITE_BILLING_MODE` at `disabled` or `production` in the production Pages
  environment; `sandbox` now fails the production build by design.
- Dependency follow-ups (not release-blocking): Vitest 2 → 4 to clear the
  dev-only Vitest/Vite/esbuild advisories; the next Expo SDK patch for Metro/
  postcss/image-size; React Navigation for `decode-uri-component`.
- Existing open tracks: Microsoft live lifecycle matrix, hosted AI
  configuration/E2E, RevenueCat convergence rollout, seller/legal documents,
  production Stripe/RevenueCat.
