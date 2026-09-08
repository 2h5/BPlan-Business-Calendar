-- ============================================================================
-- 0020 — RevenueCat webhook event ledger and mirror ordering.
--
-- Migration 0005 created the `subscriptions` mirror but gave it no way to tell
-- one webhook delivery from another. RevenueCat retries on any non-2xx and
-- does not guarantee ordering, so the mirror needs two distinct protections:
--
--   1. Replay      — the same event delivered twice must apply once.
--                    `subscription_events.event_id` is the guard: the unique
--                    violation on a second insert IS the dedupe, atomically,
--                    without a read-then-write race.
--   2. Re-ordering — a delayed EXPIRATION must not overwrite a later RENEWAL.
--                    `subscriptions.last_event_at` is the guard: an event
--                    older than the mirror's high-water mark is recorded but
--                    never applied.
--
-- The ledger also gives support and tests a replayable history of what the
-- store actually said, which the mirror alone cannot reconstruct.
-- ============================================================================

create table public.subscription_events (
  -- RevenueCat's `event.id`. Natural primary key: dedupe is the constraint.
  event_id text primary key,
  -- Null when the event could not be attributed to a user (an anonymous
  -- purchase made before login). Kept for audit; never applied to a mirror.
  user_id uuid references auth.users (id) on delete cascade,
  event_type text not null,
  -- RevenueCat's `event_timestamp_ms`, not our receipt time. Ordering must
  -- follow the store's clock, not the order deliveries happened to arrive.
  event_at timestamptz not null,
  -- Whether the mirror actually changed, and if not, why. Makes "the webhook
  -- fired but nothing happened" answerable without re-deriving the logic.
  applied boolean not null default false,
  skipped_reason text,
  payload jsonb not null,
  received_at timestamptz not null default now(),

  constraint subscription_events_skip_reason_check
    check (applied or skipped_reason is not null)
);

create index subscription_events_user_idx
  on public.subscription_events (user_id, event_at desc);

alter table public.subscription_events enable row level security;
-- Deliberately no policies. This table is written by the RevenueCat webhook
-- under the service role and read by no client. Per AGENTS.md, a server-only
-- table still enables RLS so a future accidental grant fails closed.

comment on table public.subscription_events is
  'Append-only RevenueCat webhook ledger. Dedupes replays and records why an '
  'event did or did not change the subscriptions mirror. Server-only.';

-- ---------------------------------------------------------------------------
-- Ordering high-water mark on the mirror itself.
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column last_event_at timestamptz;

comment on column public.subscriptions.last_event_at is
  'Store-clock timestamp of the newest applied RevenueCat event. An event at '
  'or before this instant is stale and must not modify the row.';

-- ---------------------------------------------------------------------------
-- The single atomic mirror write.
--
-- Insert-or-update in one statement so two deliveries for the same user cannot
-- interleave a read and a write. The `where` on the conflict branch is the
-- ordering guard: a delivery carrying an older store timestamp than the row
-- already holds updates nothing and reports back that it did not apply.
--
-- Returns true when the mirror changed, false when the event was stale.
-- ---------------------------------------------------------------------------
create or replace function public.apply_revenuecat_event(
  p_user_id uuid,
  p_entitlement text,
  p_status text,
  p_expires_at timestamptz,
  p_event_at timestamptz,
  p_customer_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.subscriptions as s
    (user_id, provider, entitlement, status, expires_at, raw_customer_id, last_event_at)
  values
    (p_user_id, 'revenuecat', p_entitlement, p_status, p_expires_at, p_customer_id, p_event_at)
  on conflict (user_id, entitlement) do update
    set status          = excluded.status,
        expires_at      = excluded.expires_at,
        raw_customer_id = coalesce(excluded.raw_customer_id, s.raw_customer_id),
        last_event_at   = excluded.last_event_at
    where s.last_event_at is null or s.last_event_at < excluded.last_event_at;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.apply_revenuecat_event is
  'Atomic, order-safe write to the subscriptions mirror. Returns false when '
  'the event is older than the row it would have modified. Service-role only.';

revoke execute on function public.apply_revenuecat_event(
  uuid, text, text, timestamptz, timestamptz, text
) from anon, authenticated;
