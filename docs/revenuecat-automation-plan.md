# RevenueCat Web Billing Automation Plan

## 2026-09-24 hardening checkpoint (review branch)

**PROVEN LOCAL (repository tests):** The `billing/revenuecat-hardening` branch
adds a RevenueCat convergence path: `20260924000001_revenuecat_convergence.sql`,
an environment-checked webhook decision, a bounded read-only API v2 adapter, a
lease-fenced scheduled reconciler, and a signed-in user's access refresh. A
missing RevenueCat customer is `UNVERIFIED` and leaves mirror access unchanged.
The webhook tests use fixtures built from RevenueCat's documented sample
payloads (TRANSFER, SUBSCRIPTION_PAUSED, PURCHASE_REDEEMED, a refund
CANCELLATION); they are not captured provider deliveries. Replay ordering,
RLS/function grants, and two-connection races are covered by pgTAP and the
local race harness, which CI runs. The CLI acceptance tools keep
`REVENUECAT_API_KEY` for observations and require a distinct
`REVENUECAT_MUTATION_API_KEY` only for explicit `sandbox-cancel`.
Configuration enforces key separation and mode boundaries; it cannot inspect
the permissions assigned to either provider key.

Convergence behaviour on this branch:

- RevenueCat's entitlement catalog is cached per project in
  `revenuecat_provider_state` (15-minute freshness, one fetcher at a time) and
  backs off on failure. A project-wide customer-read failure (invalid key or 429) blocks every RevenueCat read until its backoff ends. Neither the worker
  nor user refreshes can repeatedly spend the 60-per-minute
  project-configuration limit.
- User refresh (`revenuecat-refresh`) respects the same per-user backoff as the
  worker and answers `BACKING_OFF` with `retryAfterSeconds`.
- A snapshot that loses to a newer webhook row stays pending and is retried
  once it can be dated after that row, instead of completing as `STALE`.
- CANCELLATION and BILLING_ISSUE are applied and also reconciled, so refund and
  grace-period access follows RevenueCat's answer rather than an assumption
  about `expiration_at_ms`.
- A webhook delivery that reaches the function but cannot be committed queues a
  reconciliation for every user it named (`WEBHOOK_FAILED`).
- Hints lock users in `user_id` order, so opposite-direction transfers cannot
  deadlock.

**PROVEN HOSTED:** The 2026-09-23 Phase 6 atomic migration and webhook version 6
were deployed and checked read-only in the sandbox/dev Supabase project. The
protected lifecycle read-only workflow passed. Those observations predate this
hardening branch and do not prove the new reconciliation functions or migration
are hosted.

**PENDING external/provider evidence:** The new migration, webhook revision,
`revenuecat-reconcile`, and `revenuecat-refresh` have not been deployed.
Follow the deployment order and schedule installation in
[Convergence operations](revenuecat-stripe-setup.md#convergence-operations).
After deployment, observe: `ensure_revenuecat_reconcile_schedule()` returning
`INSTALLED`, a successful scheduled run in `revenuecat_billing_health()`, a
real RevenueCat v2 read (including whether `/customers/{uuid}` resolves an
aliased customer), a real CANCELLATION or refund delivery followed by its
reconciliation, and a signed-in refresh. Confirm the provisioned
`REVENUECAT_READONLY_API_KEY` is read-only in the RevenueCat dashboard; nothing
in code can. Do not manufacture a purchase or event to fill that evidence gap.
Production checkout and legal release gates remain separate and disabled.

The earlier CLI-first decision below concerns sandbox acceptance tooling. The
new server-side GET adapter serves ongoing entitlement convergence and does not
give the browser a provider key or a mutation method.

Status: Phase 2B2 is complete: the real hosted read-only sandbox assertion
passed for a fresh free Supabase test user. Phase 3A is complete: the real
provider-observed sandbox template was accepted without opening a browser,
making a purchase, or mutating provider/database state. Phase 3B1 is complete:
the first real hosted probe launched Chrome, loaded the RevenueCat sandbox
checkout, and selected the monthly package through the identified URL contract.
Phase 3B2 is complete: the first real monthly sandbox purchase ultimately
proved the RevenueCat monthly subscription and Pro entitlement, webhook,
Supabase mirror, subscription ledger, and server authorization chain. A browser
ambiguity was resolved by read-only authority reconciliation; the purchase was
never retried. Phase 3C is complete: the 2026-09-22 fresh annual sandbox run
passed a clean free baseline, selected `$rc_annual`, and converged across the
correct annual Product, active Pro, the Supabase mirror, ledger, and server
authorization. Its one browser submission was ambiguous and reconciled read-only;
no retry occurred. No UUID, credential, purchase URL, provider payload, or payment data
is recorded here. Phase 4 is complete: cancellation retained paid access,
expiration revoked Pro, one fresh annual subscription renewed naturally into
an extended active period, and replay/order behavior passed deterministic
webhook and database tests. Phase 5 is complete: normal CI is green on Node 22
and the protected manual GitHub workflow's sandbox lifecycle-read-only run #7
passed. No new purchase was needed. Production remains disabled. This document is the
implementation source of truth for the RevenueCat web-billing automation track.

Current closeout: Phase 6 engineering acceptance is complete for the reviewed
CLI-first, fail-closed sandbox contract. The final acceptance matrix below
separates verified behavior from external observation and human release gates.
Production billing remains disabled.

Audit baseline: `origin/main` at `15c3ea5a5975f647a2c116dbc5e31f41ec1645e3`
when this plan was authored. Provider and hosted-service state must be
re-checked before any live phase.

## 1. Purpose

The objective is to turn the existing manual RevenueCat sandbox acceptance
checklist into deterministic, repeatable automation.

This is specifically RevenueCat web-billing automation. Stripe and Supabase
are included only because they are stages in the existing billing chain:

```text
BPlan identity
  -> RevenueCat hosted web checkout
  -> Stripe sandbox payment
  -> RevenueCat customer/subscription/entitlement
  -> RevenueCat webhook
  -> Supabase subscription mirror
  -> BPlan server-side Pro authorization
```

The automation does not replace normal unit, integration, database, or
repository verification. Live billing checks remain opt-in and separate from
`pnpm verify`; normal verification must work without provider credentials or
internet access. Production billing activation remains a human-controlled
business and legal decision.

Batch 1 and Phase 2A deliberately did not perform a purchase, call RevenueCat,
call Stripe, call hosted Supabase, mutate provider state, or run browser
automation. Phase 2A exercises only injected/fake subprocess runners. The
separately authorized Phase 2B2 run made read-only RevenueCat and hosted
Supabase requests and performed no mutation.

Before Phase 2B live use, RevenueCat subprocesses receive only an explicit
child-only `RC_API_KEY` plus the allowlisted OS variables needed for executable
discovery and temporary-file operation. Unrelated application secrets, provider
selection state, proxy credentials, and CI tokens are deliberately excluded.
Read-only CLI calls have a fixed 30-second timeout and a 1,000,000-byte output
limit; either bound fails with a stable error and does not return raw provider
output.

## 2. Current state

### Repository audit

The current repository already has a substantial billing foundation:

| Area                       | Evidence and current state                                                                                                                                                                                                                                                                                                       | Verification boundary                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RevenueCat project/catalog | The setup runbook records project `BPlan: Business Calendar`, project ID `d455e7e9`, web config `app48a77253da`, offering `bplan_web` / `ofrng560c7ad85b`, products `bplan_pro_monthly` and `bplan_pro_yearly`, and application entitlement `pro`.                                                                               | Phase 2B2 proved exactly one live exact-name project and used its discovered canonical ID for the run. The historical runbook ID remains **UNVERIFIED FOR LIVE V2 USE** and is never used as a provider selector; the canonical ID remains runtime-discovered rather than frozen in Git. |
| Hosted purchase link       | `apps/web` accepts `VITE_REVENUECAT_WEB_PURCHASE_URL` and appends the authenticated Supabase UUID as the RevenueCat app-user path segment.                                                                                                                                                                                       | The link is external configuration and is not stored as a secret in Git. Its live availability and catalog response remain unverified by automation.                                                                                                                                     |
| RevenueCat webhook         | `supabase/functions/revenuecat-webhook/` validates the shared secret, parses webhook payloads with Zod, ignores anonymous/non-UUID users safely, handles entitlement events, and delegates ordering/idempotency to the database mirror. `supabase/config.toml` disables JWT verification for this secret-authenticated function. | Handler behavior is covered by focused Deno tests. The setup runbook records that the hosted TEST webhook returned 2xx; Batch 1 does not repeat that live check.                                                                                                                         |
| Subscription mirror        | `subscriptions` is the client-readable projection. `subscription_events` is an RLS-enabled server-only ledger. `process_revenuecat_event` atomically claims the event ID, calls the ordered mirror writer, and records the final ledger outcome.                                                                                 | Local migration/pgTAP and two-session race coverage exist. The first real monthly purchase proved the earlier hosted mirror and ledger through read-only authority reconciliation; the atomic code is deployed hosted, but a new provider delivery has not been observed.                |
| Server authorization       | `public.has_active_entitlement(user_id, 'pro')` is the server authority. The `ai-find-time` Edge Function calls it through the service-role client; client RevenueCat/UI state is not trusted.                                                                                                                                   | The first real monthly purchase proved server authorization converged with the RevenueCat and Supabase authorities.                                                                                                                                                                      |
| Web billing seam           | `apps/web/src/features/billing/api/billing.api.ts` reads the `pro` projection through TanStack Query. `BillingSection` and `SubscriptionView` expose status, guarded hosted checkout, refresh, and comparison UI.                                                                                                                | Web unit tests cover UUID and production/sandbox guards. Monthly and annual sandbox purchases passed the complete authority chain; annual was re-proven on 2026-09-22 after correcting the Product identity assertion.                                                                   |
| Production safety          | Web checkout defaults to `disabled`; production requires explicit seller-identity and final-legal-document flags plus public Terms/Privacy URLs. The runbook keeps seller identity and final legal approval unresolved.                                                                                                          | Static guards are tested. No production setting is changed by this automation track.                                                                                                                                                                                                     |

### Documented external configuration versus evidence

The current setup runbook says the RevenueCat project/catalog, hosted sandbox
purchase link, hosted webhook, and webhook TEST event are configured. Those are
external/dashboard facts recorded in `docs/revenuecat-stripe-setup.md`; they
are not silently upgraded to live verification by this document.

The following distinction is intentional:

- Implemented in the repository: webhook validation and mirror logic, server
  entitlement authorization, the guarded web billing seam, local schemas,
  migrations, and focused tests.
- Configured externally according to the setup runbook: RevenueCat Billing
  project/catalog, Stripe sandbox connection, hosted purchase link, hosted
  Supabase webhook, and webhook secret.
- Automatically verified without live services: static identifiers in the
  Batch 1 contract, configuration safety, webhook decision behavior, database
  ordering/idempotency contracts, RLS boundaries, web UUID/checkout guards,
  and normal repository checks when the environment permits them.
- Live/manual verification completed on 2026-09-18: one fresh sandbox Supabase
  UUID passed the `free` read-only assertion. Exact-name project discovery
  passed; the RevenueCat customer was absent; Pro was inactive; no supporting
  Pro subscription/purchase existed; the hosted mirror and ledger were
  coherent; and `has_active_entitlement(user_id, 'pro')` returned false.
- Live/manual verification completed on 2026-09-18: the first hosted Phase 3B1
  probe launched Chrome, loaded the RevenueCat sandbox checkout, and selected
  the identified monthly package. Payment was not attempted and no mutation
  occurred.
- Live/manual verification completed on 2026-09-18: the first real monthly
  sandbox purchase ultimately converged across RevenueCat, the webhook,
  Supabase mirror, subscription ledger, and server authorization after a
  browser-state ambiguity was reconciled read-only. The purchase was never
  retried.
- Live/manual verification completed for the annual attempt on 2026-09-19: a
  clean annual test identity passed its free baseline and exactly one annual
  sandbox submission produced active Pro evidence. At that checkpoint,
  plan-scoped assertions failed with `REVENUECAT_EXPECTED_PLAN_MISSING` and
  catalog reads returned `CLI_AUTHORIZATION`. Later read-only catalog access
  proved that purchase referenced the intended annual Product. By 2026-09-22,
  its accelerated sandbox subscription had renewed, then canceled and expired.
- **PROVEN LIVE on 2026-09-22:** a new Supabase Auth test identity passed every
  free-baseline authority layer. The annual checkout selected `$rc_annual` and
  the live `bplan_web` catalog attached RevenueCat Product `prod3c26a548d0`
  with `store_identifier` `bplan_pro_yearly`. One sandbox submit action was
  attempted. Browser submission was `UNKNOWN`, but read-only reconciliation
  and one subsequent annual plan-scoped assertion passed active RevenueCat Pro,
  annual subscription evidence, the Supabase mirror, coherent event ledger,
  and server-side `has_active_entitlement`. No retry occurred. Phase 3C is complete.

The completed sandbox evidence does not authorize another purchase or production billing.
Production remains disabled.

### Official provider/tooling audit

The current official RevenueCat CLI documentation was reviewed for this batch:

- [CLI command reference](https://www.revenuecat.com/docs/tools/cli/commands)
  documents the command tree, JSON output, non-interactive mode, project/API-key
  flags, exit codes, catalog/customer/subscription/webhook commands, and the
  mutating commands that must be excluded.
- [CLI setup and authentication](https://www.revenuecat.com/docs/tools/cli/setup)
  documents native Windows support, profiles, API-key authentication, and
  project-selection precedence.
- [CLI guidance for coding agents](https://www.revenuecat.com/docs/tools/cli/agents)
  documents `rc commands --json`, `rc commands --schemas`, `rc schema`, JSON
  errors, and the `rc api` escape hatch.
- [Developer API v2 overview](https://www.revenuecat.com/docs/api-v2) and
  [API keys and authentication](https://www.revenuecat.com/docs/projects/authentication)
  remain the authority for v2 permissions, pagination, bearer authentication,
  and secret-key handling.

The audited capability map is:

| Capability                    | Official surface                                                                                                                                                                                         | Batch 1 / future wrapper decision                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/profile                  | `rc auth status`, `rc profiles list/show/use`, `--api-key`, `--profile`                                                                                                                                  | Do not authenticate, create profiles, or depend on cached profile state. A future wrapper uses a child-only `RC_API_KEY` environment value and never prints it.                                                                           |
| Project selection             | `--project-id`, then `RC_PROJECT_ID`, `.revenuecat.json`, and profile default                                                                                                                            | Project-list discovery intentionally omits the selector; after exact-name resolution, pass the returned canonical ID explicitly on every project-scoped command. Do not inherit a profile, working-tree file, or ambient `RC_PROJECT_ID`. |
| Machine output and errors     | `--json`, `--no-input`, `--no-color`; exit codes 0, 1, 2, 4, 5, and 6                                                                                                                                    | Parse JSON and map documented exit classes. Unexpected exit codes, malformed JSON, and schema drift fail closed.                                                                                                                          |
| Project/catalog reads         | `rc projects list/show`; `rc apps list/show/keys`; `rc products list/show/prices`; `rc entitlements list/show/products`; `rc offerings list/show/verify/packages`; `rc packages list/show/products`      | These are the read-only allowlist candidates for catalog preflight. Product price mutation, catalog writes, app writes, and offering writes are excluded.                                                                                 |
| Customer/subscription reads   | `rc customers list/show/aliases/attributes`; `rc subscriptions show/transactions/entitlements`; `rc purchases show/entitlements`; `rc invoices show/for`                                                 | Phase 2 uses only the minimum customer/subscription reads needed for one explicit UUID. `customers show` includes active entitlements according to the current reference.                                                                 |
| Webhook reads                 | `rc webhooks list/show`                                                                                                                                                                                  | Read-only metadata may be asserted if the response exposes the needed setting; dashboard-only facts remain manual. Create/update/delete are excluded.                                                                                     |
| Lifecycle and other mutations | Customer grant/revoke/transfer/override/restore/simulate-purchase; subscription extend/cancel/refund; product/entitlement/offering/package writes; webhook writes; `rc api` with arbitrary methods/paths | No lifecycle or mutation command is in the read-only wrapper. No arbitrary `rc api` command is exposed.                                                                                                                                   |
| Runtime discovery and version | `rc commands --json`, `rc commands --schemas`, `rc schema <cmd>`, `rc version`; experimental commands are marked by the CLI                                                                              | The reviewed baseline is the official `v0.1.1` release. Future live setup must use exactly `v0.1.1` until a separately reviewed bump and verify the required command schemas; never use `latest` implicitly.                              |
| Pagination and rate limits    | API v2 list responses use `limit`, `starting_after`, `next_page`; the CLI documents rate-limit exit class 6                                                                                              | The future reducer must exercise continuation pages and report rate-limit failures safely. It must not assume one page or scrape human output.                                                                                            |

The project-ID conclusion is intentionally conservative: `d455e7e9` is the
repository/runbook value, not live API v2 evidence. It is stored only as
`documentedRunbookId`; it is never a provider target. Phase 2B receives the
scoped read-only API key, runs `rc projects list` without a project selector,
finds projects whose name exactly equals `BPlan: Business Calendar`, requires
exactly one match with a non-empty returned ID, and uses that returned ID with
`--project-id` for every subsequent project-scoped invocation. No `proj_...` ID
is invented, and no project ID must be copied into local configuration. Missing,
duplicate, malformed, or changed identity fails closed. Phase 2B2 verified this
runtime discovery path against the live sandbox project; it did not promote the
historical runbook ID into a provider selector.

### Provider interface decision

The provider interface is **CLI-first**. Phase 2A implements one narrow
`revenuecat-cli.ts` subprocess boundary that accepts only named read-only
operations, always supplies `--json`, `--no-input`, `--no-color`, passes the
key through a child-only `RC_API_KEY` environment value rather than argv,
validates the JSON envelope with Zod, reduces responses to safe assertion data,
and maps exit codes without printing raw payloads or secrets. Project discovery
intentionally omits `--project-id`; every project-scoped operation requires the
canonical ID returned by that discovery step.

This is the smallest maintenance surface because the current CLI already covers
the required project/catalog/customer/subscription/webhook reads, pagination
and error output are represented by the provider's existing surfaces, and a
direct REST client would duplicate authentication, pagination, error mapping,
and endpoint schemas. The CLI's public-beta status and its ability to run
mutations are real risks; the wrapper addresses them with an explicit command
allowlist, a server-only v2 read-only key, an exact version/schema check, and a
fail-closed response to unsupported commands. `rc api` is documented as a
future escape hatch only: if a required read-only endpoint is missing from the
named CLI commands, a separately reviewed allowlisted `GET` operation may be
added. It is not an arbitrary REST fallback and does not justify a second
client now.

There is no automatic install, authentication flow, profile selection, or
fallback to an unpinned CLI. The first authorized live phase must run the
approved `v0.1.1` binary, verify `rc version`, and fail if that release or the
required command schemas are not on the approved list. A newer release needs a
separate contract review.

The subprocess boundary resolves `@revenuecat/cli/bin/rc.js` from the pinned
repository dependency and invokes that launcher with the current Node
executable and `shell: false`. This avoids dependence on global/PATH `rc`
installations and Windows package-manager command shims while retaining the
package's official platform-binary dispatch.

For future CI, the wrapper must receive `REVENUECAT_API_KEY` from the protected
job environment, create only a child process with `RC_API_KEY` set, discover
the canonical project ID at the start of the run, pass that ID explicitly after
discovery, and publish only reduced report data. It must not run browser login,
`rc auth`, profile selection, auto-install, or a `latest` package resolution.

### Existing billing contracts that automation must preserve

- RevenueCat Billing is the billing engine and Stripe is the web payment
  gateway for this release.
- The application entitlement is exactly `pro`; the similarly named dashboard
  onboarding entitlement is not an application contract.
- Cancellation and billing issues retain `active` access until expiry;
  expiration is what revokes access.
- Provider-owned state is mirrored into Supabase; the mirror and
  `has_active_entitlement()` remain authorization authority.
- Anonymous RevenueCat IDs are not attributed to a Supabase user until a
  signed-in identity transfer can be processed.
- The automation track must not redesign the webhook, mirror, or provider-first
  calendar architecture.

## 3. Desired final architecture

The tooling belongs under `tools/billing/`. It is a narrow billing test
toolchain, not a general BPlan automation framework.

Conceptual modules are:

```text
tools/billing/
  contract.ts             frozen sandbox identifiers and safe constants
  config.ts               typed environment loader and secret redaction
  preflight.ts            read-only prerequisite checks and report model
  revenuecat-cli.ts       allowlisted, read-only RevenueCat CLI boundary
  supabase-assertions.ts  read-only mirror and RPC assertions
  assert-user.ts          provider/mirror/server-authority comparison
  checkout-ready.ts       deterministic identified checkout request contract
  checkout-probe*.ts      observation-only hosted-checkout browser boundary
  lifecycle/              later cancellation/expiry polling and assertions
```

The exact filenames may evolve, but the responsibility boundaries must remain.
Every command should report a category, a concise diagnostic, and a non-zero
exit code on failure. Provider responses must be parsed and reduced to safe
assertion data; raw payloads, authorization headers, and secrets must not be
printed.

### `billing:preflight`

This is read-only. It is the only billing command implemented in Batch 1, and
Batch 1 runs it in offline/configuration-contract mode.

The final live-capable version should verify, without mutation:

- required environment variable names exist for the selected command mode,
  without printing values;
- the configured target is sandbox and the RevenueCat API base is the pinned
  official base URL;
- the expected RevenueCat project, web config, entitlement, offering,
  monthly/yearly products, and packages match the frozen contract;
- webhook integration metadata, but only if an officially documented
  RevenueCat API endpoint exposes that metadata; otherwise it reports that the
  dashboard-only prerequisite is still manual;
- hosted Supabase URL/schema/runtime prerequisites needed by later assertions;
- the local database contract and server authorization RPC shape where a safe
  read-only check is available;
- no production configuration is selected accidentally.

Batch 1's `billing:preflight` does not make an HTTP request or invoke `rc`. It
checks the static contract, validates mode/target configuration, and reports
that future privileged credentials are not required in offline mode. The
future `live-readonly` + `sandbox` shape is accepted by configuration parsing
but intentionally fails the Batch 1 execution-mode check.

### `billing:assert-user`

This is read-only and requires one explicit, validated Supabase UUID. It must
never repair a disagreement automatically.

Phase 2B1 implements this contract as:

```text
BILLING_AUTOMATION_MODE=live-readonly
BILLING_AUTOMATION_ENV=sandbox
REVENUECAT_API_KEY=<v2 read-only secret key>
BILLING_SUPABASE_URL=<hosted Supabase URL>
BILLING_SUPABASE_SERVICE_ROLE_KEY=<server/tooling-only key>
pnpm billing:assert-user -- --user <uuid> [--expect active-pro|free]
```

`--user` takes precedence over the optional `BILLING_TEST_USER_ID` fallback.
The default expected state is `active-pro`; `free` is the only alternative.
Emails, display names, missing users, offline mode, production targets, invalid
URLs, and missing credentials fail before a subprocess or network adapter is
called. The service-role key is used only by the tooling Supabase client and is
never forwarded to the RevenueCat subprocess.

The current CLI also accepts an optional plan scope for active-Pro assertions:

```text
pnpm billing:assert-user -- --expect active-pro --plan monthly|annual
```

`--plan` is parsed exactly once and accepts only `monthly` or `annual`. Missing,
invalid, duplicate, or free-expectation plan arguments fail with the stable
categories `PLAN_MISSING`, `PLAN_INVALID`, `PLAN_DUPLICATE`, and
`PLAN_NOT_ALLOWED_FOR_FREE`. A plan-scoped active-Pro assertion reuses the
Product-resource resolution and requires store identifier `bplan_pro_monthly`
for monthly or `bplan_pro_yearly` for annual. The original implementation checkpoint is
`18ff339288fb7163244c1dc45a92790af6f864f2`; focused tests (29),
`pnpm billing:test` (136), billing typecheck/build, `pnpm verify`, and
`git diff --check` passed there.

The corrected assertion preserves subscription/purchase `product_id` as the
RevenueCat Product resource ID, reads each distinct Product with the approved
read-only `products show` operation, validates its ID and `store_identifier`,
and compares that store identifier with the selected plan. Missing, malformed,
unauthorized, or ambiguous Product mappings fail closed. Offline verification
does not require provider credentials.

The final command should compare:

1. Discover exactly one project whose name is `BPlan: Business Calendar` and
   pin its returned canonical ID for the run.
2. RevenueCat customer existence and customer identity.
3. RevenueCat aliases/identity mapping where available, proving the expected
   Supabase UUID is the customer identity rather than an email or display name.
4. RevenueCat subscription and product state.
5. The `pro` entitlement and its expiry state.
6. The Supabase `subscriptions` projection for the same UUID.
7. The `subscription_events` ledger and replay/order invariants.
8. `has_active_entitlement(user_id, 'pro')` through the server-side path.

The implementation pins `@revenuecat/cli` exactly at `0.1.1`, verifies that
version before provider reads, discovers the project by exact name, resolves
the canonical `pro` entitlement ID, reads the explicit customer, and follows
each returned subscription or purchase ID with its named `show` command. Zod
reducers retain only identity, entitlement, environment, access, status,
product/store, and relevant timestamp fields. Production provider records are
a `SAFETY` failure. If a v0.1.1 customer-composite relationship reports a
continuation page that its named CLI command cannot request, the assertion
stops at `REVENUECAT_PAGINATION_UNSUPPORTED`; it does not invent a field or use
arbitrary `rc api`.

The Supabase adapter selects the current `subscriptions` columns, selects
ledger metadata without `payload`, and calls
`has_active_entitlement(user_id, 'pro')`. It checks mirror identity and active
through-expiry semantics, unique event IDs, applied/skipped consistency, and
that every mirror `last_event_at` has matching applied ledger evidence. It does
not write, replay, or repair anything.

Provider state and BPlan mirror state must agree according to the documented
event semantics. Phase 2A/2B does not add a customer-events REST lookup: the
named CLI surface currently exposes customer, entitlement, subscription, and
purchase reads but no named customer-events operation. If a later acceptance
invariant requires an event stream, that is a separate reviewed read-only
operation. A mismatch is a failure with the layer identified; it is not an
invitation for the command to write a row or replay a webhook itself.

Phase 2B1 remains covered by injected RevenueCat runners and Supabase
transports. Phase 2B2 then used the real read-only adapters once for a fresh
sandbox user with expected state `free`. The reduced report passed across
RevenueCat project/customer/entitlement/subscription-purchase state, the hosted
Supabase mirror and ledger, and the server RPC. The user UUID and credentials
were not committed. This proves the free baseline only; it does not prove a
purchase, active Pro, or webhook convergence after payment.

### `billing:checkout-ready`

Phase 3A adds a non-mutating, offline checkout-readiness command:

```text
BILLING_AUTOMATION_ENV=sandbox
BILLING_TEST_USER_ID=<sandbox-supabase-uuid>
BILLING_REVENUECAT_SANDBOX_PURCHASE_URL=https://pay.rev.cat/sandbox/<TOKEN>[/]
pnpm billing:checkout-ready -- --plan monthly|annual
```

The configured sandbox base must have the canonical provider-observed shape
`https://pay.rev.cat/sandbox/<TOKEN>[/]`. One optional provider-supplied trailing
slash is normalized; multiple trailing slashes are rejected. The base may not
contain a user identity, query, credentials, fragment, non-default port, extra
path segment, or encoded path separator. The token is opaque and is not
constrained to an invented alphabet. The pure builder appends the validated
Supabase UUID exactly once and sets exactly `package_id`, using `$rc_monthly` or
`$rc_annual` directly from `BILLING_CONTRACT`, plus RevenueCat's supported
`email` prefill parameter. The email value is an internal fixed, non-deliverable
`example.com` address used only after the sandbox target has passed validation;
it is not accepted from CLI arguments or environment variables. The resulting
identified URL stays inside the typed
`SandboxCheckoutLaunchRequest`; the command prints only validation status, the
plan/package, and the expected host. It does not open a browser or make a
network request.

`BILLING_REVENUECAT_SANDBOX_PURCHASE_URL` is tooling-only configuration. It is
not treated as an API credential, but its full value and link token are
redacted from normal reports and errors so the sandbox link is not distributed.
It is required only by the explicitly invoked readiness command, so
`pnpm verify` remains credential-free.

Phase 3A is **COMPLETE**. A real local readiness run accepted the provider-
observed sandbox template and returned `READY` for the monthly package. No
browser was opened, no purchase occurred, and no provider or database mutation
occurred.

Phase 3B1 uses a separate, explicitly named `sandbox-checkout-probe` mode and
an observation-only Playwright boundary. `live-readonly` cannot authorize
browser navigation, and no production checkout execution path is permitted.
The eventual state transition is:

```text
free baseline
  -> identified RevenueCat sandbox checkout
  -> Stripe sandbox payment
  -> RevenueCat active Pro
  -> webhook ledger/mirror convergence
  -> billing:assert-user -- --expect active-pro
```

### `billing:checkout-probe`

Phase 3B1 is an explicitly invoked, non-mutating hosted-checkout probe:

```text
BILLING_AUTOMATION_MODE=sandbox-checkout-probe
BILLING_AUTOMATION_ENV=sandbox
BILLING_TEST_USER_ID=<sandbox-supabase-uuid>
BILLING_REVENUECAT_SANDBOX_PURCHASE_URL=https://pay.rev.cat/sandbox/<TOKEN>[/]
pnpm billing:checkout-probe -- --plan monthly
```

The command reuses the Phase 3A URL builder, requires the sandbox target and
valid UUID before browser construction, launches an isolated non-persistent
context, blocks unexpected top-level origins, and reports only reduced
checkout-load facts. It never types payment data, submits a purchase, calls a
provider mutation, writes billing rows, or persists browser artifacts. Offline
tests use an injected fake browser; normal verification does not launch a
browser or require browser binaries.

The first real browser probe passed on 2026-09-18. Chrome launched, the hosted
RevenueCat sandbox checkout loaded, and the monthly package was selected by the
identified URL contract. Payment was not attempted. No provider or database
mutation occurred. The test identity, purchase token, full URL, and local
browser path are intentionally not recorded. The annual package remains
supported by the shared contract, but no real annual probe is part of this
checkpoint.

### `billing:e2e:sandbox`

Phase 3B2 is **COMPLETE** for the reviewed monthly sandbox path. The command
requires the exact `sandbox-purchase` mode, an explicit sandbox target and UUID,
the reviewed purchase-link shape, a valid browser executable, and the read-only
RevenueCat and Supabase assertion credentials:

```text
BILLING_AUTOMATION_MODE=sandbox-purchase
BILLING_AUTOMATION_ENV=sandbox
BILLING_TEST_USER_ID=<sandbox-supabase-uuid>
BILLING_REVENUECAT_SANDBOX_PURCHASE_URL=https://pay.rev.cat/sandbox/<TOKEN>[/]
BILLING_PLAYWRIGHT_EXECUTABLE_PATH=<absolute-local-browser-executable>
REVENUECAT_API_KEY=<read-only-provider-key>
BILLING_SUPABASE_URL=<hosted-supabase-url>
BILLING_SUPABASE_SERVICE_ROLE_KEY=<server-side-key>
pnpm billing:e2e:sandbox -- --plan monthly
```

Both `monthly` and `annual` use the same sandbox-only one-shot runner,
free-baseline guard, browser ambiguity reconciliation, authority polling,
redaction, and production prohibition. The browser adapter owns semantic
field/role selection and Stripe frame-origin validation; the orchestration layer
receives no generic selector, fill, script-evaluation, or navigation primitive.

The approved Stripe sandbox fixture is isolated in sandbox-only tooling and is
not configurable from the environment or CLI. Before constructing a browser,
the runner requires the existing read-only assertion to prove a free baseline.
It does not repair or delete state. Submission is structurally one-shot and
tracks browser observation separately from authoritative outcome. Client-side or
hosted validation leaves `Purchase submitted` as `NO`; processing, direct
success, or explicit provider rejection records the observed browser boundary.
An evidence-free result is never retried automatically.

After the submit action is attempted, the state machine is:

- validation-blocked before provider acceptance: no authority poll,
  `Purchase submitted: NO`, and `SAFE AFTER FIX`;
- explicit provider rejection: report rejection, do not resubmit;
- browser processing or success: enter bounded read-only authority convergence;
- browser `UNKNOWN`: immediately enter the same bounded authority reconciliation,
  without another browser submit.

The authority reconciliation polls the existing RevenueCat, Supabase mirror and
server-authorization assertion boundary. If `active-pro` passes, the E2E result
is `PASS`, `Authority reconciliation: PASS`, and `Purchase confirmed: YES`,
even when the browser submission or hosted-success observation remains unknown.
If the authorities remain coherently free for the complete bounded observation
window, the runner reports `PURCHASE_NOT_COMPLETED`, `Purchase confirmed: NO`,
and does not retry automatically. If the authorities remain inconsistent or
ambiguous, it reports `PURCHASE_STATE_UNKNOWN` and does not retry automatically.
No branch submits twice.

Validation reports only a safe category such as `EMAIL_REQUIRED` or
`REQUIRED_CHECKBOX_UNSATISFIED`; it never prints field values, DOM, HTML, the
synthetic email, or the full checkout URL.

The most recent real monthly sandbox attempt passed the free baseline, browser,
hosted checkout, and sandbox payment stages. The submit action was attempted,
but the browser reported provider submission and purchase state as `UNKNOWN`
with `DO NOT RETRY`. A subsequent read-only `active-pro` reconciliation passed
RevenueCat entitlement and subscription evidence, the Supabase mirror and
ledger, and server authorization. The monthly sandbox purchase therefore
completed successfully despite the browser detector's unknown result. No retry
occurred. This proves the Phase 3B2 provider-to-server acceptance chain live;
the remaining implementation concern was the ambiguity handling now represented
by the state machine above. No UUID, token, URL, secret, payment detail, or raw
provider/browser value is recorded here.

The acceptance chain is:

```text
explicit BPlan test UUID
  -> identified RevenueCat hosted sandbox checkout
  -> Stripe sandbox test payment
  -> RevenueCat subscription and `pro` entitlement
  -> RevenueCat webhook delivery
  -> Supabase subscription mirror
  -> `has_active_entitlement(user_id, 'pro')`
```

The test must not simulate success by directly inserting subscription rows,
granting `pro`, bypassing the hosted checkout, or enabling a client-side
entitlement flag.

Browser success alone is insufficient. The runner polls the existing
RevenueCat/Supabase/server assertion boundary until the sandbox monthly state,
`pro` entitlement, mirror and coherent ledger, and
`has_active_entitlement()` all agree, or the bounded authority reconciliation
classifies the identity as coherently free or still inconsistent. Reports
distinguish browser submission from authority reconciliation and omit the UUID,
URL/token, secrets, payment details, raw provider payloads, and browser content.
Normal `pnpm verify` uses fake adapters only and does not launch a browser or
make network requests.

### `billing:lifecycle:sandbox`

This is a future live phase for state transitions. It should cover:

- cancellation and active-until-expiry;
- natural expiration;
- renewal;
- monthly and annual plans;
- duplicate/replayed webhook delivery;
- practical out-of-order delivery checks;
- refund/revocation only when semantically distinct and intentionally scoped.

Natural expiration must be reported separately from refund/revocation. A test
that cancels a subscription must not incorrectly claim that access has already
expired.

## 4. Automation versus human-controlled actions

| Action                                           | Automation intent                                                 | Boundary                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| RevenueCat project/catalog verification          | Automate read-only checks                                         | Use a scoped v2 secret key; never update catalog state.                                                     |
| Customer/subscription/entitlement/event lookup   | Automate read-only checks                                         | Require an explicit UUID and sandbox filter; redact provider identifiers that are not needed in the report. |
| Webhook-state assertion                          | Automate where provider metadata is exposed                       | A dashboard-only integration setting remains a documented/manual prerequisite.                              |
| Supabase mirror/RPC assertion                    | Automate read-only checks                                         | Use a server-side credential; never repair rows.                                                            |
| Duplicate/replayed event assertion               | Automate in local fixtures and later in a controlled sandbox      | Do not manually insert a fake successful purchase for E2E.                                                  |
| Sandbox cancellation and lifecycle polling       | Automate only in a separately named mutating command after review | Must be opt-in, sandbox-only, explicit, and isolated from read-only commands.                               |
| Monthly/annual validation                        | Automate through the hosted sandbox flow                          | Each plan must be identified in the checkout and provider assertions.                                       |
| Browser checkout                                 | Automate later with a reviewed browser framework                  | Use the real hosted sandbox URL and deterministic test identity.                                            |
| Reports/CI artifacts                             | Automate                                                          | Publish summaries without secrets, tokens, full webhook payloads, or payment data.                          |
| Production billing activation                    | Human only                                                        | Requires seller identity, final legal documents, and explicit production approval.                          |
| Seller/legal identity and Terms/Privacy approval | Human only                                                        | Engineering must retain TBD gates and must not invent a seller.                                             |
| Entering/rotating privileged credentials         | Human-controlled secret-store action                              | Code may validate presence, never display or commit values.                                                 |
| Production Stripe/RevenueCat configuration       | Human only                                                        | No live-mode mutation belongs in this automation track.                                                     |

## 5. Trust boundaries and safety

These rules apply to every future phase:

- Sandbox is the default and the only target accepted by Batch 1. The
  `live-readonly` mode is recognized for future configuration, but Batch 1
  still refuses every provider and hosted-service call.
- `production` is a target value that fails closed; it is not a permitted
  execution mode and is never inferred from a missing value.
- Production mutation is forbidden unless a separately authorized task names the
  exact action and target; no command silently falls back to production.
- Read-only commands and mutating commands have different names and different
  permission expectations.
- Never print, commit, or persist RevenueCat secret keys, Stripe secret keys,
  Supabase service-role keys, webhook secrets, or full Authorization headers.
- Browser-safe `VITE_*` and `EXPO_PUBLIC_*` values are never used as a source
  of privileged tooling credentials.
- The RevenueCat API base is pinned to the official v2 base. Commands do not
  accept an arbitrary production URL that could redirect a secret to an
  unintended host.
- The runbook project ID `d455e7e9` is stored as historical evidence and marked
  **UNVERIFIED FOR LIVE V2 USE**; no `proj_...` ID is invented. The live
  read-only command discovers exactly one matching BPlan project from
  `rc projects list` and uses only that returned ID for the run.
- The RevenueCat CLI wrapper passes an explicit project on every
  invocation and supplies the key only in the child process's `RC_API_KEY`
  environment, uses JSON plus no-input mode, and exposes only read-only
  command names. It never places the key in argv, invokes login, mutates a
  profile, uses `--yes`, or calls arbitrary `rc api` paths.
- User IDs passed to assertions are strict UUIDs. Emails, display names, and
  generated aliases are not accepted as substitutes.
- Read-only commands perform no writes, no checkout, no cancellation, no
  refund, no entitlement grant, no webhook replay, and no database repair.
- Mutating sandbox commands must require explicit invocation and must fail closed
  if the target is not sandbox.
- No command auto-repairs provider/dashboard state or treats a mismatch as
  success.
- The persisted Supabase mirror and `has_active_entitlement()` remain the
  server authorization authority. Client RevenueCat state is UI-only.
- Normal `pnpm verify` must not require internet access, provider credentials,
  a hosted Supabase project, or a real purchase.
- Full checkout/payment data is not logged. Any later browser report must use
  step names and safe identifiers, not card data or session cookies.

## 6. Credentials and configuration design

### RevenueCat API and CLI capabilities

The current official RevenueCat Developer API v2 documentation says that the
API uses `https://api.revenuecat.com/v2`, requires a `Bearer` authorization
header, and uses new v2 secret keys with explicit permissions. API v1 keys are
not a substitute for v2 keys.

The CLI decision is based on the current official references:

- [RevenueCat CLI](https://www.revenuecat.com/docs/tools/cli)
- [CLI command reference](https://www.revenuecat.com/docs/tools/cli/commands)
- [CLI setup and authentication](https://www.revenuecat.com/docs/tools/cli/setup)
- [CLI guidance for coding agents](https://www.revenuecat.com/docs/tools/cli/agents)
- [Official CLI v0.1.1 release](https://github.com/RevenueCat/cli/releases/tag/v0.1.1)
- [CLI public-beta announcement](https://www.revenuecat.com/changelog/release/set-up-and-manage-revenuecat-from-the-command-line-2026-08-25)

Read the current official API references before implementing any live assertion:

- [Developer API v2 overview](https://www.revenuecat.com/docs/api-v2)
- [API keys and authentication](https://www.revenuecat.com/docs/projects/authentication)
- [Projects](https://www.revenuecat.com/docs/api-v2/project)
- [Offerings](https://www.revenuecat.com/docs/api-v2/offering)
- [Entitlements](https://www.revenuecat.com/docs/api-v2/entitlement)
- [Customers and customer resources](https://www.revenuecat.com/docs/api-v2/customer)
- [Subscriptions](https://www.revenuecat.com/docs/api-v2/subscription)

The initial read-only key should request only the smallest permissions needed:

- project configuration reads for projects, apps, offerings, packages,
  products, and entitlements;
- customer-information reads for customers, subscriptions, and purchases;
- active-entitlement reads exposed by the named customer/subscription/purchase
  commands;
- invoice reads only if a later acceptance report genuinely needs invoices.

Do not request `read_write` permissions for preflight or `assert-user`.
Cancellation, extension, refund, grant, revoke, transfer, delete, and other
mutations require a separately reviewed command and should not share a
read-only key by default. The API documentation is the authority for the exact
permission name of each endpoint at implementation time.

### Environment variable categories

Names below are design names, not values:

| Category                      | Variables                                                                                                       | Storage/rules                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local tooling                 | `BILLING_AUTOMATION_MODE`, `BILLING_AUTOMATION_ENV`, and future read-only tool credentials                      | Untracked local env or a developer secret manager. Batch 1 defaults to `offline`/`sandbox` and needs no secret.                                                                             |
| RevenueCat tooling secret     | `REVENUECAT_API_KEY`                                                                                            | Local secret store or GitHub Actions secret; v2 secret key only; future CLI wrapper maps it to a child-only `RC_API_KEY` environment value; never argv, client, or Supabase browser config. |
| Supabase tooling              | `BILLING_SUPABASE_URL`, `BILLING_SUPABASE_SERVICE_ROLE_KEY`                                                     | Local secret store or protected GitHub Actions environment; server/tooling only.                                                                                                            |
| Test identity                 | `BILLING_TEST_USER_ID`                                                                                          | UUID, not a secret, but explicit and scoped to a sandbox test account.                                                                                                                      |
| Existing webhook secret       | `REVENUECAT_WEBHOOK_SECRET`                                                                                     | Supabase Edge Function secret store; not a RevenueCat API key and not used by browser code.                                                                                                 |
| Optional direct Stripe checks | A future `STRIPE_SECRET_KEY` only if a later phase proves it is needed                                          | Protected sandbox secret; not needed for the current RevenueCat read-only foundation.                                                                                                       |
| Browser-safe values           | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REVENUECAT_WEB_PURCHASE_URL`, and existing public SDK keys | May ship in the client only when their provider semantics are public; never place a secret or service-role key here.                                                                        |

The preflight loader must distinguish these categories, validate names and
formats, and report missing names without reporting values. `.env.example`
contains placeholders/comments only; real values remain outside Git.

The repository-owned secret variable is deliberately named separately from the
CLI's ambient `RC_API_KEY` and `RC_PROJECT_ID` variables. The future wrapper
passes the key explicitly to the child environment and discovers the project
from the provider, so a developer's cached profile, `.revenuecat.json`, or shell
environment cannot redirect a secret or assertion to another project.

### Local approved-command wrapper

The coding agent can execute approved local billing commands through the
external wrapper `Z:\Dev\Tools\BCalAI\Invoke-Billing.ps1`, which loads the
external secret file `Z:\Dev\Secrets\BCalAI\billing.env`. Neither path is in
the repository and neither file may be committed. The wrapper receives the
automation mode explicitly and requires explicit `-Command` and
`-ArgumentList` parameters. For direct `pnpm` invocation, do not add the usual
redundant `--` separator to `ArgumentList`; the wrapper invokes `pnpm` directly.
Read-only diagnosis is allowed through this path. Mutating sandbox commands,
including purchases, still require separate explicit human authorization.

### Hosted webhook metadata limitation

The provider API may not expose every dashboard integration setting, including
the exact webhook destination/secret configuration. The implementation must
not invent an endpoint. If the current API exposes safe webhook metadata, the
preflight may assert it; otherwise the report must say that this prerequisite
remains dashboard/manual and rely on the real webhook delivery assertion later.

## 7. Test architecture

The test layers should stay separate so a local green run cannot be mistaken
for live billing evidence.

### Offline unit and contract tests

Use deterministic fixtures and injected transport boundaries for:

- frozen project/catalog/entitlement/package values;
- environment parsing and required-variable messages;
- strict UUID validation;
- secret redaction and absence of full secret values in output;
- sandbox/production guards;
- default `offline`/`sandbox` behavior;
- recognized future `live-readonly`/`sandbox` configuration that still refuses
  execution and makes zero network calls;
- invalid mode/target values and no manual project-ID requirement;
- structured pass/fail reports and non-zero command exit behavior;
- injected RevenueCat CLI runner arguments, environment isolation, version
  policy, exit/error mapping, project discovery, and response parsers;
- Supabase assertion reducers and mismatch classification;
- proof that the Batch 1 preflight path makes no network calls.

### Read-only live verification

Later commands may invoke only the reviewed CLI allowlist, discover exactly one
matching project at the start of the run, use that returned ID explicitly for
project-scoped calls, and record a safe report. Failures must identify the layer
rather than dumping provider responses. A direct REST client is not part of
Phase 2 unless a separate audit proves a named CLI operation insufficient and
approves a specific read-only fallback.

### Browser E2E

Later browser tests use the actual hosted sandbox link, a stable test UUID,
isolated browser context, and explicit polling for webhook/mirror convergence.
They must never grant entitlement or insert a mirror row directly.

### Lifecycle sandbox tests

Later lifecycle tests use separately named mutating commands, bounded polling,
and an explicit cleanup/reset strategy. Natural expiration and refund/revocation
are different result categories.

### Failure categories

Reports should use stable categories such as:

```text
CONFIGURATION
REVENUECAT_PROJECT
REVENUECAT_CATALOG
REVENUECAT_CUSTOMER
REVENUECAT_ENTITLEMENT
REVENUECAT_SUBSCRIPTION
WEBHOOK
SUPABASE_MIRROR
SERVER_AUTHORIZATION
CHECKOUT
LIFECYCLE
SAFETY
```

The names may be represented as a typed union or a richer result model, but a
failure must identify the failing layer and whether it was local, provider,
webhook, database, or server authorization evidence.

## 8. Idempotency and cleanup strategy

The test identity strategy must avoid an uncontrolled collection of sandbox
customers and active subscriptions.

- Start with one explicitly provisioned Supabase test user UUID per test
  environment. The UUID is passed explicitly; the tool does not silently
  create a user or choose a customer by email.
- Repeated read-only preflight and assert-user runs are safe and do not create
  provider state.
- A repeated checkout run must first detect an existing active subscription and
  report a controlled `PREVIOUS_RUN_ACTIVE` result. It must not buy another
  plan just because the prior run was incomplete.
- If isolated runs are required, provision a bounded pool of test users outside
  the command and record which identity was selected.
- Cleanup/reset is a separate destructive or provider-mutating command. It is
  never hidden inside verification and must be sandbox-only.
- A failed run leaves state for diagnosis and reports the exact cleanup action
  still required; it does not guess whether cancellation, refund, or expiry is
  safe.
- Before a lifecycle run, assert the starting state. After a run, assert the
  terminal state and retain only safe event IDs/timestamps in the report.

## 9. GitHub Actions strategy

This is a future phase. Do not add the workflow in Batch 1.

The eventual workflow should be manually dispatched rather than run on every
push. It should:

- require explicit invocation and a named sandbox environment;
- use repository/environment secrets with least-privilege read-only credentials
  for preflight/assertion steps;
- keep any mutating lifecycle step separately named and approval-protected;
- avoid echoing secrets, headers, checkout URLs containing identities, or card
  data;
- publish a concise pass/fail report and safe artifact summary;
- use a protected environment when repository/account capabilities allow it;
- never activate production billing or accept a production target.

## 10. Implementation phases

### Phase 0 — audit + contract freeze

- Goal: reconcile the provider runbook, repository implementation, current
  remote refs, and current provider API documentation.
- Scope: freeze identifiers, modes, credential names, assertion categories, and
  the separation between documented configuration and live evidence; audit the
  official CLI versus direct REST surface and choose the CLI-first boundary.
- Excluded: provider calls, purchases, dashboard edits, and production changes.
- Tests: repository/static inspection and contract review.
- Live/manual requirement: none; provider docs may be read, but no billing API
  request is made.
- Exit criteria: source-of-truth plan exists, identifiers are verified against
  the repository/runbook, and unresolved external facts are labelled.

### Phase 1 — read-only preflight foundation

- Goal: establish a safe command/report/configuration shape without contacting
  RevenueCat, Stripe, or hosted Supabase.
- Scope: central contract constants, explicit `offline`/`live-readonly` mode and
  sandbox/production target types, redacted environment loader, offline
  `billing:preflight`, structured result model, and deterministic tests.
- Excluded: API clients, browser automation, purchases, lifecycle mutation,
  GitHub Actions, and hosted-service requests.
- Tests: contract values, missing variables, malformed UUID/config, redaction,
  sandbox/prod guards, success/failure results, non-zero exit, and no network.
- Live/manual requirement: none.
- Exit criteria: focused tests/typecheck/lint/format pass; `pnpm verify` remains
  independent of live credentials; no production or provider state changes.

### Phase 2A — offline-tested RevenueCat CLI boundary

- Goal: establish the only repository-owned path that may eventually invoke
  RevenueCat CLI reads, without invoking it in this phase.
- Scope: exact approved CLI version policy, closed read-only operation union,
  shell-free argv construction, isolated child environment, bounded process
  result/error model, Zod JSON validation, exact-name project discovery reducer,
  identity-stability guard, and injected-runner tests.
- Excluded: RevenueCat CLI installation/authentication/execution, provider or
  hosted-Supabase requests, direct REST, customer-events lookup, checkout,
  lifecycle mutation, GitHub Actions, and production.
- Tests: fake subprocess results cover version drift, executable absence,
  project discovery, generated flags, environment isolation, forbidden
  operations, malformed JSON, exit-code mapping, secret absence, and zero
  network calls.
- Live/manual requirement: none. Every Phase 2A test supplies an injected
  runner; no real `rc` process is started.
- Exit criteria: the boundary is typechecked, linted, tested offline, and
  cannot receive arbitrary commands or a historical runbook project ID.

### Phase 2B1 — offline implementation of the read-only assertion command

- Goal: make the complete assertion code path deterministic and ready for a
  separately authorized live sandbox read.
- Scope: pin official CLI `0.1.1`; implement strict UUID/expected-state input,
  version and exact-project discovery, reduced customer/entitlement/
  subscription/purchase schemas, sandbox guards, a tooling-only Supabase read
  adapter, mirror/ledger/RPC reducers, safe reporting, and cross-layer tests.
- Excluded: authenticated RevenueCat calls, hosted Supabase queries, checkout,
  lifecycle mutation, browser automation, production, and auto-repair.
- Tests: all adapters are injected/fake; normal `pnpm verify` remains offline
  and credential-free.
- Live/manual requirement: none. Local metadata commands (`rc version`, `rc
commands`, and `rc schema`) were inspected without an API key; no
  provider-backed command ran.
- Exit criteria: command builds and its offline agreement, disagreement,
  malformed-response, secret-redaction, and safety cases pass.

### Phase 2B2 — authorized read-only provider/Supabase assertion run

- Status: **PASS on 2026-09-18** for one fresh sandbox user expected to be
  `free`; no UUID or credential is retained in the repository.
- Goal: add read-only live assertions for one explicit sandbox UUID.
- Scope: use the approved `v0.1.1` binary through the Phase 2A boundary; run
  `projects list` without a selector; require exactly one exact-name BPlan
  match; then pin its returned canonical ID on every project-scoped command,
  parse JSON responses, handle pagination, assert
  customer/subscription/entitlement/purchase state, and run Supabase
  mirror/RPC assertions. No direct REST client is added unless a new reviewed
  decision names a specific missing read-only operation.
- Excluded: checkout, cancellation, refund, grant/revoke, repair, customer
  events lookup, and production.
- Tests: run the already offline-tested command once with separately supplied
  read-only sandbox credentials and record the reduced result.
- Live/manual requirement: a human supplies a v2 read-only key, hosted
  Supabase credentials, and a known sandbox test UUID; the canonical project ID
  is discovered from the provider, not copied into configuration. No mutation
  is performed.
- Exit criteria: the approved CLI version and required schemas are present,
  project discovery returns exactly one BPlan identity, and provider state,
  webhook ledger/mirror, and server RPC agree or the command fails with a
  precise layer/category.

### Phase 3A — deterministic sandbox checkout foundation

- Goal: construct the exact identified, package-scoped RevenueCat sandbox URL
  for one explicit UUID and `monthly` or `annual` plan without launching it.
- Scope: tooling-only sandbox-link configuration, strict HTTPS/host/base-link
  validation, UUID path scoping, frozen-contract package selection, a reduced
  readiness report, and a typed handoff seam for later browser automation.
- Excluded: browser launch, Stripe interaction, provider or database calls,
  purchase, mutation, production, and speculative DOM selectors.
- Tests: pure offline URL/config/report coverage; normal verification needs no
  checkout value.
- Live status: **COMPLETE on 2026-09-18**. A real local readiness run accepted
  the provider-observed sandbox template and returned `READY` for the monthly
  package. No browser was opened, no purchase occurred, and no provider or
  database mutation occurred.
- Exit criteria: `billing:checkout-ready` produces `READY` from valid local
  inputs without exposing the UUID, full URL, or token.

### Phase 3B1 — browser probe foundation

- Goal: open the exact identified, package-scoped sandbox checkout, verify that
  the approved hosted checkout origin loaded, and stop before payment.
- Scope: exact `sandbox-checkout-probe` execution mode, Playwright-core
  adapter, isolated non-persistent browser context, top-level origin guard,
  bounded cleanup, reduced redacted reporting, and injected fake-browser tests.
- Excluded: payment data, purchase submission, provider/database mutation,
  lifecycle actions, browser artifacts, production, and live execution in this
  implementation task.
- Status: **COMPLETE on 2026-09-18**. The first real hosted probe passed without
  entering payment data or causing provider/database mutation. Normal
  verification remains browser-free.
- Exit criteria: the offline probe suite proves configuration rejection before
  browser construction, stable failure categories, origin rejection, cleanup
  on success/failure, and the absence of payment operations.

### Phase 3B2 — first monthly sandbox purchase

- Goal: execute the first real monthly hosted sandbox checkout and wait for the
  complete provider-to-server chain.
- Scope: separately authorized payment step on the reviewed Playwright/browser
  runner, Stripe sandbox fixture handling, bounded webhook/mirror polling, and
  safe reports.
- Excluded: production checkout, direct database grants, fake mirror writes,
  mobile purchase/restore, and legal approval.
- Tests: browser fixtures/mocks for runner behavior plus one explicitly
  authorized live monthly run.
- Implementation status: **COMPLETE**. The first real monthly attempt reached
  the submit action and reported provider submission and purchase state as
  `UNKNOWN`, with `DO NOT RETRY`. Subsequent read-only authority reconciliation
  passed the expected monthly RevenueCat entitlement/subscription, Supabase
  mirror and ledger, and server authorization. The browser detector missed
  provider success, but the purchase completed; no retry occurred.
- Live/manual requirement: satisfied by the separately authorized monthly
  sandbox run. No identifiers, secrets, URLs, or payment data are recorded.
- Exit criteria: the monthly plan completes the hosted chain and BPlan server
  authorization agrees with the mirror.

### Phase 3C — annual sandbox purchase and convergence hardening

- Goal: support the annual package and harden bounded convergence behavior using
  the same reviewed purchase seam.
- Scope: annual package execution through `$rc_annual`, selected-plan authority
  assertions requiring `bplan_pro_yearly`, shared bounded reconciliation,
  redacted reporting, and offline regression coverage.
- Excluded: production, lifecycle mutation, and direct mirror repair.
- Status: **COMPLETE — PROVEN LIVE on 2026-09-22.** Read-only catalog inspection
  established `$rc_annual` → RevenueCat Product `prod3c26a548d0` →
  `bplan_pro_yearly`; `$rc_monthly` resolves to `bplan_pro_monthly`. RevenueCat
  subscription `product_id` is the internal Product resource ID, so the prior
  direct comparison with the store identifier was wrong. The original annual
  purchase was historically the correct product, then expired after accelerated
  sandbox renewals, cancellation, and expiration.
- A fresh Auth test identity passed every free-baseline layer. Exactly one new
  annual sandbox submit action was attempted through the shared one-shot flow.
  Browser submission was `UNKNOWN`; read-only authority reconciliation returned
  `PASS` without retry. The subsequent `active-pro --plan annual` assertion
  passed RevenueCat active Pro and annual subscription evidence, the active
  Supabase mirror, coherent subscription ledger, and server authorization.
- No second submit action or provider/database repair occurred. Production
  billing remains disabled. Phase 4 lifecycle verification followed under
  separate authorization.

### Phase 4 — cancellation/expiration/lifecycle automation

- Goal: verify state transitions and replay behavior in sandbox.
- Scope: explicit cancellation command if officially supported, bounded polling,
  renewal/expiration assertions, duplicate/out-of-order webhook checks, and
  separate refund/revocation semantics.
- Excluded: production mutation and silent cleanup.
- Tests: deterministic lifecycle state machine fixtures plus authorized sandbox
  runs.
- Live/manual requirement: human approval for every mutating sandbox command;
  natural expiry may require a scheduled/manual wait.
- Exit criteria: cancellation retains access through expiry, expiration revokes
  access, renewal restores/extends correctly, and replay/order behavior remains
  correct.

#### Phase 4 implementation checkpoint — 2026-09-22

**IMPLEMENTED / VERIFIED LOCALLY:** `billing:lifecycle:read-only` uses the
existing secrets wrapper in `live-readonly` mode, requires an explicit sandbox
test UUID, and follows the approved RevenueCat CLI and Supabase read adapters.
It reconciles the annual Product store identifier, period and renewal state,
RevenueCat Pro, the subscription mirror, ordered ledger, and server
authorization. Its report contains no user, subscription, event, URL, or secret
identifiers. It fails closed on missing period or renewal fields, conflicting
authorities, and incoherent ledger state. Deterministic offline fixtures cover
active, cancelled but active, renewed, expired, duplicate/stale delivery, and
malformed state. The webhook sequence test and existing database tests exercise
the underlying transition and ordering behavior. Normal `pnpm verify` remains
offline.

The read-only `billing:lifecycle:renewal` command captures an initial active,
renewing annual snapshot, then observes through the first accelerated sandbox
boundary with a bounded convergence window. It compares the exact project,
customer, subscription, and Product resource across snapshots; requires an
advanced paid period, active RevenueCat Pro, an extended active Supabase mirror,
an applied `INITIAL_PURCHASE > RENEWAL` ledger, and server authorization. It
uses the existing restricted wrapper in `live-readonly` mode and cannot submit
a provider or database mutation. Offline fixtures reject identity, period,
ledger, and authority drift.

**READ-ONLY LIVE OBSERVATION at 2026-09-22 05:35 UTC:** the fresh annual test
subscription was `active`, `gives_access=true`, `will_renew`, with paid period
2026-09-22 05:17:52–06:17:52 UTC. RevenueCat Pro, the active Supabase mirror,
the initial-purchase ledger entry, and server authorization agreed. No renewal
or cancellation event had yet appeared. Sandbox annual periods are accelerated,
so this observation is time-bound.

**LIVE CANCELLATION CHECKPOINT — 2026-09-22:** the separately authorized
`billing:lifecycle:cancel` command guarded the same annual sandbox identity,
discovered the exact BPlan project, re-read its single active annual
subscription, and submitted one `subscriptions cancel <id> --yes` operation.
Two earlier, separately authorized submissions returned `CLI_AUTHORIZATION` and
left the subscription renewing; this submission succeeded after the key's
subscription write permission was updated. Immediate read-only reconciliation
showed `will_not_renew` and `cancelled-active`: RevenueCat Pro, the Supabase
mirror, and server authorization remained active, while the ledger recorded
`INITIAL_PURCHASE > CANCELLATION`. The paid-period end remained
2026-09-22 06:17:52 UTC. A read-only check shortly before that boundary still
showed active access across all authorities.

**LIVE EXPIRATION CHECKPOINT — 2026-09-22:** after the paid-period boundary,
RevenueCat reported the annual subscription `expired`, with no access and no
active Pro entitlement. The Supabase mirror was inactive/expired, the ledger
recorded `INITIAL_PURCHASE > CANCELLATION > EXPIRATION`, and server-side
authorization returned false. The read-only lifecycle assertion was corrected
to allow an expired subscription to lose its Pro attachment while preserving
the annual Product identity check; it then passed without provider or database
repair. No renewal, skipped/stale, or duplicate ledger event was observed for
this identity. **Cancellation through expiration is proven live.** A live
renewal and naturally observed duplicate/out-of-order delivery remain Phase 4
gaps; deterministic offline coverage remains in place. No purchase, refund,
extension, direct billing-row write, or production action was performed in
this lifecycle check.

**LIVE NATURAL RENEWAL CHECKPOINT — 2026-09-22:** one newly provisioned Auth
identity passed the complete free baseline. The exact BPlan sandbox catalog
still mapped `bplan_web > $rc_annual > prod3c26a548d0 > bplan_pro_yearly`.
One annual sandbox submit action was attempted. Browser submission was
`UNKNOWN`, but read-only authority reconciliation and a separate annual
plan-scoped assertion passed; no retry occurred. The initial subscription was
active and `will_renew` for 06:32:50–07:32:50 UTC, with RevenueCat Pro, the
active Supabase mirror, `INITIAL_PURCHASE`, and server authorization true.
After the natural boundary, read-only checks found the same customer with one
annual subscription active and `will_renew` for 07:32:50–08:32:50 UTC. Its
Product remained `bplan_pro_yearly`; RevenueCat Pro, the extended active mirror,
and server authorization remained active. The ledger had applied
`INITIAL_PURCHASE > RENEWAL` for the same app user and Product. The first
observer stopped near the boundary with `RENEWAL_PROVIDER_STATE`; immediate read-only
reconciliation converged, and the observer's bounded boundary-grace handling
was hardened and tested offline. No natural skipped, duplicate, or stale ledger
delivery was observed for this identity.

**PHASE 4 COMPLETE — PROVEN LIVE / DETERMINISTICALLY VERIFIED:** cancellation
retained paid access through expiry, expiration revoked Pro, and natural
renewal extended the paid period with active provider, mirror, ledger, and
server authority. The webhook sequence tests and Postgres ordering/RLS tests
verify sequential replay deduplication and stale/out-of-order protection;
provider-side duplicate delivery was not manufactured or claimed live.
Production billing remains disabled. Phase 5 subsequently passed its protected
live GitHub read-only dispatch, as recorded below.

### Phase 5 — manually triggered GitHub Actions integration

- Goal: make the live sandbox suite repeatable from a protected manual workflow.
- Scope: workflow dispatch, environment secrets, bounded timeouts, safe reports,
  artifacts, and approval gates.
- Excluded: run-on-push billing tests, production activation, and unreviewed
  secret exposure.
- Tests: workflow syntax/static checks, offline dry-run, then an authorized
  sandbox dispatch.
- Live/manual requirement: repository/environment administrators control the
  dispatch and secrets.
- Exit criteria: a manual run can be audited from its report without exposing
  credentials and cannot target production.

#### Historical Phase 5 implementation checkpoint — 2026-09-22

**IMPLEMENTED / VERIFIED LOCALLY; NO LIVE WORKFLOW DISPATCH:** the
[manual workflow](../.github/workflows/revenuecat-sandbox-billing.yml) uses
workflow_dispatch only, requires the protected billing-sandbox GitHub
Environment, and defaults to an offline preflight. Read-only operation choices
cover monthly and annual assertions, annual lifecycle state, and annual natural
renewal observation. The only mutation choice is a sandbox purchase; it
requires both selecting that operation and setting confirm_sandbox_purchase to
true. Cancellation, refund, and extension are not workflow operations.

At this historical checkpoint, the workflow pinned Node.js 20.19.6 and pnpm
9.12.0, installed from the lockfile, then ran billing typecheck/build and only
the selected operation. Its sandbox
target is fixed in the job steps; there is no environment selector. Live
commands receive credentials and dedicated test identities from
billing-sandbox Environment secrets. The local external secret file at
`Z:\Dev\Secrets\BCalAI\billing.env` is not used in CI. The optional purchase link is a secret and the purchase
identity must be a dedicated, free sandbox user. No diagnostics artifact is
uploaded.

Before a first live run, an administrator must create the billing-sandbox
Environment, require an authorized reviewer, prevent self-review, disable
administrator bypass, and allow deployments from main only. Add these
Environment secrets:

- `REVENUECAT_API_KEY`
- `BILLING_SUPABASE_URL`
- `BILLING_SUPABASE_SERVICE_ROLE_KEY`
- `BILLING_MONTHLY_TEST_USER_ID`
- `BILLING_ANNUAL_TEST_USER_ID`
- `BILLING_LIFECYCLE_TEST_USER_ID`
- `BILLING_RENEWAL_TEST_USER_ID`
- `BILLING_PURCHASE_TEST_USER_ID` (only if purchase is enabled)
- `BILLING_REVENUECAT_SANDBOX_PURCHASE_URL` (only if purchase is enabled)

Each operation uses its own dedicated test identity secret. The workflow must
also be present on the repository's default branch before GitHub can dispatch
it. Static tests prove its trigger/input/secret/mutation boundaries; no live
dispatch or purchase had been run **at this historical checkpoint**.

#### Phase 5 closeout — 2026-09-23

**PROVEN LIVE:** the protected GitHub Environment was configured and the manual
RevenueCat sandbox billing workflow's lifecycle-read-only run #7 passed. The
workflow uses Node 22; aligning the runtime resolved the hosted Supabase client
initialization failure. Normal CI is green on Node 22. This run observed the
existing sandbox lifecycle state read-only. It made no new purchase and did not
authorize a purchase, provider write, database write, or production activation.
Production billing remains disabled. Phase 5 is complete; Phase 6 adversarial
hardening is active.

### Phase 6 — adversarial hardening + documentation closeout

- Goal: attack the automation and reconcile all billing documentation.
- Scope: wrong UUID, wrong project, production target, expired credentials,
  pagination gaps, stale webhooks, replay/order races, duplicate active tests,
  timeout handling, redaction, and final runbook/report updates.
- Excluded: unrelated billing redesign and new product features.
- Tests: adversarial offline suite, database/RLS tests where relevant, complete
  sandbox acceptance reruns, and repository verification.
- Live/manual requirement: final human review of legal/production gates remains
  mandatory.
- Exit criteria: every claim has local or live evidence labelled, no safety
  regression exists, and the track is ready for a separate production decision.

#### Phase 6 coverage audit — 2026-09-23

This is the earlier audit snapshot. The final Phase 6 acceptance matrix below
supersedes its `Partial` labels without changing the dated checkpoint.

| Item                                 | Current coverage | Verification boundary / remaining gap                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong UUID                           | Partial          | Malformed, missing, and non-UUID input fails before adapters; an existing but unintended UUID needs a trusted identity expectation to distinguish it from another valid account. Offline input tests; no live mutation needed.                                                                                                   |
| Wrong or ambiguous project           | Covered          | Exact-name discovery, duplicate/missing project rejection, canonical ID scoping, and customer project identity checks have offline fixtures.                                                                                                                                                                                     |
| Production target                    | Covered          | Configuration and assertion guards reject production; workflow exposes only sandbox operations. Offline tests.                                                                                                                                                                                                                   |
| Expired credentials                  | Partial          | CLI authorization exit is mapped to a safe error; Supabase client/read failures are covered. A live expired-key check would require controlled provider credential state, not a purchase.                                                                                                                                        |
| Pagination gaps                      | Partial          | Project and provider continuation cursors fail closed. Empty cursors now fail as malformed; offline fixtures exercise all billing read surfaces. The approved named CLI has no continuation interface, so complete multi-page traversal and omitted-page detection remain open.                                                  |
| Stale webhooks                       | Partial          | Handler and local database tests cover stale delivery and no-op behavior; no provider-side stale delivery was manufactured.                                                                                                                                                                                                      |
| Replay/order races                   | Covered locally  | The two-connection local harness confirms a lock wait before release and proves duplicate event-ID preservation, newer renewal versus stale expiration, and expiration versus older renewal. Atomic rollback, ledger outcomes, mirror count, and server entitlement also pass. No provider-side concurrent delivery was induced. |
| Duplicate active state               | Partial          | Duplicate Supabase mirror rows and ledger IDs fail closed. Offline monthly and annual assertions now reject two simultaneous active Pro subscriptions, including conflicts across plans, while allowing expired history. Provider-side live duplication was not induced.                                                         |
| Timeout and output limits            | Covered          | Fixed CLI timeout and output cap map to stable errors without raw provider output; offline runner tests.                                                                                                                                                                                                                         |
| Redaction                            | Covered          | Secret configuration, subprocess diagnostics, reports, and workflow secret sources have offline tests.                                                                                                                                                                                                                           |
| Documentation/runbook reconciliation | Partial          | Phase 5 status and this audit are current; Phase 6 final acceptance and production/legal human review remain open.                                                                                                                                                                                                               |

#### Phase 6 duplicate-active checkpoint — 2026-09-23

**VERIFIED LOCALLY:** `billing:assert-user` rejects more than one current,
access-granting Pro subscription for the explicit test user with
`REVENUECAT_MULTIPLE_ACTIVE_SUBSCRIPTIONS`. The guard runs after provider
product and entitlement validation and before an active-Pro result can pass.
Monthly and annual fixtures pass for one active subscription with expired
history, and fail for two active subscriptions on the same or different plans.
The conflict report redacts the test UUID and does not print subscription IDs,
provider payloads, or secrets.

**PENDING:** `subscription.test.sql` passed all 26 existing local pgTAP checks,
including sequential replay, stale ordering, and RLS boundaries. Its single
transaction and single database connection cannot demonstrate a race. The
smallest suitable follow-up is a separate local-only test using two independent
database connections, a synchronization barrier, and the existing service-role
RPC/ledger path. It must assert the final mirror, unique event ledger, and
unchanged client permissions after the competing calls complete. No concurrent
database result is claimed for this checkpoint.

#### Phase 6 atomic webhook race checkpoint — 2026-09-23

**VERIFIED LOCALLY:** A two-connection Postgres test reproduced a real split-write
race: the first caller updated the mirror, but a duplicate caller wrote the
unique ledger ID first with `applied=false` and `STALE_EVENT`. The mirror and
server entitlement were active while the sole ledger row falsely said the
event was skipped. The prior checkpoint above remains the historical state
before this investigation.

The forward migration adds `process_revenuecat_event`, the webhook's single
database call. The function claims `event_id`, applies the existing timestamp
guard to every affected mirror row, and finalizes the ledger outcome in one
transaction. A duplicate waits on the unique key, then returns `DUPLICATE`
without changing the original outcome. An error rolls back both claim and
mirror changes. The service role can execute the new RPC but no longer has the
old mirror RPC or a separate ledger INSERT; client grants and RLS were not
broadened.

The preserved local harness uses two independent service-role Postgres sessions
and checks `pg_blocking_pids` before releasing the first transaction. Concurrent
duplicate delivery now leaves one applied ledger row, one active mirror row,
and active server entitlement. A newer renewal defeats an older expiration;
a newer expiration defeats an older renewal that completes later. Both ordering
cases keep one mirror row, coherent ledger outcomes, and matching server
authorization. New pgTAP tests prove the atomic contract, rollback after a
mirror write fails, and unchanged client boundaries. These are local results;
no hosted webhook or provider delivery was run for this fix.

#### Phase 6 hosted sandbox/dev deployment — 2026-09-23

**PROVEN LIVE (deployment and read-only checks):** `main` and `origin/main`
matched at `d0ddd0b1ce2adcc8ca4f3aae22edaf60784124ca`. The linked Supabase
project was `nlpyloypcphvajbvasnr`, the sole project visible to the CLI profile;
its existing `revenuecat-webhook` and `REVENUECAT_WEBHOOK_SECRET` were present.
The linked migration dry run listed only
`20260923000001_revenuecat_atomic_event.sql`. It was applied with vault updates
skipped, then recorded in hosted migration history with no pending migrations.

Read-only PostgreSQL privilege checks found `process_revenuecat_event` present
and executable by `service_role`, but not by `authenticated`, `anon`, or
`PUBLIC`. `service_role` could neither execute the old split
`apply_revenuecat_event` RPC nor independently insert into
`subscription_events`. Aggregate mirror/ledger counts were unchanged across
the migration: 5 subscriptions, 54 events, 30 applied events. No billing RPC
was invoked with a fabricated hosted event.

After the migration and grant checks, only `revenuecat-webhook` was deployed.
The hosted function became active at version 6 with `verify_jwt=false`; the
existing webhook secret name remained present and was not rotated. A
non-mutating GET returned its expected 405 method guard. The protected
`lifecycle-read-only` GitHub workflow run
[#35834501740](https://github.com/2h5/BPlan-Business-Calendar/actions/runs/35834501740)
passed on the same main SHA for the existing sandbox lifecycle identity. The
run made no purchase or RevenueCat mutation.

**PENDING:** This establishes the hosted atomic RPC and deployed webhook code,
plus read-only continuity of existing billing state. No concurrent
provider-side delivery, replay, or stale event was manufactured or observed
through the newly deployed path. Live event-handling behavior under a future
natural RevenueCat delivery remains unproven. Production billing and final
legal approval remain separate gates.

#### Phase 6 final engineering acceptance — 2026-09-23

The closeout audit found no further narrow code change that improves the
reviewed read-only boundary. The remaining cases either fail closed under the
pinned CLI or require independent operator/provider state. The normal CI run
for the deployment documentation commit
[#35835780246](https://github.com/2h5/BPlan-Business-Calendar/actions/runs/35835780246)
passed static, database/RLS/generated-type, and Deno jobs. No billing workflow
was dispatched for this closeout audit.

**PROVEN LOCAL on the closeout branch:** `pnpm billing:test` passed 194 tests;
`pnpm billing:typecheck`, `pnpm billing:build`, `pnpm verify` (313 domain, 290
web, and 194 billing tests plus format, lint, typecheck, and build), and
`git diff --check` passed. The branch changes documentation only, so no new
focused code test was needed.

| Area                                                                      | Status                     | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed identity, wrong project, and production target                  | COVERED FAIL-CLOSED        | UUID syntax and explicit sandbox mode are checked before adapters. Exact-name project discovery requires one match, then every provider read uses the discovered project ID; mismatched customer/project IDs fail. These are offline-tested guards.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Another valid UUID selected as the test identity                          | ACCEPTED EXTERNAL BOUNDARY | The protected workflow selects a dedicated identity through its Environment secret. Supabase mirror/ledger and RevenueCat customer records are all queried using that selected UUID; their agreement proves account-state consistency, not operator intent. RevenueCat aliases and the checkout's fixed non-deliverable email do not independently identify the intended Auth fixture. No second UUID copy or fabricated identity check was added. Operators must verify the fixture secret against the intended test account before a live run.                                                                                                                                                                 |
| Provider pagination signaled by `next_page`                               | COVERED FAIL-CLOSED        | Project, entitlement, customer subscription/purchase, and nested entitlement responses reject advertised continuation; malformed empty cursors fail validation. Offline tests cover the read surfaces. An assertion never reports success from a known partial page.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Complete traversal and an omitted provider page                           | ACCEPTED EXTERNAL BOUNDARY | The installed `@revenuecat/cli` 0.1.1 schemas expose no page/cursor/limit flags for the approved named reads. [RevenueCat API v2](https://www.revenuecat.com/docs/api-v2) supports `starting_after`, and `rc api GET` can reach it, but adding an exact path/method allowlist, response schemas, cursor loops, and limits would materially expand the reviewed CLI-only trust surface. No arbitrary API fallback was added. If multi-page accounts become a requirement, separately review a bounded, exact-path GET allowlist and tests for repeated/malformed cursors, missing pages, and page-limit exhaustion. A provider response that falsely omits continuation cannot be proven complete by this client. |
| Expired or unauthorized credentials                                       | COVERED FAIL-CLOSED        | CLI exit 4 maps to a redacted `CLI_AUTHORIZATION`; missing keys, transport errors, malformed output, and Supabase read failures produce nonzero failure. Deterministic tests cover this without changing the working hosted credential.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A genuinely expired hosted key                                            | ACCEPTED EXTERNAL BOUNDARY | No disposable credential mechanism is part of this workflow. A live expiration exercise would require altering or replacing provider credentials and is an operational/manual scenario.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Duplicate active Pro subscriptions                                        | COVERED FAIL-CLOSED        | Monthly and annual offline fixtures reject two simultaneous access-granting subscriptions, including cross-plan conflicts, while allowing expired history. No provider-side duplicate was created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Atomic duplicate, stale, and order races                                  | PROVEN LOCAL               | The two-connection Postgres harness proved lock waiting, one applied event ledger row, coherent mirror/server authorization, rollback, and both opposite event-order races. Handler and pgTAP tests cover the same contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Hosted atomic RPC, grants, and webhook deployment                         | PROVEN HOSTED              | The migration is recorded on the linked sandbox/dev project; grants, old split-write revocation, and unchanged mirror/ledger counts were checked read-only. `revenuecat-webhook` v6 is active and uses the new RPC. A safe GET returned 405.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Existing hosted lifecycle identity                                        | PROVEN HOSTED              | The protected `lifecycle-read-only` [run #35834501740](https://github.com/2h5/BPlan-Business-Calendar/actions/runs/35834501740) passed after deployment without a purchase or provider/database mutation. It reconciled existing state; it did not deliver a new webhook.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Concurrent, replayed, or stale RevenueCat delivery on the new hosted path | ACCEPTED EXTERNAL BOUNDARY | No provider-side concurrent delivery, replay, or stale event was manufactured. A future natural delivery may provide live observation; local concurrency and hosted deployment evidence are stated separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Timeout, output limits, redaction, and runbook reconciliation             | PROVEN LOCAL               | Offline tests cover bounded CLI execution and redacted failures; the three Phase 6 documents now use these evidence labels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Production billing and legal identity                                     | HUMAN RELEASE GATE         | Production checkout stays disabled. Seller identity, final legal documents, production provider configuration, and explicit approval are separate human decisions, not Phase 6 engineering failures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Phase 6 engineering acceptance is complete for the current sandbox automation
contract. Known multi-page responses still stop safely instead of traversing;
supporting them would be a separately scoped provider adapter change. The
external observations and production decisions above do not require an
artificial purchase, credential rotation, or fabricated webhook delivery.

## 11. Final desired acceptance flow

The eventual operator flow should stay small and explicit:

```text
pnpm billing:preflight
pnpm billing:assert-user -- --user <sandbox-supabase-uuid>
pnpm billing:checkout-ready -- --plan monthly
pnpm billing:e2e:sandbox -- --plan monthly
pnpm billing:lifecycle:sandbox -- --plan monthly --user <sandbox-supabase-uuid>
```

The exact argument parser and command names may change if a safer repository
convention is adopted. The important properties are that preflight and
assertion are read-only, the test user is explicit, plan selection is explicit,
live commands are opt-in, and production is never a default.

A successful eventual run means:

1. static and provider configuration match the sandbox contract;
2. the selected test UUID identifies the RevenueCat customer;
3. the hosted checkout really completes in Stripe sandbox;
4. RevenueCat records the selected monthly/yearly subscription and `pro`;
5. the webhook delivers and the Supabase ledger/mirror converge;
6. `has_active_entitlement()` agrees with the mirror;
7. cancellation, expiry, renewal, and replay semantics pass the selected
   lifecycle checks; and
8. the report states exactly which steps were live and which were local.

## 12. Relationship to existing docs

- `docs/revenuecat-stripe-setup.md` remains the provider/dashboard setup
  runbook and records the current billing decision, identifiers, external setup,
  legal gates, and manual acceptance checklist.
- `docs/revenuecat-automation-plan.md` is the automation implementation source
  of truth: command boundaries, safety rules, credentials, tests, lifecycle, CI,
  and phase exit criteria live here.
- `docs/sprint-6-active.md` remains the Sprint 6 status tracker. It records
  billing foundation status and links here; it must not claim live purchase,
  lifecycle, or production completion without evidence.

## Batch 1 completion boundary

Batch 1 is complete only when the repository contains the offline preflight
foundation, the hardened mode/project-ID contract, and its deterministic tests.
It does not include:

- RevenueCat CLI installation, authentication, invocation, or a direct REST
  client;
- a live RevenueCat API request;
- Playwright or any browser automation;
- a Stripe sandbox purchase;
- cancellation, expiry, renewal, refund, or cleanup mutation;
- a hosted Supabase read/write;
- a GitHub Actions live workflow;
- a production checkout flag, seller identity, legal approval, or live Stripe
  configuration change.

Batch 1 and automation Phases 2A through 5 are complete. The protected GitHub
lifecycle-read-only run #7 passed on Node 22 without a new purchase. Phase 6
adversarial hardening is active. The real monthly sandbox purchase proved
RevenueCat, webhook,
Supabase mirror, ledger, and server authorization convergence; browser
ambiguity was handled by read-only reconciliation and the purchase was never
retried. The fresh annual sandbox purchase passed the same active-Pro authority
chain under the corrected Product identity assertion, with browser ambiguity
resolved read-only and no retry. Phase 4 proved cancellation through expiry and
natural annual renewal; deterministic webhook and database tests cover replay
and ordering. Production billing remains disabled.
