-- ============================================================================
-- Confirmation of ad-hoc Find Time suggestions (no backing task).
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(14);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '91111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'adhoc-valid@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '92222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'adhoc-occupied@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '93333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'adhoc-tainted@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '94444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'adhoc-past@example.com', now(), now());

-- Ad-hoc requests carry their own title and duration and reference no task.
insert into public.ai_schedule_requests (
  id, user_id, task_id, status, constraints, target_calendar_id,
  task_version, profile_version, target_calendar_version, candidate_count,
  ad_hoc_title, ad_hoc_duration_minutes
)
select fixtures.request_id,
       fixtures.user_id,
       null,
       'proposed',
       '{}'::jsonb,
       c.id,
       fixtures.task_version,
       p.updated_at,
       c.updated_at,
       1,
       'Meeting with Andrew',
       15
  from (
    values
      ('c1111111-1111-1111-1111-111111111111'::uuid,
       '91111111-1111-1111-1111-111111111111'::uuid, null::timestamptz),
      ('c2222222-2222-2222-2222-222222222222'::uuid,
       '92222222-2222-2222-2222-222222222222'::uuid, null::timestamptz),
      -- A task_version on a task-less request means the row is inconsistent.
      ('c3333333-3333-3333-3333-333333333333'::uuid,
       '93333333-3333-3333-3333-333333333333'::uuid, now()),
      ('c4444444-4444-4444-4444-444444444444'::uuid,
       '94444444-4444-4444-4444-444444444444'::uuid, null::timestamptz)
  ) as fixtures(request_id, user_id, task_version)
  join public.profiles p on p.id = fixtures.user_id
  join public.calendars c on c.user_id = fixtures.user_id and c.is_default;

insert into public.ai_schedule_suggestions (
  id, request_id, slot_id, start_at, end_at, score, reason, rank
)
values
  ('d1111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 'adhoc-valid',
   '2099-03-10T14:00:00Z', '2099-03-10T14:15:00Z', 0.95, 'Right after lunch.', 1),
  ('d2222222-2222-2222-2222-222222222222',
   'c2222222-2222-2222-2222-222222222222', 'adhoc-occupied',
   '2099-03-11T14:00:00Z', '2099-03-11T14:15:00Z', 0.95, 'Occupied.', 1),
  ('d3333333-3333-3333-3333-333333333333',
   'c3333333-3333-3333-3333-333333333333', 'adhoc-tainted',
   '2099-03-12T14:00:00Z', '2099-03-12T14:15:00Z', 0.95, 'Tainted.', 1),
  ('d4444444-4444-4444-4444-444444444444',
   'c4444444-4444-4444-4444-444444444444', 'adhoc-past',
   '2000-01-01T14:00:00Z', '2000-01-01T14:15:00Z', 0.95, 'Already past.', 1);

-- ---------------------------------------------------------------------------
-- A valid ad-hoc confirmation creates the event and links no task.
-- ---------------------------------------------------------------------------

select is(
  (select status from public.confirm_ai_schedule_suggestion(
     '91111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111')),
  'accepted',
  'a valid ad-hoc suggestion is accepted'
);

select is(
  (select e.title from public.events e
    where e.user_id = '91111111-1111-1111-1111-111111111111'),
  'Meeting with Andrew',
  'the event title comes from the ad-hoc title'
);

select is(
  (select count(*)::int from public.events e
    where e.user_id = '91111111-1111-1111-1111-111111111111'
      and e.start_at = '2099-03-10T14:00:00Z'
      and e.end_at = '2099-03-10T14:15:00Z'
      and e.source_type = 'internal'
      and not e.all_day),
  1,
  'the ad-hoc event is created on the confirmed internal slot'
);

select is(
  (select count(*)::int from public.tasks t
    where t.user_id = '91111111-1111-1111-1111-111111111111'),
  0,
  'confirming an ad-hoc block creates no task'
);

select is(
  (select count(*)::int from public.tasks t
    where t.scheduled_event_id in (
      select id from public.events where user_id = '91111111-1111-1111-1111-111111111111')),
  0,
  'no task is linked to the ad-hoc event'
);

select is(
  (select r.status::text from public.ai_schedule_requests r
    where r.id = 'c1111111-1111-1111-1111-111111111111'),
  'accepted',
  'the ad-hoc request is marked accepted'
);

select isnt(
  (select r.accepted_event_id from public.ai_schedule_requests r
    where r.id = 'c1111111-1111-1111-1111-111111111111'),
  null,
  'the ad-hoc request stores the canonical event id'
);

select isnt(
  (select s.accepted_at from public.ai_schedule_suggestions s
    where s.id = 'd1111111-1111-1111-1111-111111111111'),
  null,
  'the confirmed ad-hoc suggestion is stamped accepted'
);

-- ---------------------------------------------------------------------------
-- Repeating the confirmation is idempotent.
-- ---------------------------------------------------------------------------

select is(
  (select status from public.confirm_ai_schedule_suggestion(
     '91111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111')),
  'accepted',
  'repeating an ad-hoc confirmation still reports accepted'
);

select is(
  (select count(*)::int from public.events e
    where e.user_id = '91111111-1111-1111-1111-111111111111'),
  1,
  'repeating an ad-hoc confirmation creates no duplicate event'
);

-- ---------------------------------------------------------------------------
-- The deterministic guards still apply to ad-hoc blocks.
-- ---------------------------------------------------------------------------

insert into public.events (
  user_id, calendar_id, title, start_at, end_at, all_day, timezone, status, source_type
)
select '92222222-2222-2222-2222-222222222222', c.id, 'Already booked',
       '2099-03-11T14:00:00Z', '2099-03-11T15:00:00Z', false, 'UTC', 'confirmed', 'internal'
  from public.calendars c
 where c.user_id = '92222222-2222-2222-2222-222222222222' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
     '92222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222')),
  'stale',
  'an ad-hoc slot that is now occupied is stale'
);

select is(
  (select count(*)::int from public.events e
    where e.user_id = '92222222-2222-2222-2222-222222222222'),
  1,
  'a stale ad-hoc confirmation writes no event'
);

select is(
  (select status from public.confirm_ai_schedule_suggestion(
     '93333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333')),
  'stale',
  'a task-less request carrying a task_version is rejected as stale'
);

select is(
  (select status from public.confirm_ai_schedule_suggestion(
     '94444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444')),
  'stale',
  'an ad-hoc suggestion whose start time has passed is stale'
);

select * from finish();
rollback;
