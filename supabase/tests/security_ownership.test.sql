-- ============================================================================
-- Cross-owner relationship and privilege-boundary regressions.
-- Run with: supabase test db
--
-- Row ownership on a child row is not enough when the child can point at a
-- parent owned by another user. These tests exercise the same authenticated
-- role used by PostgREST, while fixtures are created as the database owner.
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(22);

-- --- fixtures --------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '12121212-1212-1212-1212-121212121212',
   'authenticated', 'authenticated', 'ownership-alice@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '23232323-2323-2323-2323-232323232323',
   'authenticated', 'authenticated', 'ownership-bob@example.com', now(), now());

insert into public.provider_accounts (
  id, user_id, provider, provider_user_id, email
)
values
  ('33333333-3333-3333-3333-333333333333',
   '12121212-1212-1212-1212-121212121212',
   'google', 'ownership-google-alice', 'ownership-alice@example.com'),
  ('34343434-3434-3434-3434-343434343434',
   '23232323-2323-2323-2323-232323232323',
   'google', 'ownership-google-bob', 'ownership-bob@example.com');

insert into public.calendars (
  id, user_id, name, source_type, provider_account_id, provider_calendar_id
)
values
  ('41414141-4141-4141-4141-414141414141',
   '12121212-1212-1212-1212-121212121212', 'Alice internal', 'internal', null, null),
  ('42424242-4242-4242-4242-424242424242',
   '23232323-2323-2323-2323-232323232323', 'Bob internal', 'internal', null, null),
  ('43434343-4343-4343-4343-434343434343',
   '12121212-1212-1212-1212-121212121212', 'Alice Google', 'google',
   '33333333-3333-3333-3333-333333333333', 'ownership-alice-calendar'),
  ('44444444-4444-4444-4444-444444444444',
   '23232323-2323-2323-2323-232323232323', 'Bob Google', 'google',
   '34343434-3434-3434-3434-343434343434', 'ownership-bob-calendar');

insert into public.task_lists (id, user_id, name)
values
  ('51515151-5151-5151-5151-515151515151',
   '12121212-1212-1212-1212-121212121212', 'Alice list'),
  ('52525252-5252-5252-5252-525252525252',
   '23232323-2323-2323-2323-232323232323', 'Bob list');

insert into public.events (
  id, user_id, calendar_id, title, start_at, end_at
)
values
  ('61616161-6161-6161-6161-616161616161',
   '12121212-1212-1212-1212-121212121212',
   '41414141-4141-4141-4141-414141414141', 'Alice event',
   '2040-01-02 10:00:00+00', '2040-01-02 11:00:00+00'),
  ('62626262-6262-6262-6262-626262626262',
   '23232323-2323-2323-2323-232323232323',
   '42424242-4242-4242-4242-424242424242', 'Bob internal event',
   '2040-01-02 12:00:00+00', '2040-01-02 13:00:00+00'),
  ('63636363-6363-6363-6363-636363636363',
   '23232323-2323-2323-2323-232323232323',
   '44444444-4444-4444-4444-444444444444', 'Bob provider event',
   '2040-01-02 14:00:00+00', '2040-01-02 15:00:00+00');

insert into public.calendar_sync_states (
  provider_account_id, calendar_id, provider_calendar_id, last_full_sync_at
)
values (
  '33333333-3333-3333-3333-333333333333',
  '43434343-4343-4343-4343-434343434343',
  'ownership-alice-calendar', '2040-01-02 09:00:00+00'
);

-- The relationship checks below are meaningful only when the client role is
-- actually subject to row-level security.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.calendars'::regclass),
  'RLS is enabled on calendars'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'RLS is enabled on events'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'RLS is enabled on tasks'
);

-- --- privilege boundary ----------------------------------------------------
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon cannot execute public security-definer functions'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'authenticated cannot execute public security-definer functions'
);

-- --- client view isolation -------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"23232323-2323-2323-2323-232323232323","role":"authenticated"}';

select is(
  (select count(*)::int from public.provider_accounts_public),
  1,
  'Bob sees only his provider connection in the public view'
);

select is(
  (select count(*)::int from public.calendar_sync_health),
  0,
  'Bob cannot see Alice sync health through the owner-filtered view'
);

set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

select is(
  (select count(*)::int from public.provider_accounts_public),
  1,
  'Alice sees her provider connection in the public view'
);

select is(
  (select count(*)::int from public.calendar_sync_health),
  1,
  'Alice sees her own sync health through the owner-filtered view'
);

-- --- valid same-owner writes remain allowed -------------------------------
set local request.jwt.claims = '{"sub":"23232323-2323-2323-2323-232323232323","role":"authenticated"}';

select lives_ok(
  $$insert into public.calendars (
      id, user_id, name, source_type, provider_account_id, provider_calendar_id
    ) values (
      '81818181-8181-8181-8181-818181818181',
      '23232323-2323-2323-2323-232323232323', 'Bob extra Google', 'google',
      '34343434-3434-3434-3434-343434343434', 'ownership-bob-extra-calendar'
    )$$,
  'Bob can create a calendar tied to Bob provider account'
);

select lives_ok(
  $$insert into public.events (
      id, user_id, calendar_id, title, start_at, end_at,
      source_type, provider_account_id, provider_event_id
    ) values (
      '82828282-8282-8282-8282-828282828282',
      '23232323-2323-2323-2323-232323232323',
      '44444444-4444-4444-4444-444444444444', 'Bob extra event',
      '2040-01-03 10:00:00+00', '2040-01-03 11:00:00+00',
      'google', '34343434-3434-3434-3434-343434343434',
      'ownership-bob-extra-event'
    )$$,
  'Bob can create an event tied to Bob calendar and provider account'
);

select lives_ok(
  $$insert into public.tasks (
      id, user_id, list_id, scheduled_event_id, title
    ) values (
      '83838383-8383-8383-8383-838383838383',
      '23232323-2323-2323-2323-232323232323',
      '52525252-5252-5252-5252-525252525252',
      '62626262-6262-6262-6262-626262626262', 'Bob extra task'
    )$$,
  'Bob can create a task tied to Bob list and event'
);

-- --- cross-owner relationship writes must fail ---------------------------
select throws_ok(
  $$insert into public.calendars (
      id, user_id, name, source_type, provider_account_id, provider_calendar_id
    ) values (
      '91919191-9191-9191-9191-919191919191',
      '23232323-2323-2323-2323-232323232323', 'Forged Alice account', 'google',
      '33333333-3333-3333-3333-333333333333', 'forged-calendar'
    )$$,
  '42501', null,
  'Bob cannot create a calendar tied to Alice provider account'
);

select throws_ok(
  $$update public.calendars
    set provider_account_id = '33333333-3333-3333-3333-333333333333'
    where id = '44444444-4444-4444-4444-444444444444'$$,
  '42501', null,
  'Bob cannot retarget his calendar to Alice provider account'
);

select throws_ok(
  $$insert into public.events (
      id, user_id, calendar_id, title, start_at, end_at
    ) values (
      '92929292-9292-9292-9292-929292929292',
      '23232323-2323-2323-2323-232323232323',
      '41414141-4141-4141-4141-414141414141', 'Forged Alice calendar',
      '2040-01-04 10:00:00+00', '2040-01-04 11:00:00+00'
    )$$,
  '42501', null,
  'Bob cannot create an event in Alice calendar'
);

select throws_ok(
  $$insert into public.events (
      id, user_id, calendar_id, title, start_at, end_at,
      source_type, provider_account_id, provider_event_id
    ) values (
      '93939393-9393-9393-9393-939393939393',
      '23232323-2323-2323-2323-232323232323',
      '42424242-4242-4242-4242-424242424242', 'Forged Alice account event',
      '2040-01-04 12:00:00+00', '2040-01-04 13:00:00+00',
      'google', '33333333-3333-3333-3333-333333333333',
      'forged-provider-event'
    )$$,
  '42501', null,
  'Bob cannot create an event tied to Alice provider account'
);

select throws_ok(
  $$update public.events
    set calendar_id = '41414141-4141-4141-4141-414141414141'
    where id = '62626262-6262-6262-6262-626262626262'$$,
  '42501', null,
  'Bob cannot move his event into Alice calendar'
);

select throws_ok(
  $$update public.events
    set provider_account_id = '33333333-3333-3333-3333-333333333333'
    where id = '63636363-6363-6363-6363-636363636363'$$,
  '42501', null,
  'Bob cannot retarget his event to Alice provider account'
);

select throws_ok(
  $$insert into public.tasks (id, user_id, list_id, title)
    values (
      '94949494-9494-9494-9494-949494949494',
      '23232323-2323-2323-2323-232323232323',
      '51515151-5151-5151-5151-515151515151', 'Forged Alice list task'
    )$$,
  '42501', null,
  'Bob cannot create a task in Alice list'
);

select throws_ok(
  $$update public.tasks
    set list_id = '51515151-5151-5151-5151-515151515151'
    where id = '83838383-8383-8383-8383-838383838383'$$,
  '42501', null,
  'Bob cannot move his task into Alice list'
);

select throws_ok(
  $$insert into public.tasks (id, user_id, scheduled_event_id, title)
    values (
      '95959595-9595-9595-9595-959595959595',
      '23232323-2323-2323-2323-232323232323',
      '61616161-6161-6161-6161-616161616161', 'Forged Alice event task'
    )$$,
  '42501', null,
  'Bob cannot create a task linked to Alice event'
);

select throws_ok(
  $$update public.tasks
    set scheduled_event_id = '61616161-6161-6161-6161-616161616161'
    where id = '83838383-8383-8383-8383-838383838383'$$,
  '42501', null,
  'Bob cannot link his task to Alice event'
);

reset role;

select * from finish();
rollback;
