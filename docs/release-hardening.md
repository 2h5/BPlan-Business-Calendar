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
| Low      | Logging             | `withErrorHandling`, `runAfterResponse`, and some best-effort unwatch paths log `String(error)` for unexpected errors. Provider HTTP errors are already translated to fixed messages, so exposure is limited to library error text (for example a Zod issue's received enum value). Accepted for now; revisit with Sentry.                           | Open   |
| Info     | Tooling             | `deno lint` reports 66 pre-existing issues (mostly `require-await`) and is not run in CI. `supabase db lint` flags only the guarded dynamic pg_cron SQL, so it cannot gate as-is.                                                                                                                                                                    | Open   |

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
  `production` so the https guard applies.
- Existing open tracks: Microsoft live lifecycle matrix, hosted AI
  configuration/E2E, RevenueCat convergence rollout, seller/legal documents,
  production Stripe/RevenueCat.
