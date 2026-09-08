-- RevenueCat mirror: ordering, idempotency, and client isolation.
--
-- These are the guarantees the webhook handler delegates to the database, so
-- they are asserted here rather than in the Deno tests.

begin;
create extension if not exists pgtap;
select plan(16);

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
