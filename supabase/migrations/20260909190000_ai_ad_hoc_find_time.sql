-- Find Time from the free-text box schedules an ad-hoc block ("15-minute
-- meeting with Andrew") that has no backing task row. Such a request stores
-- the parsed title and duration instead of a task reference.
--
-- Availability itself is unchanged: the deterministic engine still produces
-- every candidate slot, and the model may still only rank them.

alter table public.ai_schedule_requests
  alter column task_id drop not null,
  add column ad_hoc_title text,
  add column ad_hoc_duration_minutes integer;

-- Exactly one target: an existing task, or an ad-hoc title plus duration.
alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_target_check check (
    (
      task_id is not null
      and ad_hoc_title is null
      and ad_hoc_duration_minutes is null
    )
    or (
      task_id is null
      and ad_hoc_title is not null
      and ad_hoc_duration_minutes is not null
    )
  );

-- Mirrors scheduleConstraintsSchema.durationMinutes (5 minutes to 12 hours).
alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_ad_hoc_duration_check check (
    ad_hoc_duration_minutes is null
    or (ad_hoc_duration_minutes >= 5 and ad_hoc_duration_minutes <= 720)
  );

alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_ad_hoc_title_check check (
    ad_hoc_title is null
    or (length(btrim(ad_hoc_title)) between 1 and 200)
  );

comment on column public.ai_schedule_requests.ad_hoc_title is
  'Untrusted user text for a task-less Find Time request. Ranking context only.';
comment on column public.ai_schedule_requests.ad_hoc_duration_minutes is
  'Duration parsed deterministically from the Find Time box, never by a model.';

-- The old three-argument signature is replaced rather than overloaded so a
-- three-argument task call keeps resolving to exactly one function.
drop function if exists public.claim_ai_schedule_request(uuid, uuid, integer);

-- Claiming the rate-limit slot and inserting the pending request happen under
-- one transaction-level advisory lock. Every valid claimed attempt consumes
-- quota, including no-slot and provider-failed requests.
create function public.claim_ai_schedule_request(
  p_user_id uuid,
  p_task_id uuid,
  p_limit integer default 10,
  p_ad_hoc_title text default null,
  p_ad_hoc_duration_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_request_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if (
    select count(*)
    from public.ai_schedule_requests
    where user_id = p_user_id
      and created_at >= now() - interval '60 minutes'
  ) >= v_limit then
    return null;
  end if;

  insert into public.ai_schedule_requests (
    user_id, task_id, status, ad_hoc_title, ad_hoc_duration_minutes
  )
  values (
    p_user_id,
    p_task_id,
    'pending',
    case when p_task_id is null then btrim(p_ad_hoc_title) end,
    case when p_task_id is null then p_ad_hoc_duration_minutes end
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.claim_ai_schedule_request(uuid, uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ai_schedule_request(uuid, uuid, integer, text, integer)
  to service_role;

comment on function public.claim_ai_schedule_request is
  'Atomically claims one server-side Find Time attempt for a user.';
