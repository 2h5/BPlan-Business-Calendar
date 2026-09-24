-- ============================================================================
-- RevenueCat convergence: terminal event outcomes, environment audit,
-- duplicate evidence, and an authoritative reconciliation path.
--
-- Webhooks are hints. RevenueCat retries a non-200 delivery five times and then
-- stops, does not guarantee ordering, and sends some event types (TRANSFER,
-- PURCHASE_REDEEMED, TEMPORARY_ENTITLEMENT_GRANT) without the entitlement and
-- expiry fields a mirror write needs. This migration therefore:
--
--   1. Replaces process_revenuecat_event. An App User ID that names no row in
--      auth.users (a deleted account, or another environment's user) is now a
--      terminal, audited IGNORED outcome instead of a foreign-key failure that
--      asks RevenueCat to retry. Events that cannot be applied from their own
--      payload queue an authoritative reconciliation instead of guessing.
--   2. Records the event environment, the provider App User ID, and how many
--      duplicate deliveries each event received, so duplicate delivery is
--      observable evidence rather than an unrecorded return value.
--   3. Adds per-user reconciliation state with lease fencing and an atomic
--      snapshot writer. The revenuecat-reconcile Edge Function reads
--      RevenueCat customer state and applies it through the same ordering
--      guard the webhook uses.
-- ============================================================================

alter table public.subscription_events
  add column source text not null default 'webhook',
  add column environment text,
  add column app_user_id text,
  add column duplicate_deliveries integer not null default 0,
  add constraint subscription_events_source_check
    check (source in ('webhook', 'reconciliation')),
  add constraint subscription_events_environment_check
    check (environment is null or environment in ('SANDBOX', 'PRODUCTION')),
  add constraint subscription_events_duplicate_deliveries_check
    check (duplicate_deliveries >= 0);

comment on column public.subscription_events.source is
  'webhook for a RevenueCat delivery; reconciliation for a mirror repair made from RevenueCat customer state.';
comment on column public.subscription_events.environment is
  'RevenueCat environment named by the event (webhook) or enforced by the reconciler.';
comment on column public.subscription_events.app_user_id is
  'Provider App User ID the event named. Kept when it cannot be attributed to an auth user.';
comment on column public.subscription_events.duplicate_deliveries is
  'Redeliveries of this event ID acknowledged as DUPLICATE without reprocessing.';
comment on column public.subscription_events.payload is
  'The delivered event with subscriber_attributes removed, or a reconciliation summary. Server-only.';

-- ---------------------------------------------------------------------------
-- Per-user reconciliation state. A row persists after its first request; it is
-- pending while its latest request is newer than its last completed snapshot.
-- A lease fences concurrent workers, so a slow or crashed worker cannot apply
-- a snapshot after another worker has taken over the same user.
-- ---------------------------------------------------------------------------
create table public.revenuecat_reconciliations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null,
  requested_at timestamptz not null default clock_timestamp(),
  not_before timestamptz not null default now(),
  attempts integer not null default 0,
  lease_token uuid,
  leased_until timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_outcome text,
  last_error text,

  constraint revenuecat_reconciliations_reason_check
    check (reason ~ '^[A-Z_]{1,64}$'),
  constraint revenuecat_reconciliations_error_check
    check (last_error is null or last_error ~ '^[A-Z_]{1,64}$'),
  constraint revenuecat_reconciliations_outcome_check
    check (last_outcome is null or last_outcome in ('REPAIRED', 'CONVERGED', 'STALE', 'UNVERIFIED')),
  constraint revenuecat_reconciliations_lease_check
    check ((lease_token is null) = (leased_until is null)
       and (lease_token is null) = (claimed_at is null)),
  constraint revenuecat_reconciliations_attempts_check
    check (attempts >= 0)
);

create index revenuecat_reconciliations_pending_idx
  on public.revenuecat_reconciliations (not_before)
  where completed_at is null or requested_at > completed_at;

alter table public.revenuecat_reconciliations enable row level security;
-- Deliberately no policies: server-only. Default privileges are revoked so the
-- table does not rely on RLS alone; service_role may only inspect it, and every
-- write goes through the security-definer functions below.
revoke all on table public.revenuecat_reconciliations from public, anon, authenticated, service_role;
grant select on table public.revenuecat_reconciliations to service_role;

comment on table public.revenuecat_reconciliations is
  'Per-user RevenueCat reconciliation requests, leases, and last outcome. Server-only.';

-- Internal. Returns false when the user no longer exists, so a hint about a
-- deleted account is dropped instead of failing the caller's transaction.
create function public.enqueue_revenuecat_reconciliation(
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.revenuecat_reconciliations as r (user_id, reason)
  values (p_user_id, p_reason)
  on conflict (user_id) do update
    set reason = excluded.reason,
        requested_at = clock_timestamp(),
        not_before = now();
  return true;
exception when foreign_key_violation then
  return false;
end;
$$;

revoke execute on function public.enqueue_revenuecat_reconciliation(uuid, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The webhook's single database call.
--
-- p_decision:
--   apply     — the payload carries a user, entitlements, status and expiry.
--   reconcile — the payload names users but not their resulting access
--               (TRANSFER, PURCHASE_REDEEMED, ...). Queue each known user.
--   ignore    — nothing to do; record why.
--
-- Outcomes: APPLIED, STALE, DEFERRED, IGNORED, DUPLICATE.
-- ---------------------------------------------------------------------------
drop function public.process_revenuecat_event(
  text, uuid, text, timestamptz, text, timestamptz, text, text[], uuid[], text, jsonb
);

create function public.process_revenuecat_event(
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_environment text,
  p_decision text,
  p_app_user_id text,
  p_user_id uuid,
  p_status text,
  p_expires_at timestamptz,
  p_customer_id text,
  p_entitlements text[],
  p_reconcile_user_ids uuid[],
  p_skipped_reason text,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed text;
  v_entitlement text;
  v_changed boolean;
  v_applied boolean := false;
  v_participant uuid;
  v_queued integer := 0;
begin
  if p_decision is null or p_decision not in ('apply', 'reconcile', 'ignore')
     or (p_environment is not null and p_environment not in ('SANDBOX', 'PRODUCTION')) then
    raise exception 'Invalid RevenueCat event decision' using errcode = '23514';
  end if;

  insert into public.subscription_events
    (event_id, user_id, app_user_id, event_type, event_at, environment, source,
     applied, skipped_reason, payload)
  values
    (p_event_id, null, p_app_user_id, p_event_type, p_event_at, p_environment, 'webhook',
     false, 'PROCESSING', p_payload)
  on conflict (event_id) do nothing
  returning event_id into v_claimed;

  if v_claimed is null then
    -- The first delivery owns the outcome. A concurrent duplicate waited on
    -- the unique key above; this only counts it.
    update public.subscription_events
       set duplicate_deliveries = duplicate_deliveries + 1
     where event_id = p_event_id;
    return 'DUPLICATE';
  end if;

  if p_decision = 'ignore' then
    if p_skipped_reason is null or p_user_id is not null
       or coalesce(cardinality(p_entitlements), 0) <> 0
       or coalesce(cardinality(p_reconcile_user_ids), 0) <> 0 then
      raise exception 'Invalid ignored RevenueCat event' using errcode = '23514';
    end if;
    update public.subscription_events
       set skipped_reason = p_skipped_reason
     where event_id = p_event_id;
    return 'IGNORED';
  end if;

  if p_skipped_reason is not null then
    raise exception 'Only ignored RevenueCat events carry a skip reason' using errcode = '23514';
  end if;

  if p_decision = 'reconcile' then
    if coalesce(cardinality(p_reconcile_user_ids), 0) = 0
       or coalesce(cardinality(p_entitlements), 0) <> 0
       or (p_user_id is not null and not (p_user_id = any (p_reconcile_user_ids))) then
      raise exception 'Invalid RevenueCat reconciliation hint' using errcode = '23514';
    end if;

    foreach v_participant in array p_reconcile_user_ids loop
      if public.enqueue_revenuecat_reconciliation(v_participant, p_event_type) then
        v_queued := v_queued + 1;
      end if;
    end loop;

    if p_user_id is not null then
      begin
        update public.subscription_events set user_id = p_user_id where event_id = p_event_id;
      exception when foreign_key_violation then
        null; -- The primary subject is gone; the ledger keeps app_user_id.
      end;
    end if;

    update public.subscription_events
       set skipped_reason = case when v_queued > 0
                                 then 'RECONCILIATION_QUEUED' else 'UNKNOWN_APP_USER' end
     where event_id = p_event_id;
    return case when v_queued > 0 then 'DEFERRED' else 'IGNORED' end;
  end if;

  -- apply
  if p_user_id is null or p_environment is null
     or p_status is null or p_status not in ('active', 'expired')
     or coalesce(cardinality(p_entitlements), 0) = 0
     or coalesce(cardinality(p_reconcile_user_ids), 0) <> 0
     or exists (select 1 from unnest(p_entitlements) as e(value)
                where e.value is null or e.value = '') then
    raise exception 'Invalid RevenueCat mirror decision' using errcode = '23514';
  end if;

  -- The foreign key is the existence check. Its KEY SHARE lock also holds off
  -- a concurrent account deletion until this transaction commits.
  begin
    update public.subscription_events set user_id = p_user_id where event_id = p_event_id;
  exception when foreign_key_violation then
    update public.subscription_events
       set skipped_reason = 'UNKNOWN_APP_USER'
     where event_id = p_event_id;
    return 'IGNORED';
  end;

  foreach v_entitlement in array p_entitlements loop
    v_changed := public.apply_revenuecat_event(
      p_user_id, v_entitlement, p_status, p_expires_at, p_event_at, p_customer_id
    );
    v_applied := v_applied or v_changed;
  end loop;

  update public.subscription_events
     set applied = v_applied,
         skipped_reason = case when v_applied then null else 'STALE_EVENT' end
   where event_id = p_event_id;

  return case when v_applied then 'APPLIED' else 'STALE' end;
end;
$$;

comment on function public.process_revenuecat_event is
  'Service-role RevenueCat webhook boundary: event dedupe, ordered mirror update or reconciliation hint, and final ledger outcome commit together.';

revoke execute on function public.process_revenuecat_event(
  text, text, timestamptz, text, text, text, uuid, text, timestamptz, text, text[], uuid[], text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_revenuecat_event(
  text, text, timestamptz, text, text, text, uuid, text, timestamptz, text, text[], uuid[], text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Reconciler worker surface (service_role only).
-- ---------------------------------------------------------------------------
create function public.claim_revenuecat_reconciliations(
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  claimed_user_id uuid,
  claimed_lease_token uuid,
  claimed_attempts integer,
  claimed_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100
     or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid reconciliation claim' using errcode = '23514';
  end if;

  return query
  with candidates as (
    select r.user_id
      from public.revenuecat_reconciliations r
     where (r.completed_at is null or r.requested_at > r.completed_at)
       and r.not_before <= now()
       and (r.leased_until is null or r.leased_until <= now())
     order by r.not_before, r.user_id
     limit p_limit
     for update skip locked
  )
  update public.revenuecat_reconciliations r
     set lease_token = pg_catalog.gen_random_uuid(),
         leased_until = now() + make_interval(secs => p_lease_seconds),
         claimed_at = clock_timestamp(),
         attempts = r.attempts + 1
    from candidates c
   where r.user_id = c.user_id
  returning r.user_id, r.lease_token, r.attempts, r.reason;
end;
$$;

-- The refresh function's claim for one signed-in user. The caller has already
-- verified the user's JWT; this only rate-limits and leases.
--   CLAIMED            lease granted; read RevenueCat and apply a snapshot
--   IN_PROGRESS        another worker holds the lease
--   RECENTLY_VERIFIED  a snapshot completed within the last minute
create function public.claim_revenuecat_user_reconciliation(
  p_user_id uuid,
  p_lease_seconds integer
)
returns table (claim_status text, claimed_lease_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.revenuecat_reconciliations;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid reconciliation claim' using errcode = '23514';
  end if;

  insert into public.revenuecat_reconciliations (user_id, reason, requested_at, completed_at)
  values (p_user_id, 'USER_REQUEST', v_now, v_now)
  on conflict (user_id) do nothing;

  select * into v_row from public.revenuecat_reconciliations r
   where r.user_id = p_user_id for update;

  if v_row.leased_until is not null and v_row.leased_until > now() then
    return query select 'IN_PROGRESS'::text, null::uuid;
    return;
  end if;

  -- A fresh row was created with completed_at = requested_at so it is not
  -- pending for the sweep worker; it is leased immediately below.
  if v_row.completed_at is not null and v_row.completed_at > v_now - interval '1 minute'
     and v_row.last_outcome is not null
     and v_row.requested_at <= v_row.completed_at then
    return query select 'RECENTLY_VERIFIED'::text, null::uuid;
    return;
  end if;

  update public.revenuecat_reconciliations r
     set reason = 'USER_REQUEST',
         requested_at = v_now,
         not_before = now(),
         lease_token = pg_catalog.gen_random_uuid(),
         leased_until = now() + make_interval(secs => p_lease_seconds),
         claimed_at = v_now,
         attempts = r.attempts + 1
   where r.user_id = p_user_id
  returning 'CLAIMED'::text, r.lease_token into claim_status, claimed_lease_token;
  return next;
end;
$$;

-- A failed attempt keeps the request and backs off. Only the current lease
-- holder can release it.
create function public.release_revenuecat_reconciliation(
  p_user_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error_code is null or p_error_code !~ '^[A-Z_]{1,64}$'
     or (p_retry_after_seconds is not null and p_retry_after_seconds not between 0 and 86400) then
    raise exception 'Invalid reconciliation release' using errcode = '23514';
  end if;

  update public.revenuecat_reconciliations r
     set lease_token = null,
         leased_until = null,
         claimed_at = null,
         last_error = p_error_code,
         -- Keep the request pending even if the row was created already
         -- "complete" by a user claim.
         requested_at = greatest(r.requested_at, coalesce(r.completed_at, r.requested_at) + interval '1 microsecond'),
         not_before = now() + make_interval(secs => greatest(
           coalesce(p_retry_after_seconds, 0),
           least(21600, 60 * power(2, least(r.attempts, 10))::integer)
         ))
   where r.user_id = p_user_id
     and r.lease_token = p_lease_token;
  return found;
end;
$$;

-- Apply one RevenueCat customer snapshot atomically.
--
-- p_active lists entitlements RevenueCat currently grants from a source in the
-- enforced environment: [{"entitlement": "pro", "expires_at": "..." | null}].
-- p_unverifiable lists entitlements whose state could not be attributed to the
-- enforced environment; their mirror rows are left untouched. Every other
-- currently entitled mirror row is revoked, because RevenueCat positively
-- returned the customer without it.
-- p_active null means RevenueCat has no record of the customer: the request
-- completes as UNVERIFIED and no mirror row changes.
--
-- Each change uses apply_revenuecat_event, so a webhook event newer than the
-- snapshot always wins and a snapshot never regresses newer state.
create function public.apply_revenuecat_snapshot(
  p_user_id uuid,
  p_lease_token uuid,
  p_snapshot_at timestamptz,
  p_environment text,
  p_active jsonb,
  p_unverifiable text[],
  p_summary jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.revenuecat_reconciliations;
  v_item jsonb;
  v_entitlement text;
  v_expires timestamptz;
  v_row public.subscriptions;
  v_seen text[] := array[]::text[];
  v_keep text[];
  v_changed boolean;
  v_applied boolean := false;
  v_attempted boolean := false;
  v_outcome text;
begin
  if p_user_id is null or p_lease_token is null or p_snapshot_at is null
     or p_snapshot_at > now() + interval '5 minutes'
     or p_environment is null or p_environment not in ('SANDBOX', 'PRODUCTION')
     or (p_active is not null and jsonb_typeof(p_active) <> 'array')
     or exists (select 1 from unnest(coalesce(p_unverifiable, array[]::text[])) as u(value)
                where u.value is null or u.value = '') then
    raise exception 'Invalid RevenueCat snapshot' using errcode = '23514';
  end if;

  select * into v_state
    from public.revenuecat_reconciliations r
   where r.user_id = p_user_id
     and r.lease_token = p_lease_token
     and r.leased_until > now()
   for update;
  if not found then
    return 'LEASE_LOST';
  end if;

  -- RevenueCat has no customer record. That cannot prove either access or its
  -- absence (a free user, or a misconfigured project), so nothing changes.
  if p_active is null then
    v_outcome := 'UNVERIFIED';
  else
    for v_item in select value from jsonb_array_elements(p_active) loop
      v_entitlement := v_item ->> 'entitlement';
      if jsonb_typeof(v_item) <> 'object' or v_entitlement is null or v_entitlement = ''
         or v_entitlement = any (v_seen)
         or v_entitlement = any (coalesce(p_unverifiable, array[]::text[]))
         or not (v_item ? 'expires_at') then
        raise exception 'Invalid RevenueCat snapshot grant' using errcode = '23514';
      end if;
      v_expires := (v_item ->> 'expires_at')::timestamptz;
      if v_expires is not null and v_expires <= p_snapshot_at then
        raise exception 'A snapshot grant must be current' using errcode = '23514';
      end if;
      v_seen := v_seen || v_entitlement;

      select * into v_row
        from public.subscriptions s
       where s.user_id = p_user_id and s.entitlement = v_entitlement;
      if found and v_row.status = 'active' and v_row.expires_at is not distinct from v_expires then
        continue;
      end if;

      v_attempted := true;
      v_changed := public.apply_revenuecat_event(
        p_user_id, v_entitlement, 'active', v_expires, p_snapshot_at, null
      );
      v_applied := v_applied or v_changed;
    end loop;

    v_keep := v_seen || coalesce(p_unverifiable, array[]::text[]);
    for v_row in
      select * from public.subscriptions s
       where s.user_id = p_user_id
         and not (s.entitlement = any (v_keep))
         and s.status = 'active'
         and (s.expires_at is null or s.expires_at > p_snapshot_at)
    loop
      v_attempted := true;
      v_changed := public.apply_revenuecat_event(
        p_user_id, v_row.entitlement, 'expired', p_snapshot_at, p_snapshot_at, null
      );
      v_applied := v_applied or v_changed;
    end loop;
  end if;

  if v_applied then
    insert into public.subscription_events
      (event_id, user_id, app_user_id, event_type, event_at, environment, source,
       applied, skipped_reason, payload)
    values
      ('reconciliation:' || pg_catalog.gen_random_uuid()::text, p_user_id, p_user_id::text,
       'RECONCILIATION', p_snapshot_at, p_environment, 'reconciliation',
       true, null, coalesce(p_summary, '{}'::jsonb));
  end if;

  v_outcome := coalesce(v_outcome,
    case when v_applied then 'REPAIRED' when v_attempted then 'STALE' else 'CONVERGED' end);

  -- completed_at is the claim time: a hint that arrived while this snapshot
  -- was being read has a later requested_at and stays pending.
  update public.revenuecat_reconciliations r
     set completed_at = v_state.claimed_at,
         last_outcome = v_outcome,
         last_error = null,
         attempts = 0,
         not_before = now(),
         lease_token = null,
         leased_until = null,
         claimed_at = null
   where r.user_id = p_user_id;

  return v_outcome;
end;
$$;

comment on function public.apply_revenuecat_snapshot is
  'Service-role reconciler boundary: lease-fenced, order-guarded mirror repair from RevenueCat customer state.';

-- Queue users whose mirror is most likely to be wrong when a webhook was lost.
create function public.enqueue_revenuecat_reconciliation_sweep(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Invalid reconciliation sweep' using errcode = '23514';
  end if;

  insert into public.revenuecat_reconciliations as r (user_id, reason)
  select c.user_id, 'SWEEP'
    from (
      select distinct s.user_id
        from public.subscriptions s
        left join public.revenuecat_reconciliations existing on existing.user_id = s.user_id
       where s.provider = 'revenuecat'
         and (existing.user_id is null
              or (existing.completed_at is not null and existing.requested_at <= existing.completed_at))
         and (
           -- At or past a paid boundary while still marked active: a lost
           -- RENEWAL (paying user about to lose access) or lost EXPIRATION.
           (s.status = 'active'
             and s.expires_at is not null
             and s.expires_at <= now() + interval '1 hour'
             and s.expires_at > now() - interval '3 days'
             and coalesce(existing.completed_at, '-infinity'::timestamptz) < now() - interval '30 minutes')
           -- Every entitled row once a day: a lost refund or revocation.
           or (s.status = 'active'
             and coalesce(existing.completed_at, '-infinity'::timestamptz) < now() - interval '24 hours')
           -- Once after an expiry: a lost resubscription.
           or (s.status <> 'active'
             and s.expires_at > now() - interval '3 days'
             and coalesce(existing.completed_at, '-infinity'::timestamptz) < s.expires_at)
         )
       limit p_limit
    ) c
  on conflict (user_id) do update
    set reason = 'SWEEP', requested_at = clock_timestamp(), not_before = now()
    where r.completed_at is not null and r.requested_at <= r.completed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.claim_revenuecat_reconciliations(integer, integer)
  from public, anon, authenticated;
revoke execute on function public.claim_revenuecat_user_reconciliation(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.release_revenuecat_reconciliation(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke execute on function public.apply_revenuecat_snapshot(uuid, uuid, timestamptz, text, jsonb, text[], jsonb)
  from public, anon, authenticated;
revoke execute on function public.enqueue_revenuecat_reconciliation_sweep(integer)
  from public, anon, authenticated;
grant execute on function public.claim_revenuecat_reconciliations(integer, integer) to service_role;
grant execute on function public.claim_revenuecat_user_reconciliation(uuid, integer) to service_role;
grant execute on function public.release_revenuecat_reconciliation(uuid, uuid, text, integer) to service_role;
grant execute on function public.apply_revenuecat_snapshot(uuid, uuid, timestamptz, text, jsonb, text[], jsonb) to service_role;
grant execute on function public.enqueue_revenuecat_reconciliation_sweep(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Schedule. Guarded exactly like 0007: local stacks without pg_cron/pg_net or
-- without the function URL and secret settings skip it and say so.
-- ---------------------------------------------------------------------------
do $$
declare
  v_base_url text := current_setting('app.settings.functions_url', true);
  v_secret   text := current_setting('app.settings.billing_reconcile_cron_secret', true);
begin
  if to_regproc('cron.schedule') is null or to_regproc('net.http_post') is null then
    raise notice 'pg_cron/pg_net unavailable; skipping RevenueCat reconciliation schedule.';
    return;
  end if;

  if v_base_url is null or v_secret is null then
    raise notice 'app.settings.functions_url / billing_reconcile_cron_secret unset; skipping RevenueCat reconciliation schedule.';
    return;
  end if;

  perform cron.schedule(
    'revenuecat-reconcile',
    '*/5 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Billing-Cron-Secret',%L),
        body := '{}'::jsonb
      )$cmd$,
      v_base_url || '/revenuecat-reconcile', v_secret
    )
  );

  raise notice 'RevenueCat reconciliation schedule installed.';
end;
$$;
