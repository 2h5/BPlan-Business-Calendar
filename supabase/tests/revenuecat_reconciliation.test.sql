-- Reconciliation state, lease fencing, and authoritative snapshot repair.
-- Sequential contract only; the two-session harness covers interleavings.
begin;
create extension if not exists pgtap;
select plan(80);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'authenticated', 'authenticated', 'reconcile-lost-purchase@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
   'authenticated', 'authenticated', 'reconcile-refunded@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
   'authenticated', 'authenticated', 'reconcile-free@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
   'authenticated', 'authenticated', 'reconcile-requester@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
   'authenticated', 'authenticated', 'reconcile-lapsed@example.com', now(), now());

-- ---------------------------------------------------------------------------
-- Privileges and isolation
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.revenuecat_reconciliations'::regclass)
  and (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'revenuecat_reconciliations') = 0,
  'reconciliation state is server-only: RLS on, no policies'
);
select ok(
  not has_table_privilege('authenticated', 'public.revenuecat_reconciliations', 'SELECT')
  and not has_table_privilege('anon', 'public.revenuecat_reconciliations', 'SELECT')
  and not has_table_privilege('service_role', 'public.revenuecat_reconciliations', 'INSERT')
  and not has_table_privilege('service_role', 'public.revenuecat_reconciliations', 'UPDATE')
  and has_table_privilege('service_role', 'public.revenuecat_reconciliations', 'SELECT'),
  'clients cannot see reconciliation state; service_role may only inspect it directly'
);
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.revenuecat_provider_state'::regclass)
  and (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'revenuecat_provider_state') = 0
  and not has_table_privilege('authenticated', 'public.revenuecat_provider_state', 'SELECT')
  and not has_table_privilege('service_role', 'public.revenuecat_provider_state', 'UPDATE')
  and has_table_privilege('service_role', 'public.revenuecat_provider_state', 'SELECT'),
  'provider state is server-only and written only through its functions'
);
select ok(
  has_function_privilege('service_role', 'public.claim_revenuecat_reconciliations(integer,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_revenuecat_user_reconciliation(uuid,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.release_revenuecat_reconciliation(uuid,uuid,text,integer,boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.apply_revenuecat_snapshot(uuid,uuid,timestamptz,text,jsonb,text[],jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.enqueue_revenuecat_reconciliation_sweep(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.begin_revenuecat_provider_read(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.complete_revenuecat_catalog_read(text,uuid,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_revenuecat_provider_failure(text,text,uuid,text,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.revenuecat_billing_health()', 'EXECUTE'),
  'the reconciler worker surface is callable by service_role'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_revenuecat_reconciliations(integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_revenuecat_user_reconciliation(uuid,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.apply_revenuecat_snapshot(uuid,uuid,timestamptz,text,jsonb,text[],jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.release_revenuecat_reconciliation(uuid,uuid,text,integer,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.enqueue_revenuecat_reconciliation_sweep(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.begin_revenuecat_provider_read(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_revenuecat_provider_failure(text,text,uuid,text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.revenuecat_billing_health()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.apply_revenuecat_snapshot(uuid,uuid,timestamptz,text,jsonb,text[],jsonb)', 'EXECUTE'),
  'clients cannot claim work, request a lease for another user, write a snapshot, or touch provider state'
);
select ok(
  not has_function_privilege('service_role', 'public.ensure_revenuecat_reconcile_schedule()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.ensure_revenuecat_reconcile_schedule()', 'EXECUTE'),
  'only an operator (the owner) can install the schedule'
);

-- ---------------------------------------------------------------------------
-- A lost first purchase is repaired from RevenueCat state
-- ---------------------------------------------------------------------------
select ok(
  public.enqueue_revenuecat_reconciliation('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'PURCHASE_REDEEMED'),
  'queue a user with no mirror row'
);
select ok(
  not public.enqueue_revenuecat_reconciliation('ffffffff-ffff-ffff-ffff-ffffffffffff', 'TRANSFER'),
  'a hint about a missing user is dropped without an error'
);

create temporary table claim_one as
  select * from public.claim_revenuecat_reconciliations(10, 60);

select is(
  (select count(*)::int from claim_one where claimed_user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
  1, 'the worker claims the due request'
);
select is(
  (select count(*)::int from public.claim_revenuecat_reconciliations(10, 60)),
  0, 'a leased request cannot be claimed twice'
);
select is(
  public.apply_revenuecat_snapshot(
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', pg_catalog.gen_random_uuid(),
    now() - interval '1 minute', 'SANDBOX',
    jsonb_build_array(jsonb_build_object('entitlement', 'pro', 'expires_at', now() + interval '30 days')),
    array[]::text[], '{}'::jsonb
  ), 'LEASE_LOST', 'a snapshot without the current lease is rejected'
);
select ok(
  not public.has_active_entitlement('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'pro'),
  'and changes nothing'
);
select is(
  public.apply_revenuecat_snapshot(
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    (select claimed_lease_token from claim_one where claimed_user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
    now() - interval '1 minute', 'SANDBOX',
    jsonb_build_array(jsonb_build_object('entitlement', 'pro', 'expires_at', now() + interval '30 days')),
    array[]::text[], '{"granted":["pro"]}'::jsonb
  ), 'REPAIRED', 'the lease holder repairs the missing entitlement'
);
select ok(
  public.has_active_entitlement('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'pro'),
  'server authorization now agrees with RevenueCat'
);
select ok(
  (select applied and source = 'reconciliation' and event_type = 'RECONCILIATION'
          and environment = 'SANDBOX' and event_at = now() - interval '1 minute'
     from public.subscription_events
    where user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
  'the repair is ledgered with its snapshot time and environment'
);
select ok(
  (select last_event_at = now() - interval '1 minute'
     from public.subscriptions where user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
  'the mirror high-water mark matches the ledgered repair'
);
select ok(
  (select lease_token is null and last_outcome = 'REPAIRED' and completed_at >= requested_at
     from public.revenuecat_reconciliations where user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
  'a completed request is no longer pending'
);

select is(
  public.process_revenuecat_event(
    'recon-old-expiry', 'EXPIRATION', now() - interval '2 minutes', 'SANDBOX', 'apply',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'expired', now() - interval '2 minutes', null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'STALE', 'a webhook older than the snapshot cannot regress it'
);

select ok(
  public.enqueue_revenuecat_reconciliation('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'SWEEP'),
  're-queue the repaired user'
);
create temporary table claim_two as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select is(
  public.apply_revenuecat_snapshot(
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    (select claimed_lease_token from claim_two limit 1),
    now(), 'SANDBOX',
    jsonb_build_array(jsonb_build_object('entitlement', 'pro', 'expires_at', now() + interval '30 days')),
    array[]::text[], '{}'::jsonb
  ), 'CONVERGED', 'an agreeing snapshot changes nothing'
);
select is(
  (select count(*)::int from public.subscription_events
    where user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1' and source = 'reconciliation'),
  1, 'a converged check does not add ledger noise'
);

-- ---------------------------------------------------------------------------
-- A lost refund is revoked; unverifiable state is left alone; newer webhooks win
-- ---------------------------------------------------------------------------
select is(
  public.process_revenuecat_event(
    'recon-purchase', 'INITIAL_PURCHASE', now() - interval '10 days', 'SANDBOX', 'apply',
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    'active', now() + interval '20 days', null, array['pro', 'beta'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'a user starts with two entitlements from a webhook'
);
select ok(
  public.enqueue_revenuecat_reconciliation('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'SWEEP'),
  'queue the user for the daily check'
);
create temporary table claim_three as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select is(
  public.apply_revenuecat_snapshot(
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    (select claimed_lease_token from claim_three where claimed_user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'),
    now() - interval '1 minute', 'SANDBOX', '[]'::jsonb, array['beta'], '{}'::jsonb
  ), 'REPAIRED', 'RevenueCat no longer grants pro, so the mirror is revoked'
);
select ok(
  not public.has_active_entitlement('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'pro'),
  'the refunded entitlement no longer authorizes'
);
select ok(
  public.has_active_entitlement('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'beta'),
  'an entitlement whose environment could not be verified is not touched'
);

select is(
  public.process_revenuecat_event(
    'recon-newer-renewal', 'RENEWAL', now(), 'SANDBOX', 'apply',
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    'active', now() + interval '40 days', null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'a webhook newer than the snapshot applies'
);
select ok(
  public.enqueue_revenuecat_reconciliation('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'SWEEP'),
  'queue again'
);
create temporary table claim_four as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select is(
  public.apply_revenuecat_snapshot(
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    (select claimed_lease_token from claim_four where claimed_user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'),
    now() - interval '5 minutes', 'SANDBOX', '[]'::jsonb, array['beta'], '{}'::jsonb
  ), 'STALE', 'a snapshot older than the newest webhook cannot revoke it'
);
select ok(
  public.has_active_entitlement('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'pro'),
  'the newer renewal remains authoritative'
);
select ok(
  (select lease_token is null and last_outcome = 'STALE' and requested_at > completed_at
          and not_before = now() + interval '5 minutes 1 second'
     from public.revenuecat_reconciliations
    where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'),
  'a snapshot that lost to a newer row stays pending until one can be dated after that row'
);
select is(
  (select count(*)::int from public.claim_revenuecat_reconciliations(10, 60)
    where claimed_user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'),
  0, 'the deferred request is not claimable before the ordering margin passes'
);

-- A paid period that ended without its EXPIRATION webhook: the row is still
-- marked active. The snapshot records the lapse and keeps the real expiry.
select is(
  public.process_revenuecat_event(
    'recon-lapsed-purchase', 'INITIAL_PURCHASE', now() - interval '40 days', 'SANDBOX', 'apply',
    'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
    'active', now() - interval '10 days', null, array['pro'], array[]::uuid[], null, '{}'::jsonb
  ), 'APPLIED', 'a row whose paid period ended days ago is still marked active'
);
select ok(
  public.enqueue_revenuecat_reconciliation('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'SWEEP'),
  'queue the lapsed user'
);
create temporary table claim_lapsed as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select is(
  public.apply_revenuecat_snapshot(
    'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
    (select claimed_lease_token from claim_lapsed where claimed_user_id = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5'),
    now() - interval '1 minute', 'SANDBOX', '[]'::jsonb, array[]::text[], '{}'::jsonb
  ), 'REPAIRED', 'the snapshot records the lost expiration'
);
select ok(
  (select status = 'expired' and expires_at = now() - interval '10 days'
          and last_event_at = now() - interval '1 minute'
     from public.subscriptions where user_id = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5'),
  'the lapsed row keeps its real expiry instead of the snapshot time'
);

-- ---------------------------------------------------------------------------
-- Hints during a lease, failure backoff, and invalid snapshots
-- ---------------------------------------------------------------------------
select ok(
  public.enqueue_revenuecat_reconciliation('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'SWEEP'),
  'queue a free user'
);
create temporary table claim_five as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select ok(
  public.enqueue_revenuecat_reconciliation('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'TRANSFER'),
  'a transfer hint arrives while the snapshot is being read'
);
select is(
  public.apply_revenuecat_snapshot(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    (select claimed_lease_token from claim_five where claimed_user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
    now() - interval '1 minute', 'SANDBOX', '[]'::jsonb, array[]::text[], '{}'::jsonb
  ), 'CONVERGED', 'a free user with no rows converges without a write'
);
select ok(
  (select lease_token is null and requested_at > completed_at and reason = 'TRANSFER'
     from public.revenuecat_reconciliations
    where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'the hint that arrived during the lease stays pending for another snapshot'
);

create temporary table claim_six as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select ok(
  not public.release_revenuecat_reconciliation(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', pg_catalog.gen_random_uuid(), 'PROVIDER_UNAVAILABLE', null),
  'only the lease holder can release a request'
);
select ok(
  public.release_revenuecat_reconciliation(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    (select claimed_lease_token from claim_six where claimed_user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
    'PROVIDER_RATE_LIMITED', 600),
  'the lease holder releases a failed attempt'
);
select ok(
  (select lease_token is null and last_error = 'PROVIDER_RATE_LIMITED'
          and not_before >= now() + interval '600 seconds' and requested_at > completed_at
     from public.revenuecat_reconciliations
    where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'a failed attempt stays pending, backs off, and honours Retry-After'
);
select ok(
  (select claim_status = 'BACKING_OFF' and claimed_lease_token is null and retry_after_seconds >= 600
     from public.claim_revenuecat_user_reconciliation('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 60)),
  'a user refresh respects the backoff a failed attempt set, and says how long it lasts'
);
select ok(
  (select lease_token is null and not_before >= now() + interval '600 seconds'
     from public.revenuecat_reconciliations
    where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'and leaves the backoff untouched'
);
select ok(
  public.enqueue_revenuecat_reconciliation('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'TRANSFER')
  and (select not_before >= now() + interval '600 seconds'
         from public.revenuecat_reconciliations
        where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'a new hint does not shorten an existing backoff'
);
select throws_ok(
  $$select public.release_revenuecat_reconciliation(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', pg_catalog.gen_random_uuid(), 'raw provider text', null)$$,
  '23514', null, 'only a stable error code can be stored'
);

update public.revenuecat_reconciliations set not_before = now()
 where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
create temporary table claim_seven as
  select * from public.claim_revenuecat_reconciliations(10, 60);
select throws_ok(
  format($$select public.apply_revenuecat_snapshot(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', %L::uuid, now(), 'SANDBOX',
    jsonb_build_array(jsonb_build_object('entitlement', 'pro', 'expires_at', now() - interval '1 day')),
    array[]::text[], '{}'::jsonb)$$,
    (select claimed_lease_token from claim_seven limit 1)),
  '23514', null, 'a grant that has already expired is not a valid snapshot'
);
select throws_ok(
  format($$select public.apply_revenuecat_snapshot(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', %L::uuid, now(), 'STAGING',
    '[]'::jsonb, array[]::text[], '{}'::jsonb)$$,
    (select claimed_lease_token from claim_seven limit 1)),
  '23514', null, 'a snapshot must name an enforced environment'
);
select ok(
  public.release_revenuecat_reconciliation(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', (select claimed_lease_token from claim_seven limit 1),
    'PROVIDER_BACKOFF', 90, false),
  'a project-wide backoff hands the lease back'
);
select ok(
  (select lease_token is null and requested_at > completed_at
          and attempts = (select claimed_attempts - 1 from claim_seven limit 1)
          and not_before = now() + interval '90 seconds'
     from public.revenuecat_reconciliations
    where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'without counting the attempt or growing the backoff beyond the provider wait'
);
select throws_ok(
  $$select public.release_revenuecat_reconciliation(
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', pg_catalog.gen_random_uuid(), 'PROVIDER_BACKOFF', 90, null)$$,
  '23514', null, 'the attempt accounting must be explicit'
);

-- ---------------------------------------------------------------------------
-- Project-wide provider state: shared catalog cache and backoff
-- ---------------------------------------------------------------------------
create temporary table provider_one as
  select * from public.begin_revenuecat_provider_read('proj_a');
select ok(
  (select action = 'FETCH' and catalog is null and lease_token is not null from provider_one),
  'the first caller for a project leases the catalog fetch'
);
select ok(
  (select action = 'BLOCKED' and retry_after_seconds between 1 and 30
     from public.begin_revenuecat_provider_read('proj_a')),
  'a concurrent caller with no usable catalog waits instead of fetching too'
);
select ok(
  not public.complete_revenuecat_catalog_read('proj_a', pg_catalog.gen_random_uuid(),
    '[{"id":"entl_pro","lookup_key":"pro"}]'::jsonb),
  'only the lease holder stores the catalog'
);
select throws_ok(
  format($$select public.complete_revenuecat_catalog_read('proj_a', %L::uuid, '[{"id":"entl_pro"}]'::jsonb)$$,
    (select lease_token from provider_one)),
  '23514', null, 'a catalog entry without a lookup key is refused'
);
select ok(
  public.complete_revenuecat_catalog_read('proj_a', (select lease_token from provider_one),
    '[{"id":"entl_pro","lookup_key":"pro"}]'::jsonb),
  'the lease holder stores the catalog'
);
select ok(
  (select action = 'USE' and catalog = '[{"id":"entl_pro","lookup_key":"pro"}]'::jsonb
     from public.begin_revenuecat_provider_read('proj_a')),
  'every later caller uses the cached catalog without reading RevenueCat'
);
select ok(
  public.record_revenuecat_provider_failure('proj_a', 'CUSTOMER', null, 'PROVIDER_RATE_LIMITED', 120) >= 120
  and (select action = 'BLOCKED' and retry_after_seconds >= 120
         from public.begin_revenuecat_provider_read('proj_a')),
  'a project-wide customer rate limit blocks every RevenueCat read and honours Retry-After'
);

create temporary table provider_two as
  select * from public.begin_revenuecat_provider_read('proj_b');
select is(
  public.record_revenuecat_provider_failure('proj_b', 'CATALOG',
    (select lease_token from provider_two), 'PROVIDER_UNAVAILABLE', null),
  30, 'a first catalog failure backs off thirty seconds'
);
select ok(
  (select action = 'BLOCKED' and retry_after_seconds between 1 and 30
     from public.begin_revenuecat_provider_read('proj_b')),
  'with no catalog to fall back on, callers wait out the catalog backoff'
);
update public.revenuecat_provider_state
   set catalog = '[{"id":"entl_pro","lookup_key":"pro"}]'::jsonb,
       catalog_fetched_at = now() - interval '1 hour'
 where project_id = 'proj_b';
select ok(
  (select action = 'USE' and catalog is not null
     from public.begin_revenuecat_provider_read('proj_b')),
  'during a catalog backoff an older catalog stays usable'
);
update public.revenuecat_provider_state set catalog_retry_at = null where project_id = 'proj_b';
select ok(
  (select action = 'FETCH' and catalog is not null
     from public.begin_revenuecat_provider_read('proj_b')),
  'a stale catalog is refreshed by one lease holder, with the old copy as its fallback'
);
select ok(
  public.record_revenuecat_provider_failure('proj_b', 'CATALOG', null, 'PROVIDER_AUTH', null) = 60
  and (select action = 'BLOCKED' from public.begin_revenuecat_provider_read('proj_b')),
  'a rejected key blocks every read, growing the backoff'
);
select throws_ok(
  $$select public.record_revenuecat_provider_failure('proj_b', 'EVERYTHING', null, 'PROVIDER_AUTH', null)$$,
  '23514', null, 'a failure scope must be known'
);

-- ---------------------------------------------------------------------------
-- A webhook delivery that failed queues its users; health and schedule report
-- ---------------------------------------------------------------------------
select is(
  public.record_revenuecat_webhook_failure(
    array['ffffffff-ffff-ffff-ffff-ffffffffffff', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1']::uuid[]),
  1, 'a failed delivery queues every known user it named'
);
select ok(
  (select reason = 'WEBHOOK_FAILED' and requested_at > completed_at
     from public.revenuecat_reconciliations
    where user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
  'and leaves an observable pending request'
);
select throws_ok(
  $$select public.record_revenuecat_webhook_failure(array[]::uuid[])$$,
  '23514', null, 'a failure must name at least one user'
);
select ok(
  (select (h -> 'queue' ->> 'webhook_failures_pending')::int >= 1
          and (h -> 'queue' ->> 'pending')::int >= 1
          and jsonb_typeof(h -> 'provider') = 'array'
          and h -> 'schedule' ? 'installed'
     from (select public.revenuecat_billing_health() as h) health),
  'the health report exposes backlog, webhook failures, provider state, and the schedule'
);
select ok(
  public.ensure_revenuecat_reconcile_schedule()
    in ('INSTALLED', 'EXTENSIONS_UNAVAILABLE', 'VAULT_UNAVAILABLE', 'MISSING_VAULT_SECRETS'),
  'the schedule installer reports its outcome instead of failing'
);

-- ---------------------------------------------------------------------------
-- Sweep selection
-- ---------------------------------------------------------------------------
insert into public.revenuecat_reconciliations (user_id, reason)
  select distinct user_id, 'SWEEP' from public.subscriptions
on conflict (user_id) do nothing;
update public.revenuecat_reconciliations
   set completed_at = now(), requested_at = now() - interval '1 second', last_outcome = 'CONVERGED',
       lease_token = null, leased_until = null, claimed_at = null;
select is(
  public.enqueue_revenuecat_reconciliation_sweep(100),
  0, 'recently verified users are not swept'
);
update public.subscriptions
   set expires_at = now() + interval '10 minutes'
 where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2' and entitlement = 'pro';
update public.revenuecat_reconciliations
   set completed_at = now() - interval '2 hours', requested_at = now() - interval '3 hours'
 where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
select is(
  public.enqueue_revenuecat_reconciliation_sweep(100),
  1, 'the sweep queues the row approaching its paid boundary'
);
select ok(
  (select reason = 'SWEEP' and requested_at > completed_at
     from public.revenuecat_reconciliations
    where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'),
  'the sweep marks it pending'
);
select is(
  public.enqueue_revenuecat_reconciliation_sweep(100),
  0, 'an already pending user is not queued twice'
);

-- ---------------------------------------------------------------------------
-- Self-service refresh claim and account deletion
-- ---------------------------------------------------------------------------
select is(
  (select claim_status from public.claim_revenuecat_user_reconciliation(
     'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 60)),
  'CLAIMED', 'a user with no prior state gets an immediate lease'
);
select is(
  (select claim_status from public.claim_revenuecat_user_reconciliation(
     'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 60)),
  'IN_PROGRESS', 'a second refresh cannot take over the lease'
);
select ok(
  public.apply_revenuecat_snapshot(
    'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
    (select lease_token from public.revenuecat_reconciliations
      where user_id = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'),
    now() - interval '1 minute', 'SANDBOX', null, array[]::text[], '{}'::jsonb
  ) = 'UNVERIFIED',
  'a refresh for a customer RevenueCat does not know completes without changes'
);
select is(
  (select claim_status from public.claim_revenuecat_user_reconciliation(
     'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 60)),
  'RECENTLY_VERIFIED', 'refresh is rate limited to one snapshot a minute even without mirror rows'
);
select is(
  (select count(*)::int from public.claim_revenuecat_reconciliations(10, 60)
    where claimed_user_id = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'),
  0, 'a completed refresh leaves nothing pending for the cron worker'
);
delete from auth.users where id = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4';
select is(
  (select count(*)::int from public.revenuecat_reconciliations
    where user_id = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'),
  0, 'deleting an account removes its reconciliation state'
);

select * from finish();
rollback;
