-- Natural language intent parsing for Find Time:
-- Raw user text ("meeting with Andrew lasting 15m", "deep work Saturday afternoon")
-- is interpreted server-side using Luna structured outputs.
--
-- This migration:
-- 1. Adds raw_text, ad_hoc_location, ad_hoc_description, and parsed_intent to ai_schedule_requests.
-- 2. Updates the target check constraint to allow raw text ad-hoc requests.
-- 3. Updates claim_ai_schedule_request to accept p_raw_text so rate limiting / quota
--    happens atomically BEFORE the intent model request occurs.
-- 4. Updates confirm_ai_schedule_suggestion to carry validated ad_hoc_location and
--    ad_hoc_description into the created internal event instead of writing nulls.

alter table public.ai_schedule_requests
  add column if not exists raw_text text,
  add column if not exists ad_hoc_location text,
  add column if not exists ad_hoc_description text,
  add column if not exists parsed_intent jsonb;

alter table public.ai_schedule_requests
  drop constraint if exists ai_schedule_requests_target_check;

alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_target_check check (
    (
      task_id is not null
      and ad_hoc_title is null
      and ad_hoc_duration_minutes is null
      and raw_text is null
    )
    or (
      task_id is null
      and (
        (ad_hoc_title is not null and ad_hoc_duration_minutes is not null)
        or raw_text is not null
      )
    )
  );

alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_raw_text_check check (
    raw_text is null
    or (length(btrim(raw_text)) between 1 and 500)
  );

alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_ad_hoc_location_check check (
    ad_hoc_location is null
    or (length(btrim(ad_hoc_location)) between 1 and 200)
  );

alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_ad_hoc_description_check check (
    ad_hoc_description is null
    or (length(btrim(ad_hoc_description)) between 1 and 500)
  );

comment on column public.ai_schedule_requests.raw_text is
  'Raw natural-language scheduling input entered by the user before server intent parsing.';
comment on column public.ai_schedule_requests.ad_hoc_location is
  'Location extracted from user natural language intent, carried through to confirmation.';
comment on column public.ai_schedule_requests.ad_hoc_description is
  'Description extracted from user natural language intent, carried through to confirmation.';
comment on column public.ai_schedule_requests.parsed_intent is
  'Full structured SchedulingIntent JSON produced by server intent parsing.';

-- Drop existing 5-argument claim function to avoid ambiguous overload resolution
drop function if exists public.claim_ai_schedule_request(uuid, uuid, integer, text, integer);

create or replace function public.claim_ai_schedule_request(
  p_user_id uuid,
  p_task_id uuid default null,
  p_limit integer default 10,
  p_ad_hoc_title text default null,
  p_ad_hoc_duration_minutes integer default null,
  p_raw_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_override_limit integer;
  v_limit integer;
  v_request_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Check if user has a server-side rate limit override (e.g. dev accounts)
  select rate_limit_per_hour
  into v_override_limit
  from public.ai_rate_limit_overrides
  where user_id = p_user_id;

  if v_override_limit is not null then
    v_limit := greatest(1, least(v_override_limit, 10000));
  else
    v_limit := greatest(1, least(coalesce(p_limit, 10), 100));
  end if;

  if (
    select count(*)
    from public.ai_schedule_requests
    where user_id = p_user_id
      and created_at >= now() - interval '60 minutes'
  ) >= v_limit then
    return null;
  end if;

  insert into public.ai_schedule_requests (
    user_id, task_id, status, ad_hoc_title, ad_hoc_duration_minutes, raw_text
  )
  values (
    p_user_id,
    p_task_id,
    'pending',
    case when p_task_id is null then btrim(p_ad_hoc_title) end,
    case when p_task_id is null then p_ad_hoc_duration_minutes end,
    case when p_task_id is null then btrim(p_raw_text) end
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.claim_ai_schedule_request(uuid, uuid, integer, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_ai_schedule_request(uuid, uuid, integer, text, integer, text)
  to service_role;

comment on function public.claim_ai_schedule_request is
  'Atomically claims one server-side Find Time attempt for a user, protecting the intent model before execution.';

-- Update confirmation function to carry ad_hoc_location and ad_hoc_description
create or replace function public.confirm_ai_schedule_suggestion(
  p_user_id uuid,
  p_suggestion_id uuid
)
returns table(status text, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ai_schedule_requests%rowtype;
  v_suggestion public.ai_schedule_suggestions%rowtype;
  v_task public.tasks%rowtype;
  v_profile public.profiles%rowtype;
  v_calendar public.calendars%rowtype;
  v_event_id uuid;
  v_buffer_minutes integer;
  v_title text;
  v_description text;
  v_location text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select r.*
    into v_request
    from public.ai_schedule_requests r
    join public.ai_schedule_suggestions s on s.request_id = r.id
   where s.id = p_suggestion_id
     and r.user_id = p_user_id
   for update of r;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select s.*
    into v_suggestion
    from public.ai_schedule_suggestions s
   where s.id = p_suggestion_id
   for update;

  if v_request.status = 'accepted' then
    if v_request.accepted_event_id is null or v_suggestion.accepted_at is null then
      return query select 'stale'::text, null::uuid;
      return;
    end if;

    if not exists (
      select 1 from public.events e
       where e.id = v_request.accepted_event_id and e.user_id = p_user_id
    ) then
      return query select 'stale'::text, null::uuid;
      return;
    end if;

    return query select 'accepted'::text, v_request.accepted_event_id;
    return;
  end if;

  if v_request.status <> 'proposed' or v_suggestion.accepted_at is not null then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  -- Defense-in-depth: if the suggestion start time has already passed before the
  -- confirmation transaction executes, reject it as stale.
  if v_suggestion.start_at <= now() then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  if v_request.task_id is not null then
    select t.* into v_task
      from public.tasks t
     where t.id = v_request.task_id and t.user_id = p_user_id
     for update;
    if not found then
      return query select 'stale'::text, null::uuid;
      return;
    end if;
    if v_task.status <> 'open'
       or not v_task.is_flexible
       or v_task.scheduled_event_id is not null
       or v_request.task_version is null
       or v_task.updated_at <> v_request.task_version then
      return query select 'stale'::text, null::uuid;
      return;
    end if;
    v_title := v_task.title;
    v_description := v_task.description;
    v_location := null;
  else
    -- An ad-hoc request carries its own title and never versions a task row.
    if v_request.ad_hoc_title is null or v_request.task_version is not null then
      return query select 'stale'::text, null::uuid;
      return;
    end if;
    v_title := v_request.ad_hoc_title;
    v_description := v_request.ad_hoc_description;
    v_location := v_request.ad_hoc_location;
  end if;

  select p.* into v_profile
    from public.profiles p where p.id = p_user_id for update;
  if not found
     or v_request.profile_version is null
     or v_profile.updated_at <> v_request.profile_version then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  select c.* into v_calendar
    from public.calendars c
   where c.id = v_request.target_calendar_id and c.user_id = p_user_id
   for update;
  if not found
     or v_request.target_calendar_id is null
     or v_request.target_calendar_version is null
     or v_calendar.source_type <> 'internal'
     or not v_calendar.is_default
     or v_calendar.is_read_only
     or v_calendar.updated_at <> v_request.target_calendar_version then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  v_buffer_minutes := coalesce((v_request.constraints ->> 'bufferMinutes')::integer, 0);
  if v_buffer_minutes < 0 or v_buffer_minutes > 120 then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  if public.ai_event_conflicts_interval(
    p_user_id,
    v_suggestion.start_at,
    v_suggestion.end_at,
    v_buffer_minutes
  ) then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  insert into public.events (
    user_id, calendar_id, title, description, location, start_at, end_at,
    all_day, timezone, status, recurrence_rule, alerts, source_type,
    provider_account_id, provider_event_id, provider_etag, provider_updated_at,
    sync_status
  )
  values (
    p_user_id, v_calendar.id, v_title, v_description, v_location,
    v_suggestion.start_at, v_suggestion.end_at, false, v_profile.timezone,
    'confirmed', null, '{}'::integer[], 'internal', null, null, null, null,
    'synced'
  )
  returning id into v_event_id;

  -- Only a task-backed request links the new event to a task.
  if v_request.task_id is not null then
    update public.tasks
       set status = 'scheduled', scheduled_event_id = v_event_id
     where public.tasks.id = v_task.id and public.tasks.user_id = p_user_id
       and public.tasks.status = 'open'
       and public.tasks.is_flexible and public.tasks.scheduled_event_id is null;
    if not found then
      raise exception using errcode = 'P0001', message = 'confirmation task update failed';
    end if;
  end if;

  update public.ai_schedule_suggestions
     set accepted_at = now()
   where id = v_suggestion.id and accepted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'confirmation suggestion update failed';
  end if;

  update public.ai_schedule_requests as request_row
     set status = 'accepted', accepted_event_id = v_event_id,
         completed_at = coalesce(completed_at, now()), error_code = null
   where request_row.id = v_request.id and request_row.user_id = p_user_id
     and request_row.status = 'proposed';
  if not found then
    raise exception using errcode = 'P0001', message = 'confirmation request update failed';
  end if;

  return query select 'accepted'::text, v_event_id;
end;
$$;

comment on function public.confirm_ai_schedule_suggestion is
  'Atomically confirms one Find Time suggestion, preserving validated location and description.';
