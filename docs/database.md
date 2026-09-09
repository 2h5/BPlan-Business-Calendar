# Database

Postgres via Supabase. Every table below is created by a migration in
`supabase/migrations/`; nothing is created by hand.

## Conventions

- Every user-owned table has `user_id uuid not null references auth.users`.
- Every user-owned table has RLS enabled and explicit policies for the client
  operations it is allowed to perform. Server-managed operations have no client
  policy.
- A server-only table has RLS enabled and **no** policies.
- `updated_at` is maintained by the `set_updated_at` trigger, never by a client.
- Policies use `(select auth.uid())` so the planner evaluates it once per query
  rather than once per row.

## Tables and client-facing views

| Object                     | Purpose                             | Client access                                          |
| -------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `profiles`                 | Planning preferences, working hours | Own row, full CRUD                                     |
| `calendars`                | Internal and synced calendars       | Own rows, full CRUD                                    |
| `events`                   | Events and time blocks              | Own rows, full CRUD; provider writes use server path   |
| `task_lists`               | Lists / projects                    | Own rows, full CRUD                                    |
| `tasks`                    | Tasks and reminders                 | Own rows, full CRUD                                    |
| `tags`, `task_tags`        | Labelling                           | Own rows, via task ownership                           |
| `provider_accounts`        | Connected Google/Microsoft accounts | Safe-column read only; disconnect via Edge Function    |
| `provider_accounts_public` | Client-safe connection projection   | Read only                                              |
| `calendar_sync_states`     | Sync cursors, webhook bookkeeping   | **None**                                               |
| `sync_jobs`                | Durable retry queue                 | **None in current client grant set**                   |
| `calendar_sync_health`     | Client-safe sync health view        | Read only                                              |
| `ai_schedule_requests`     | Find Time requests                  | Read own requests; server-managed                      |
| `ai_schedule_suggestions`  | Ranked proposals                    | Read own proposed/accepted suggestions; server-managed |
| `subscriptions`            | RevenueCat entitlement mirror       | Read only                                              |
| `subscription_events`      | RevenueCat webhook event ledger     | **None; service-role only**                            |

`oauth_states` is a short-lived, server-only table for OAuth state and PKCE
verifiers. Its `return_target` is constrained to `mobile` or `web` and defaults
to `mobile`; client roles have no policies or write path for the table.

Provider watch ownership is deliberate. Google keeps one channel per imported
calendar in `calendar_sync_states`; Microsoft Graph keeps its mailbox/account-
scoped subscription identifiers, clientState, and expiry on
`provider_accounts`. Those watch fields are server-only even when the account's
safe status projection is readable by the mobile client. Provider-account
creation, updates, and disconnect deletion are server-managed; the client can
read the safe projection and must use `integrations-disconnect` for teardown.

RLS authorization and application authority are separate concerns. The `events`
table policies allow an owner to read and modify owned rows, but a provider-owned
event is still a provider mirror: application create/update/delete must go
through the provider-first `provider-event-write` path. Internal events remain
database-authoritative.

## Client access: RLS policies and SQL privileges

RLS and SQL privileges answer different questions. RLS policies filter which
rows a role may use; `GRANT`/`REVOKE` determines whether PostgREST may expose the
operation at all. A client request needs both. Migration
`20260908000021_client_api_table_grants.sql` adds the explicit authenticated
role grants required by the hosted project; it does not replace the row-level
policies.

The current client-facing access is:

| Object                     | RLS / view boundary                                                                                                     | Explicit client privilege                                             | Current app path                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `provider_accounts`        | Own-row `SELECT`; own-row `DELETE` policy, with sensitive watch/token columns revoked                                   | Safe-column `SELECT`; client `DELETE` is revoked by migration 11      | Apps read `provider_accounts_public` and use `integrations-disconnect` for teardown |
| `provider_accounts_public` | `security_invoker = true` view over the safe projection                                                                 | `SELECT` to `authenticated`                                           | Web and mobile integrations settings                                                |
| `sync_jobs`                | Legacy own-row `SELECT` policy remains in migration 4                                                                   | No explicit authenticated grant in the current client-grant migration | Not queried by either app; server queue functions only                              |
| `calendar_sync_health`     | `security_invoker = false` view with an `auth.uid()` owner filter; provider error text is reduced to safe status fields | `SELECT` to `authenticated`                                           | Web and mobile integrations settings                                                |
| `subscriptions`            | Own-row `SELECT` policy; writes are webhook/server-managed                                                              | `SELECT` to `authenticated`                                           | Web billing status query                                                            |
| `ai_schedule_requests`     | Own-row `SELECT`; final proposal runtime removes the broad client update policy                                         | `SELECT` to `authenticated`                                           | Reserved for future client proposal UI                                              |
| `ai_schedule_suggestions`  | `SELECT` only for the user's proposed/accepted requests                                                                 | `SELECT` to `authenticated`                                           | Reserved for future client proposal UI                                              |
| `subscription_events`      | RLS enabled with no client policies                                                                                     | `INSERT, SELECT` to `service_role` only                               | RevenueCat webhook ledger                                                           |

The server-only RevenueCat and AI RPCs are not browser write APIs. Current
security-definer grants allow `service_role` only for
`apply_revenuecat_event`, `has_active_entitlement`,
`claim_ai_schedule_request`, and `confirm_ai_schedule_suggestion`; `public`,
`anon`, and `authenticated` are explicitly revoked. The Edge Functions call
these through their admin/service-role client. The `sync_jobs` read policy is
therefore documented as a historical schema policy, not as supported client
access: without a matching SQL privilege, it does not establish PostgREST
access.

## Invariants enforced in the database

These are constraints, not conventions, because application code is not the only
thing that writes to this database:

- `events.end_at >= events.start_at`.
- A user has at most one default calendar — a partial unique index on
  `(user_id) where is_default`.
- An internal calendar has no provider identity; a synced calendar must have a
  `provider_calendar_id`.
- A task with `has_due_time` must have a `due_at`.
- A `completed` task must have a `completed_at`, and a non-completed task
  must not.
- `(provider_account_id, provider_event_id)` is unique — this is the idempotency
  key that makes replayed webhook deliveries safe.
- A provider recurrence instance may carry `recurring_event_id` and its
  `recurrence_original_start_at`; these identify an exception without changing
  the series master's stored RRULE.
- A claimed sync job carries a server-only `claim_token`; completion must use
  the token issued for that claim so a late worker cannot close a replacement.
- `claim_sync_jobs` locks provider-account rows while selecting work and claims
  at most one due job per connected account. `SKIP LOCKED` still allows jobs for
  unrelated accounts to progress.

## AI scheduling schema and access

The AI tables are server-managed proposal records, not a client-side write API.
The final migrations add the following fields and constraints:

- `ai_schedule_requests` stores `id`, `user_id`, `task_id`, `status`,
  `constraints`, `target_calendar_id`, `task_version`, `profile_version`,
  `target_calendar_version`, `candidate_count`, timestamps, and nullable
  provider/model/prompt/latency/token/error metadata. Candidate count and token
  counters are non-negative; status is constrained to `pending`, `proposed`,
  `accepted`, `rejected`, or `failed`. An accepted request may reference its
  resulting `accepted_event_id`.

  The task/profile/target-calendar version fields are the snapshots used for
  stale-input checks; the proposal does not copy raw calendar-event content.

- `ai_schedule_suggestions` stores an opaque non-empty `slot_id`, UTC
  `start_at`/`end_at`, a `score` from 0 to 1, a bounded `reason`, a rank from 1
  to 5, and nullable `accepted_at`. Slot identity and rank are unique within a
  request, and at most one suggestion can be accepted for a request.

Migration 15 removed the broad user update policy that existed in the initial AI
schema. Clients can read their own request/suggestion records under the final
select policies, but inserts, status changes, proposal persistence, and quota
claims are server-managed. `claim_ai_schedule_request` atomically enforces the
per-user limit of 10 claims in a rolling 60-minute window and is not a client
write path.

`confirm_ai_schedule_suggestion(p_user_id, p_suggestion_id)` is a server-only,
security-definer confirmation RPC added and hardened by migrations 16–18. It
locks the relevant user write path, rechecks task/profile/calendar versions and
recurrence-aware conflicts, and atomically creates or returns the internal
time-block event while updating the suggestion and request. Retrying an already
accepted suggestion returns its canonical event. Only proposal generation
requires the server-side Pro entitlement check; confirmation uses the persisted
proposal's controlled state.

## Indexes that matter

| Index                                                     | Query it serves                                   |
| --------------------------------------------------------- | ------------------------------------------------- |
| `events (user_id, start_at, end_at)`                      | "everything in this window" — every calendar view |
| `events (sync_status) where pending/failed/conflict`      | the outbound push queue                           |
| `tasks (user_id) where open and flexible and unscheduled` | the Find Time queue                               |
| `calendar_sync_states (webhook_expires_at)`               | Cron webhook renewal                              |
| `provider_accounts (webhook_expires_at)`                  | Account-scoped Graph subscription renewal         |
| `events (provider_account_id, recurring_event_id)`        | Recurring-instance reconciliation                 |

## Automatic provisioning

Two triggers mean the app never has to handle a signed-in user with missing
setup:

1. `on_auth_user_created` → creates a `profiles` row.
2. `profiles_create_default_calendar` → creates a "Personal" default calendar.

## Types

Regenerate after every migration and commit the result — CI fails if it is
stale:

```bash
pnpm db:types
```

## Testing

`supabase/tests/` holds pgTAP tests run by `supabase test db` in CI. They cover
cross-user isolation, the server-only tables, account-level queue serialization,
claim fencing, and the constraints above. An RLS mistake is silent in the app,
which is exactly why it is gated in CI.
