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

## Tables

| Table                     | Purpose                             | Client access                                          |
| ------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `profiles`                | Planning preferences, working hours | Own row, full CRUD                                     |
| `calendars`               | Internal and synced calendars       | Own rows, full CRUD                                    |
| `events`                  | Events and time blocks              | Own rows, full CRUD; provider writes use server path   |
| `task_lists`              | Lists / projects                    | Own rows, full CRUD                                    |
| `tasks`                   | Tasks and reminders                 | Own rows, full CRUD                                    |
| `tags`, `task_tags`       | Labelling                           | Own rows, via task ownership                           |
| `provider_accounts`       | Connected Google/Microsoft accounts | Read only; disconnect via Edge Function                |
| `calendar_sync_states`    | Sync cursors, webhook bookkeeping   | **None**                                               |
| `sync_jobs`               | Durable retry queue                 | Read only                                              |
| `ai_schedule_requests`    | Find Time requests                  | Read own requests; server-managed                      |
| `ai_schedule_suggestions` | Ranked proposals                    | Read own proposed/accepted suggestions; server-managed |
| `subscriptions`           | RevenueCat entitlement mirror       | Read only                                              |

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
