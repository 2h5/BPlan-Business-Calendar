-- Sequential contract and rollback checks for the atomic webhook RPC.
-- The separate Node harness proves actual two-session lock interleavings.
begin;
create extension if not exists pgtap;
select plan(25);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated',
   'authenticated', 'atomic-recipient@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated',
   'authenticated', 'atomic-owner@example.com', now(), now());

select ok(
  has_function_privilege('service_role',
    'public.process_revenuecat_event(text,uuid,text,timestamptz,text,timestamptz,text,text[],uuid[],text,jsonb)',
    'EXECUTE'),
  'service_role can call the atomic webhook boundary'
);
select ok(
  not has_function_privilege('authenticated',
    'public.process_revenuecat_event(text,uuid,text,timestamptz,text,timestamptz,text,text[],uuid[],text,jsonb)',
    'EXECUTE'),
  'authenticated cannot call the atomic webhook boundary'
);
select ok(
  not has_function_privilege('service_role',
    'public.apply_revenuecat_event(uuid,text,text,timestamptz,timestamptz,text)',
    'EXECUTE'),
  'service_role cannot use the old split mirror RPC'
);
select ok(
  not has_table_privilege('service_role', 'public.subscription_events', 'INSERT'),
  'service_role cannot write a ledger outcome separately'
);
select ok(
  has_table_privilege('service_role', 'public.subscription_events', 'SELECT'),
  'service_role retains read-only ledger inspection'
);

select is(
  public.process_revenuecat_event(
    'atomic-initial', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'INITIAL_PURCHASE', '2026-09-01T00:00:00Z', 'active',
    '2026-10-01T00:00:00Z', 'local-test', array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'first delivery applies'
);
select is(
  (select count(*)::int from public.subscriptions
   where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and entitlement = 'pro'),
  1, 'one mirror row exists'
);
select ok(
  (select applied from public.subscription_events where event_id = 'atomic-initial'),
  'the applied ledger outcome commits with the mirror'
);
select is(
  public.process_revenuecat_event(
    'atomic-initial', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'INITIAL_PURCHASE', '2026-09-01T00:00:00Z', 'active',
    '2026-10-01T00:00:00Z', 'local-test', array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'DUPLICATE', 'a replay sees the processed event ID'
);
select is(
  (select count(*)::int from public.subscription_events where event_id = 'atomic-initial'),
  1, 'replay does not duplicate the ledger row'
);
select ok(
  (select applied from public.subscription_events where event_id = 'atomic-initial'),
  'replay preserves the original applied result'
);

select is(
  public.process_revenuecat_event(
    'atomic-renewal', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'RENEWAL', '2026-09-20T00:00:00Z', 'active',
    '2026-11-01T00:00:00Z', 'local-test', array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'newer renewal applies'
);
select is(
  public.process_revenuecat_event(
    'atomic-old-expiry', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'EXPIRATION', '2026-09-10T00:00:00Z', 'expired',
    '2026-09-10T00:00:00Z', 'local-test', array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'STALE', 'older expiration is recorded without changing the mirror'
);
select is(
  (select status from public.subscriptions
   where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and entitlement = 'pro'),
  'active', 'newer status remains authoritative'
);
select is(
  (select expires_at from public.subscriptions
   where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and entitlement = 'pro'),
  '2026-11-01T00:00:00Z'::timestamptz, 'newer expiration remains authoritative'
);
select is(
  (select last_event_at from public.subscriptions
   where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and entitlement = 'pro'),
  '2026-09-20T00:00:00Z'::timestamptz, 'high-water mark stays at the renewal'
);
select is(
  (select skipped_reason from public.subscription_events where event_id = 'atomic-old-expiry'),
  'STALE_EVENT', 'stale outcome is audited'
);
select ok(
  public.has_active_entitlement('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pro'),
  'server authorization agrees with the mirror'
);

select is(
  public.process_revenuecat_event(
    'atomic-ignored', null, 'TEST', '2026-09-21T00:00:00Z', null,
    null, null, array[]::text[], array[]::uuid[], 'TEST_EVENT', '{}'::jsonb
  ), 'IGNORED', 'ignored event is recorded through the same atomic boundary'
);
select is(
  (select skipped_reason from public.subscription_events where event_id = 'atomic-ignored'),
  'TEST_EVENT', 'ignored reason is preserved'
);

-- The recipient mirror changes first; the missing previous owner then raises
-- a foreign-key error. The entire function statement must roll back.
select throws_ok(
  $$select public.process_revenuecat_event(
    'atomic-failed-transfer', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'TRANSFER', '2026-09-22T00:00:00Z', 'active',
    '2026-12-01T00:00:00Z', 'local-test', array['temporary'],
    array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[], null, '{}'::jsonb
  )$$,
  '23503', null, 'a failure after a mirror write aborts the whole event'
);
select is(
  (select count(*)::int from public.subscription_events where event_id = 'atomic-failed-transfer'),
  0, 'failed event leaves no claimed ledger row'
);
select is(
  (select count(*)::int from public.subscriptions
   where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and entitlement = 'temporary'),
  0, 'failed event leaves no mirror change'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select throws_ok(
  $$select public.process_revenuecat_event(
    'client-forgery', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'INITIAL_PURCHASE', now(), 'active', now() + interval '1 day',
    null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  )$$,
  '42501', null, 'authenticated cannot invoke the atomic writer'
);
select throws_ok(
  $$insert into public.subscription_events
    (event_id, user_id, event_type, event_at, applied, skipped_reason, payload)
    values ('client-ledger-forgery', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            'INITIAL_PURCHASE', now(), true, null, '{}'::jsonb)$$,
  '42501', null, 'authenticated cannot write the server-only ledger'
);
reset role;

select * from finish();
rollback;
