-- ============================================================================
-- Server-side AI rate limit overrides.
-- Allows specific accounts (e.g. dev accounts) to have a custom hourly limit
-- (e.g. 1000/hour) while normal users remain at the default 10/hour.
-- ============================================================================

create table public.ai_rate_limit_overrides (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rate_limit_per_hour integer not null check (rate_limit_per_hour > 0 and rate_limit_per_hour <= 10000),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-only table: RLS enabled, no policies for authenticated/anon.
alter table public.ai_rate_limit_overrides enable row level security;

revoke all on table public.ai_rate_limit_overrides from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_rate_limit_overrides to service_role;

create trigger ai_rate_limit_overrides_set_updated_at
  before update on public.ai_rate_limit_overrides
  for each row execute function public.set_updated_at();

comment on table public.ai_rate_limit_overrides is
  'Server-only rate-limit overrides for AI scheduling requests (e.g. dev accounts).';

-- Update claim_ai_schedule_request to respect server-side rate-limit overrides
create or replace function public.claim_ai_schedule_request(
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
  'Atomically claims one server-side Find Time attempt for a user, respecting rate limit overrides.';
