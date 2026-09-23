-- One transaction owns a RevenueCat event ID, its mirror changes, and its
-- final ledger outcome. The primary key makes a concurrent duplicate wait for
-- the winning transaction, including when that transaction rolls back.
create function public.process_revenuecat_event(
  p_event_id text,
  p_user_id uuid,
  p_event_type text,
  p_event_at timestamptz,
  p_status text,
  p_expires_at timestamptz,
  p_customer_id text,
  p_entitlements text[],
  p_revoke_from uuid[],
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
  v_previous_owner uuid;
  v_changed boolean;
  v_applied boolean := false;
begin
  insert into public.subscription_events
    (event_id, user_id, event_type, event_at, applied, skipped_reason, payload)
  values
    (p_event_id, p_user_id, p_event_type, p_event_at, false, 'PROCESSING', p_payload)
  on conflict (event_id) do nothing
  returning event_id into v_claimed;

  if v_claimed is null then
    return 'DUPLICATE';
  end if;

  if p_skipped_reason is not null then
    if p_user_id is not null or cardinality(p_entitlements) <> 0
       or cardinality(p_revoke_from) <> 0 then
      raise exception 'Invalid ignored RevenueCat event' using errcode = '23514';
    end if;

    update public.subscription_events
       set skipped_reason = p_skipped_reason
     where event_id = p_event_id;
    return 'IGNORED';
  end if;

  if p_user_id is null or p_status not in ('active', 'expired', 'paused')
     or p_status is null or coalesce(cardinality(p_entitlements), 0) = 0
     or exists (select 1 from unnest(p_entitlements) as e(value)
                where e.value is null or e.value = '') then
    raise exception 'Invalid RevenueCat mirror decision' using errcode = '23514';
  end if;

  foreach v_entitlement in array p_entitlements loop
    v_changed := public.apply_revenuecat_event(
      p_user_id, v_entitlement, p_status, p_expires_at, p_event_at, p_customer_id
    );
    v_applied := v_applied or v_changed;

    -- A transfer can change both owners. Every mirror decision is part of the
    -- same transaction and contributes to the ledger's applied result.
    foreach v_previous_owner in array coalesce(p_revoke_from, array[]::uuid[]) loop
      v_changed := public.apply_revenuecat_event(
        v_previous_owner, v_entitlement, 'expired', p_event_at, p_event_at, null
      );
      v_applied := v_applied or v_changed;
    end loop;
  end loop;

  update public.subscription_events
     set applied = v_applied,
         skipped_reason = case when v_applied then null else 'STALE_EVENT' end
   where event_id = p_event_id;

  return case when v_applied then 'APPLIED' else 'STALE' end;
end;
$$;

comment on function public.process_revenuecat_event is
  'Service-role RevenueCat boundary: event dedupe, ordered mirror update, and final ledger outcome commit together.';

revoke execute on function public.process_revenuecat_event(
  text, uuid, text, timestamptz, text, timestamptz, text, text[], uuid[], text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_revenuecat_event(
  text, uuid, text, timestamptz, text, timestamptz, text, text[], uuid[], text, jsonb
) to service_role;

-- The webhook no longer needs either half of the old split write surface.
revoke execute on function public.apply_revenuecat_event(
  uuid, text, text, timestamptz, timestamptz, text
) from service_role;
revoke insert on table public.subscription_events from service_role;
