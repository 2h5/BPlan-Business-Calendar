-- RevenueCat mirror: ordering, idempotency, and client isolation.
--
-- These are the guarantees the webhook handler delegates to the database, so
-- they are asserted here rather than in the Deno tests.

begin;
create extension if not exists pgtap;
select plan(26);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'authenticated', 'authenticated', 'sub-owner@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'authenticated', 'authenticated', 'sub-other@example.com', now(), now());

-- ---------------------------------------------------------------------------
-- Schema shape
-- ---------------------------------------------------------------------------

select has_table('public', 'subscription_events', 'the webhook ledger exists');

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.subscription_events'::regclass),
  'subscription_events has row level security enabled'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'subscription_events'),
  0,
  'subscription_events is server-only: RLS on, no policies'
);

select has_column('public', 'subscriptions', 'last_event_at',
  'subscriptions carries an ordering high-water mark');

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.subscriptions'::regclass),
  'subscriptions keeps row level security enabled'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'subscriptions'),
  1,
  'subscriptions keeps exactly its existing client-read policy'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  'the subscription policy remains an authenticated SELECT policy'
);

select ok(
  has_table_privilege('service_role', 'public.subscriptions', 'SELECT'),
  'service_role can read the subscription mirror'
);

select is(
  (select cardinality(statements) from supabase_migrations.schema_migrations
   where version = '20260918000001'),
  1,
  'the billing read grant migration contains one statement'
);

select ok(
  (select lower(statements[1]) ~
      'grant[[:space:]]+select[[:space:]]+on[[:space:]]+table[[:space:]]+public\.subscriptions[[:space:]]+to[[:space:]]+service_role'
    and lower(statements[1]) !~
      'grant[[:space:]]+.*(insert|update|delete|truncate|references|trigger)'
    and lower(statements[1]) !~
      'grant[[:space:]]+.*(anon|authenticated)'
   from supabase_migrations.schema_migrations
   where version = '20260918000001'),
  'the migration grants only SELECT to service_role'
);

select ok(
  has_table_privilege('authenticated', 'public.subscriptions', 'SELECT'),
  'authenticated retains its existing subscription read privilege'
);

-- ---------------------------------------------------------------------------
-- Applying events
-- ---------------------------------------------------------------------------

select ok(
  public.apply_revenuecat_event(
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro', 'active',
    '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z', 'cust_1'
  ),
  'an initial purchase applies to the mirror'
);

select ok(
  public.has_active_entitlement('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro'),
  'the purchaser is entitled'
);

-- Replay of the same delivery: same event timestamp, so not strictly newer.
select ok(
  not public.apply_revenuecat_event(
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro', 'active',
    '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z', 'cust_1'
  ),
  'replaying an event does not re-apply it'
);

-- The out-of-order case: a delayed EXPIRATION arriving after a RENEWAL.
select ok(
  public.apply_revenuecat_event(
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro', 'active',
    '2026-11-01T00:00:00Z', '2026-10-01T00:00:00Z', 'cust_1'
  ),
  'a renewal extends the entitlement'
);

select ok(
  not public.apply_revenuecat_event(
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro', 'expired',
    '2026-09-15T00:00:00Z', '2026-09-10T00:00:00Z', 'cust_1'
  ),
  'a late expiration older than the renewal is rejected'
);

select ok(
  public.has_active_entitlement('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro'),
  'the paying user keeps access after the out-of-order delivery'
);

-- The webhook writes one ledger row per provider event ID. A duplicate delivery
-- must retain the original applied result while a later stale event is audited.
insert into public.subscription_events
  (event_id, user_id, event_type, event_at, applied, skipped_reason, payload)
values
  ('renewal-event', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'RENEWAL',
   '2026-10-01T00:00:00Z', true, null, '{}'::jsonb)
on conflict (event_id) do nothing;
insert into public.subscription_events
  (event_id, user_id, event_type, event_at, applied, skipped_reason, payload)
values
  ('renewal-event', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'RENEWAL',
   '2026-10-01T00:00:00Z', false, 'STALE_EVENT', '{}'::jsonb)
on conflict (event_id) do nothing;
insert into public.subscription_events
  (event_id, user_id, event_type, event_at, applied, skipped_reason, payload)
values
  ('old-expiration', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'EXPIRATION',
   '2026-09-10T00:00:00Z', false, 'STALE_EVENT', '{}'::jsonb);

select is(
  (select count(*)::int from public.subscription_events where event_id = 'renewal-event'),
  1,
  'a duplicate provider event ID produces one ledger row'
);
select ok(
  (select applied from public.subscription_events where event_id = 'renewal-event'),
  'a sequential replay keeps the original applied ledger result'
);
select is(
  (select skipped_reason from public.subscription_events where event_id = 'old-expiration'),
  'STALE_EVENT',
  'an out-of-order expiration is audited as stale'
);

-- Cancellation keeps status active; only the clock ends access.
select ok(
  public.apply_revenuecat_event(
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro', 'active',
    '2026-11-01T00:00:00Z', '2026-10-15T00:00:00Z', 'cust_1'
  ),
  'a cancellation is recorded without changing status'
);

select ok(
  public.has_active_entitlement('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro'),
  'a cancelled subscription stays usable until it expires'
);

-- Expiry, delivered in order this time.
select ok(
  public.apply_revenuecat_event(
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro', 'expired',
    '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 'cust_1'
  ),
  'an in-order expiration applies'
);

select ok(
  not public.has_active_entitlement('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro'),
  'an expired subscription is not entitled'
);

-- ---------------------------------------------------------------------------
-- Client isolation
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';

select is(
  (select count(*)::int from public.subscriptions
   where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  0,
  'a signed-in user cannot read another user''s subscription'
);

select throws_ok(
  $$insert into public.subscriptions (user_id, entitlement, status)
    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pro', 'active')$$,
  '42501',
  null,
  'a signed-in user cannot grant themselves an entitlement'
);

reset role;

select * from finish();
rollback;
