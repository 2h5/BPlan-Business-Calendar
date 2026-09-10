begin;

create extension if not exists pgtap;

select plan(12);

-- Setup test user. The auth trigger automatically creates profile and default internal calendar.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  '91111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'nl_intent_test@example.com',
  now(),
  now()
)
on conflict (id) do nothing;

-- 1. Target check constraint: permits raw text ad-hoc request
select lives_ok(
  $$
    insert into public.ai_schedule_requests (id, user_id, raw_text, status)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '91111111-1111-1111-1111-111111111111', 'meeting with Andrew lasting 15m', 'pending')
  $$,
  'Allows inserting a request with raw_text and no task_id'
);

-- 2. Target check constraint: rejects request with both task_id and raw_text
select throws_ok(
  $$
    insert into public.ai_schedule_requests (user_id, task_id, raw_text, status)
    values ('91111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'meeting with Andrew', 'pending')
  $$,
  '23514',
  null,
  'Rejects request with both task_id and raw_text'
);

-- 3. Target check constraint: rejects request with null task_id, null raw_text, and null title
select throws_ok(
  $$
    insert into public.ai_schedule_requests (user_id, status)
    values ('91111111-1111-1111-1111-111111111111', 'pending')
  $$,
  '23514',
  null,
  'Rejects request with no task_id, no raw_text, and no title/duration'
);

-- 4. claim_ai_schedule_request with p_raw_text
select isnt_empty(
  $$
    select public.claim_ai_schedule_request(
      '91111111-1111-1111-1111-111111111111'::uuid,
      null::uuid,
      10,
      null::text,
      null::integer,
      'deep work Saturday afternoon'::text
    )
  $$,
  'claim_ai_schedule_request claims with raw text successfully'
);

-- 5. Verify the claimed request stored raw_text and status pending
select is(
  (
    select raw_text
    from public.ai_schedule_requests
    where user_id = '91111111-1111-1111-1111-111111111111'
      and raw_text = 'deep work Saturday afternoon'
    limit 1
  ),
  'deep work Saturday afternoon',
  'Claimed request stored the raw_text verbatim'
);

-- 6. Rate limit overrides table still works with raw_text claims
insert into public.ai_rate_limit_overrides (user_id, rate_limit_per_hour, note)
values ('91111111-1111-1111-1111-111111111111', 2, 'dev test limit of 2')
on conflict (user_id) do update set rate_limit_per_hour = 2;

-- We already have 2 requests created above for this user. A third claim should be rate limited (return null)
select is(
  public.claim_ai_schedule_request(
    '91111111-1111-1111-1111-111111111111'::uuid,
    null::uuid,
    10,
    null::text,
    null::integer,
    'attempt 3 should fail'::text
  ),
  null,
  'claim_ai_schedule_request respects rate limit overrides and returns null when limit exceeded'
);

-- Clean up the rate limit override so subsequent tests aren't blocked
delete from public.ai_rate_limit_overrides where user_id = '91111111-1111-1111-1111-111111111111';

-- 7. Test ad_hoc_location and ad_hoc_description columns on ai_schedule_requests
insert into public.ai_schedule_requests (
  id, user_id, raw_text, ad_hoc_title, ad_hoc_duration_minutes,
  ad_hoc_location, ad_hoc_description, status, target_calendar_id,
  profile_version, target_calendar_version, constraints
)
select
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '91111111-1111-1111-1111-111111111111',
  'dentist next Tuesday around 2 at the Paramus office',
  'Dentist appointment',
  60,
  'Paramus office',
  'Annual dental checkup',
  'proposed',
  c.id,
  p.updated_at,
  c.updated_at,
  '{"bufferMinutes": 0}'::jsonb
from public.profiles p
join public.calendars c on c.user_id = p.id and c.is_default
where p.id = '91111111-1111-1111-1111-111111111111';

-- Add a suggestion for this request
insert into public.ai_schedule_suggestions (
  id, request_id, slot_id, start_at, end_at, rank, score, reason
)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'candidate_slot_1',
  now() + interval '1 day',
  now() + interval '1 day 1 hour',
  1,
  0.95,
  'Optimal afternoon time'
);

-- 7. Check the row exists
select is(
  (select ad_hoc_location from public.ai_schedule_requests where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'Paramus office',
  'ad_hoc_location is correctly persisted'
);

-- 8. Confirm the suggestion
select isnt_empty(
  $$
    select * from public.confirm_ai_schedule_suggestion(
      '91111111-1111-1111-1111-111111111111'::uuid,
      'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    ) where status = 'accepted'
  $$,
  'confirm_ai_schedule_suggestion accepts the suggestion'
);

-- 9. Verify the created event has the title from ad_hoc_title
select is(
  (
    select e.title
    from public.events e
    join public.ai_schedule_requests r on r.accepted_event_id = e.id
    where r.id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'Dentist appointment',
  'Created event carries ad_hoc_title'
);

-- 10. Verify the created event carries ad_hoc_location
select is(
  (
    select e.location
    from public.events e
    join public.ai_schedule_requests r on r.accepted_event_id = e.id
    where r.id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'Paramus office',
  'Created event carries ad_hoc_location from request'
);

-- 11. Verify the created event carries ad_hoc_description
select is(
  (
    select e.description
    from public.events e
    join public.ai_schedule_requests r on r.accepted_event_id = e.id
    where r.id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'Annual dental checkup',
  'Created event carries ad_hoc_description from request'
);

-- 12. Confirming again is idempotent and returns the same accepted event
select is(
  (
    select event_id
    from public.confirm_ai_schedule_suggestion(
      '91111111-1111-1111-1111-111111111111'::uuid,
      'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    )
  ),
  (
    select accepted_event_id
    from public.ai_schedule_requests
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'Repeated confirmation returns the identical accepted event id'
);

select * from finish();

rollback;
