-- Sequential contract and rollback checks for the atomic webhook RPC.
-- tools/billing/subscription-race.local.mjs proves the two-session lock
-- interleavings that a single pgTAP transaction cannot.
begin;
create extension if not exists pgtap;
select plan(35);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated',
   'authenticated', 'atomic-recipient@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated',
   'authenticated', 'atomic-owner@example.com', now(), now());

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('service_role',
    'public.process_revenuecat_event(text,text,timestamptz,text,text,text,uuid,text,timestamptz,text,text[],uuid[],text,jsonb)',
    'EXECUTE'),
  'service_role can call the atomic webhook boundary'
);
select ok(
  not has_function_privilege('authenticated',
    'public.process_revenuecat_event(text,text,timestamptz,text,text,text,uuid,text,timestamptz,text,text[],uuid[],text,jsonb)',
    'EXECUTE'),
  'authenticated cannot call the atomic webhook boundary'
);
select ok(
  to_regprocedure('public.process_revenuecat_event(text,uuid,text,timestamptz,text,timestamptz,text,text[],uuid[],text,jsonb)') is null,
  'the previous webhook signature with payload-driven transfer revocation is gone'
);
select ok(
  not has_function_privilege('service_role',
    'public.apply_revenuecat_event(uuid,text,text,timestamptz,timestamptz,text)',
    'EXECUTE'),
  'service_role cannot use the old split mirror RPC'
);
select ok(
  not has_function_privilege('service_role',
    'public.enqueue_revenuecat_reconciliation(uuid,text)', 'EXECUTE'),
  'the internal enqueue helper is not directly callable'
);
select ok(
  not has_table_privilege('service_role', 'public.subscription_events', 'INSERT'),
  'service_role cannot write a ledger outcome separately'
);
select ok(
  has_table_privilege('service_role', 'public.subscription_events', 'SELECT'),
  'service_role retains read-only ledger inspection'
);

-- ---------------------------------------------------------------------------
-- apply / duplicate / stale
-- ---------------------------------------------------------------------------
select is(
  public.process_revenuecat_event(
    'atomic-initial', 'INITIAL_PURCHASE', '2026-09-01T00:00:00Z', 'SANDBOX', 'apply',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'active', '2026-10-01T00:00:00Z', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'first delivery applies'
);
select ok(
  (select applied and user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
          and environment = 'SANDBOX' and source = 'webhook' and duplicate_deliveries = 0
     from public.subscription_events where event_id = 'atomic-initial'),
  'the applied ledger outcome commits with user, environment, and source'
);
select is(
  public.process_revenuecat_event(
    'atomic-initial', 'INITIAL_PURCHASE', '2026-09-01T00:00:00Z', 'SANDBOX', 'apply',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'active', '2026-10-01T00:00:00Z', null,
    array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'DUPLICATE', 'a replay sees the processed event ID'
);
select is(
  (select count(*)::int from public.subscription_events where event_id = 'atomic-initial'),
  1, 'replay does not duplicate the ledger row'
);
select ok(
  (select applied and duplicate_deliveries = 1
     from public.subscription_events where event_id = 'atomic-initial'),
  'replay preserves the original result and is counted as duplicate evidence'
);

select is(
  public.process_revenuecat_event(
    'atomic-renewal', 'RENEWAL', '2026-09-20T00:00:00Z', 'SANDBOX', 'apply',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'active', '2026-11-01T00:00:00Z', null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'newer renewal applies'
);
select is(
  public.process_revenuecat_event(
    'atomic-old-expiry', 'EXPIRATION', '2026-09-10T00:00:00Z', 'SANDBOX', 'apply',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'expired', '2026-09-10T00:00:00Z', null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'STALE', 'older expiration is recorded without changing the mirror'
);
select is(
  (select status || ' ' || expires_at::text || ' ' || last_event_at::text
     from public.subscriptions
    where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and entitlement = 'pro'),
  'active 2026-11-01 00:00:00+00 2026-09-20 00:00:00+00',
  'newer status, expiry, and high-water mark remain authoritative'
);
select is(
  (select skipped_reason from public.subscription_events where event_id = 'atomic-old-expiry'),
  'STALE_EVENT', 'stale outcome is audited'
);
select ok(
  public.has_active_entitlement('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pro'),
  'server authorization agrees with the mirror'
);

-- ---------------------------------------------------------------------------
-- ignore / unknown user (terminal, audited, no retry)
-- ---------------------------------------------------------------------------
select is(
  public.process_revenuecat_event(
    'atomic-ignored', 'TEST', '2026-09-21T00:00:00Z', null, 'ignore',
    'test-user', null, null, null, null, array[]::text[], array[]::uuid[], 'TEST_EVENT', '{}'::jsonb
  ), 'IGNORED', 'an ignored event is recorded through the same atomic boundary'
);
select is(
  (select skipped_reason from public.subscription_events where event_id = 'atomic-ignored'),
  'TEST_EVENT', 'the ignore reason is preserved'
);

select is(
  public.process_revenuecat_event(
    'atomic-deleted-user', 'RENEWAL', '2026-09-21T00:00:00Z', 'SANDBOX', 'apply',
    'ffffffff-ffff-ffff-ffff-ffffffffffff', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'active', '2026-12-01T00:00:00Z', null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'IGNORED', 'an event for a user absent from auth.users is terminal, not a retry'
);
select ok(
  (select not applied and user_id is null and skipped_reason = 'UNKNOWN_APP_USER'
          and app_user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
     from public.subscription_events where event_id = 'atomic-deleted-user'),
  'the unknown-user outcome keeps the provider App User ID for diagnosis'
);
select is(
  (select count(*)::int from public.subscriptions
    where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  0, 'an unknown user never gains a mirror row'
);

-- ---------------------------------------------------------------------------
-- reconcile hints (TRANSFER and friends)
-- ---------------------------------------------------------------------------
select is(
  public.process_revenuecat_event(
    'atomic-transfer', 'TRANSFER', '2026-09-22T00:00:00Z', 'SANDBOX', 'reconcile',
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    null, null, null, array[]::text[],
    array['dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          'ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[],
    null, '{}'::jsonb
  ), 'DEFERRED', 'a transfer queues authoritative reconciliation instead of guessing'
);
select is(
  (select array_agg(user_id::text order by user_id::text)
     from public.revenuecat_reconciliations where reason = 'TRANSFER'),
  array['dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'],
  'both known participants are queued and the unknown one is dropped'
);
select ok(
  (select not applied and skipped_reason = 'RECONCILIATION_QUEUED'
          and user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
     from public.subscription_events where event_id = 'atomic-transfer'),
  'the transfer ledger row is attributed to its destination and records the deferral'
);
select ok(
  public.has_active_entitlement('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pro')
  and not public.has_active_entitlement('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pro'),
  'a transfer payload alone changes no entitlement'
);
select is(
  public.process_revenuecat_event(
    'atomic-transfer-unknown', 'TRANSFER', '2026-09-22T00:00:00Z', 'SANDBOX', 'reconcile',
    null, null, null, null, null, array[]::text[],
    array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[], null, '{}'::jsonb
  ), 'IGNORED', 'a hint about only deleted users is terminal'
);
select is(
  (select skipped_reason from public.subscription_events where event_id = 'atomic-transfer-unknown'),
  'UNKNOWN_APP_USER', 'and is audited as such'
);

-- ---------------------------------------------------------------------------
-- invalid decisions and rollback
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.process_revenuecat_event(
    'atomic-no-env', 'RENEWAL', now(), null, 'apply',
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'active', now() + interval '1 day', null, array['pro'], array[]::uuid[], null, '{}'::jsonb)$$,
  '23514', null, 'an apply decision without an enforced environment is rejected'
);
select throws_ok(
  $$select public.process_revenuecat_event(
    'atomic-paused', 'SUBSCRIPTION_PAUSED', now(), 'SANDBOX', 'apply',
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'paused', now() + interval '1 day', null, array['pro'], array[]::uuid[], null, '{}'::jsonb)$$,
  '23514', null, 'the webhook can no longer write the legacy paused status'
);

-- A failure after the first mirror write must roll back the claim and the write.
create function public.test_explode_entitlement() returns trigger
language plpgsql as $$
begin
  if new.entitlement = 'explode' then
    raise exception 'forced failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_explode_entitlement before insert on public.subscriptions
  for each row execute function public.test_explode_entitlement();

select throws_ok(
  $$select public.process_revenuecat_event(
    'atomic-failed', 'INITIAL_PURCHASE', '2026-09-22T00:00:00Z', 'SANDBOX', 'apply',
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'active', '2026-12-01T00:00:00Z', null, array['temporary', 'explode'], array[]::uuid[],
    null, '{}'::jsonb)$$,
  'P0001', null, 'a failure after a mirror write aborts the whole event'
);
select is(
  (select count(*)::int from public.subscription_events where event_id = 'atomic-failed'),
  0, 'the failed event leaves no claimed ledger row, so a retry can process it'
);
select is(
  (select count(*)::int from public.subscriptions
   where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and entitlement = 'temporary'),
  0, 'the failed event leaves no mirror change'
);

-- ---------------------------------------------------------------------------
-- client boundary
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select throws_ok(
  $$select public.process_revenuecat_event(
    'client-forgery', 'INITIAL_PURCHASE', now(), 'SANDBOX', 'apply',
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'active', now() + interval '1 day', null, array['pro'], array[]::uuid[], null, '{}'::jsonb)$$,
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
